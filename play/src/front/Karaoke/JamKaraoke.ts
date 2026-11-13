import { isHomeJam, isLiveJam, listeningZoneJamKey } from "@workadventure/map-editor";
import { derived, get, readable, writable } from "svelte/store";
import type { Readable, Unsubscriber } from "svelte/store";
import { z } from "zod";
import debug from "debug";
import { LyricsTrackSchema } from "../../common/Lyrics";
import type { LyricsTrack } from "../../common/Lyrics";
import { currentPositionMs, EMPTY_SPOTIFY_LISTENING, spotifyTrackUri } from "../../common/SpotifyListening";
import type { JamRoom } from "../ListeningZone/ListeningZoneController";
import type { HomeJamContext } from "../Spotify/HomeJam";
import { jukeboxQueuesStore } from "../Spotify/HomeJam";
import type { SpotifyAccount } from "../Spotify/SpotifyAccount";
import { fetchSpotifyKaraoke, parseKaraokePlayback, parseKaraokeQueue } from "./SpotifyKaraokeApi";

const logger = debug("karaoke");
export const JAM_KARAOKE_STATE_EVENT = "workadventure.jam-karaoke-state";
export const JAM_KARAOKE_REQUEST_EVENT = "workadventure.jam-karaoke-request";

const RoomIdentity = z.object({
    areaId: z.string().min(1).max(200),
    propertyId: z.string().min(1).max(200),
    jamKey: z.string().min(1).max(2048),
});
/**
 * Why the host's playback is missing, when the host's browser knows it. Spotify's Web API knows nothing of Jams: an
 * ended Jam is never seen as such, only a player with nothing to play.
 * - `noPlayback`: the host's Spotify plays nothing (Web API 204 "Playback not available or active", or the desktop
 *   Spotify app reports no track).
 * - `noPlayer`: WorkAdventure reads no player of the host (no desktop player, Spotify not linked): the track comes
 *   from their presence only, without a position.
 * - `authorizationExpired`: Spotify rejected the host's refresh token, which unlinked their account.
 * - `accessDenied`: Spotify refuses to read the host's player (403: account not registered in the Spotify app).
 */
export const KaraokePlaybackIssueSchema = z.enum(["noPlayback", "noPlayer", "authorizationExpired", "accessDenied"]);
export type KaraokePlaybackIssue = z.infer<typeof KaraokePlaybackIssueSchema>;
const PlaybackState = z.object({
    track: LyricsTrackSchema.nullable(),
    next: LyricsTrackSchema.nullable(),
    playing: z.boolean(),
    positionMs: z.number().finite().nonnegative().max(86_400_000),
    positionAt: z.number().finite().nonnegative(),
    // Optional: older hosts do not send it, older guests drop it.
    issue: KaraokePlaybackIssueSchema.optional(),
});
const StateMessage = RoomIdentity.merge(PlaybackState);
export type KaraokePlayback = z.infer<typeof PlaybackState>;

export const karaokeStatesStore = writable<ReadonlyMap<string, z.infer<typeof StateMessage>>>(new Map());
export const selectedKaraokeRoomStore = writable<JamRoom | undefined>(undefined);

function identity(room: JamRoom): z.infer<typeof RoomIdentity> {
    return { areaId: room.zone.areaId, propertyId: room.zone.propertyId, jamKey: listeningZoneJamKey(room.jam) };
}

function sameRoom(room: JamRoom, other: z.infer<typeof RoomIdentity>): boolean {
    const own = identity(room);
    return own.areaId === other.areaId && own.propertyId === other.propertyId && own.jamKey === other.jamKey;
}

export function toggleKaraokeRoom(room: JamRoom): void {
    selectedKaraokeRoomStore.update((selected) => (selected && sameRoom(selected, identity(room)) ? undefined : room));
}

export function karaokePositionMs(state: KaraokePlayback, now: number, offsetMs = 0): number {
    const position = state.playing
        ? currentPositionMs(
              { ...EMPTY_SPOTIFY_LISTENING, positionMs: state.positionMs, positionAt: state.positionAt },
              now,
          )
        : state.positionMs;
    return Math.min(state.track?.durationMs ?? Infinity, Math.max(0, (position ?? state.positionMs) + offsetMs));
}

export interface JamKaraokeContext extends Pick<
    HomeJamContext,
    "rooms" | "listeningByUserUuid" | "localUuid" | "userByUuid" | "userById" | "send" | "onEvent" | "now"
> {
    desktop?: Pick<NonNullable<HomeJamContext["desktop"]>, "watchSpotifyPlayback" | "watchSpotifyQueue">;
    sharingEnabled?: Readable<boolean>;
    account?: Pick<SpotifyAccount, "linked" | "getAccessToken" | "expireAccessToken" | "reportAccessDenied"> &
        Partial<Pick<SpotifyAccount, "authorizationExpired">>;
    /** Where the open karaoke is remembered across a reload of the page (the tab's session storage by default). */
    memory?: KaraokeMemory;
}

export interface KaraokeMemory {
    read(): string | null;
    write(value: string | null): void;
}

const KARAOKE_MEMORY_KEY = "wa-jam-karaoke-open";
/**
 * After a reload, or when its Jam vanishes for a moment, the karaoke opens again only if the Jam is back within this
 * long: never out of the blue later.
 */
const KARAOKE_RESTORE_MS = 60_000;

/** The tab's session storage: it outlives the reload of a redeploy, and is forgotten with the tab. */
const sessionKaraokeMemory: KaraokeMemory = {
    read: () => {
        try {
            return sessionStorage.getItem(KARAOKE_MEMORY_KEY);
        } catch {
            return null;
        }
    },
    write: (value) => {
        try {
            if (value === null) sessionStorage.removeItem(KARAOKE_MEMORY_KEY);
            else sessionStorage.setItem(KARAOKE_MEMORY_KEY, value);
        } catch {
            // Storage refused (private browsing): the karaoke just does not come back after a reload.
        }
    },
};

function rememberedRoom(raw: string | null): z.infer<typeof RoomIdentity> | undefined {
    if (!raw) return undefined;
    try {
        const parsed = RoomIdentity.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : undefined;
    } catch {
        return undefined;
    }
}

/** Room-scoped metadata for Spotify/Jukebox audio listeners, authenticated by the server's event sender. */
export function startJamKaraoke(context: JamKaraokeContext): Unsubscriber {
    const now = context.now ?? Date.now;
    let own: JamRoom | undefined;
    let state: KaraokePlayback = { track: null, next: null, playing: false, positionMs: 0, positionAt: 0 };
    let stopPlayback: Unsubscriber | undefined;
    let stopQueue: Unsubscriber | undefined;
    let pollController: AbortController | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let queueRequest: Promise<void> | undefined;
    let queueNextRequestAt = 0;
    let spotifyBlockedUntil = 0;
    let hasPlayer = false;
    let desktopPlaying = false;
    let accessDenied = false;
    let lastPublished: KaraokePlayback | undefined;
    let hostGeneration = 0;
    let lastRequest = "";
    const requestTimes = new Map<number, number>();
    const blockSpotify = (delayMs: number): number => {
        spotifyBlockedUntil = Math.max(spotifyBlockedUntil, now() + delayMs);
        return spotifyBlockedUntil - now();
    };

    const publish = (next: KaraokePlayback): void => {
        if (!own) return;
        const changed =
            !lastPublished ||
            JSON.stringify({ ...next, positionMs: 0, positionAt: 0 }) !==
                JSON.stringify({ ...lastPublished, positionMs: 0, positionAt: 0 }) ||
            Math.abs(karaokePositionMs(lastPublished, next.positionAt) - next.positionMs) >= 500;
        state = next;
        const room = own;
        karaokeStatesStore.update((states) => new Map(states).set(room.jam.hostUuid, { ...identity(room), ...next }));
        if (changed) {
            lastPublished = next;
            context.send(JAM_KARAOKE_STATE_EVENT, { ...identity(own), ...next }, []);
        }
    };

    const setNext = (next: LyricsTrack | undefined): void => {
        const parsed = LyricsTrackSchema.safeParse(next);
        publish({ ...state, next: parsed.success ? parsed.data : null });
    };
    const setQueue = (queue: { tracks: LyricsTrack[]; upcoming: LyricsTrack[] }): void =>
        setNext(queue.tracks[0] ?? queue.upcoming[0]);

    /** Why no player of the host is read, the track coming from their presence only. */
    const unreadPlayerIssue = (): KaraokePlaybackIssue | undefined => {
        if (stopPlayback) return undefined;
        if (accessDenied) return "accessDenied";
        if (context.account && get(context.account.linked)) return undefined;
        return context.account?.authorizationExpired && get(context.account.authorizationExpired)
            ? "authorizationExpired"
            : "noPlayer";
    };

    const publishListening = (): void => {
        if (!own || hasPlayer) return;
        const host = get(context.listeningByUserUuid).get(own.jam.hostUuid);
        const parsed = LyricsTrackSchema.safeParse({
            title: host?.trackTitle,
            artist: host?.artistName,
            album: host?.albumName,
            uri: host ? spotifyTrackUri(host.trackUrl) : undefined,
        });
        publish({
            ...state,
            track: parsed.success ? parsed.data : null,
            playing: parsed.success,
            positionMs: host?.positionMs ?? 0,
            positionAt: host?.positionAt ?? 0,
            issue: unreadPlayerIssue(),
        });
    };

    const stopHost = (): void => {
        hostGeneration++;
        stopPlayback?.();
        stopQueue?.();
        stopPlayback = undefined;
        stopQueue = undefined;
        pollController?.abort();
        clearTimeout(pollTimer);
        pollTimer = undefined;
        queueRequest = undefined;
        queueNextRequestAt = 0;
        spotifyBlockedUntil = 0;
        hasPlayer = false;
        desktopPlaying = false;
        accessDenied = false;
        lastPublished = undefined;
        state = { track: null, next: null, playing: false, positionMs: 0, positionAt: 0 };
    };

    const readEndpoint = async (
        token: string,
        controller: AbortController,
        endpoint: "currently-playing" | "queue",
    ): Promise<number> => {
        if (
            controller.signal.aborted ||
            (context.account && !get(context.account.linked)) ||
            (endpoint === "currently-playing" && desktopPlaying)
        )
            return 5000;
        if (endpoint === "queue" && (stopQueue || (own && isHomeJam(own.jam) && context.desktop?.watchSpotifyQueue)))
            return 5000;
        if (spotifyBlockedUntil > now()) return Math.max(5000, spotifyBlockedUntil - now());
        const response = await fetchSpotifyKaraoke(token, endpoint, controller.signal);
        if (controller.signal.aborted || (context.account && !get(context.account.linked))) return 5000;
        if (response.status === 401) {
            context.account?.expireAccessToken();
            return 30_000;
        }
        if (response.status === 403) {
            // The queue needs an additional scope: its refusal must not suspend allowed playback reads.
            if (endpoint === "currently-playing") {
                context.account?.reportAccessDenied();
                accessDenied = true;
                hasPlayer = false;
                publishListening();
            }
            return 300_000;
        }
        if (response.status === 429) {
            const delayMs = Math.max(5000, Number(response.headers.get("Retry-After")) * 1000 || 60_000);
            return blockSpotify(delayMs);
        }
        if (endpoint === "currently-playing" && response.ok) accessDenied = false;
        if (endpoint === "currently-playing" && response.status === 204 && !desktopPlaying) {
            hasPlayer = true;
            publish({ ...state, track: null, playing: false, positionMs: 0, positionAt: now(), issue: "noPlayback" });
        } else if (response.ok) {
            const json: unknown = await response.json();
            if (controller.signal.aborted) return 5000;
            if (endpoint === "currently-playing" && !desktopPlaying) {
                const playback = parseKaraokePlayback(json);
                if (playback) {
                    hasPlayer = true;
                    publish({ ...state, ...playback, positionAt: now(), issue: undefined });
                }
            } else if (endpoint === "queue") {
                setNext(parseKaraokeQueue(json));
            }
        }
        return 5000;
    };

    const poll = async (controller: AbortController): Promise<void> => {
        const refresh = async (): Promise<number> => {
            if (!context.account || !get(context.account.linked)) return 5000;
            const token = await context.account.getAccessToken();
            if (!token || controller.signal.aborted) return 5000;
            const playbackDelay = await readEndpoint(token, controller, "currently-playing");
            if (playbackDelay !== 5000) return playbackDelay;
            if (!queueRequest && !controller.signal.aborted && now() >= queueNextRequestAt) {
                const generation = hostGeneration;
                // One queue lookup may run beside playback; a slow forecast never holds the current track.
                queueRequest = readEndpoint(token, controller, "queue")
                    .then((delayMs) => {
                        if (generation === hostGeneration) queueNextRequestAt = now() + delayMs;
                    })
                    .catch((error: unknown) => {
                        if (!controller.signal.aborted) logger("Queue refresh failed", { error });
                        if (generation === hostGeneration) queueNextRequestAt = now() + 5000;
                    })
                    .finally(() => {
                        if (generation === hostGeneration) queueRequest = undefined;
                    });
            }
            return playbackDelay;
        };
        const delayMs = await refresh().catch((error: unknown) => {
            if (!controller.signal.aborted) logger("Playback refresh failed", { error });
            return 5000;
        });
        if (!controller.signal.aborted) {
            pollTimer = setTimeout(() => {
                poll(controller).catch((error) => logger("Playback polling stopped", { error }));
            }, delayMs);
        }
    };

    const startHost = (): void => {
        const generation = hostGeneration;
        stopPlayback = context.desktop?.watchSpotifyPlayback?.((playback) => {
            if (!own || generation !== hostGeneration) return;
            desktopPlaying = playback?.track !== null && playback?.track !== undefined;
            if (!playback) {
                hasPlayer = false;
                publish({
                    ...state,
                    track: null,
                    playing: false,
                    positionMs: 0,
                    positionAt: now(),
                    issue: "noPlayback",
                });
                return;
            }
            const parsed = LyricsTrackSchema.safeParse({
                title: playback.track?.title,
                artist: playback.track?.artist,
                durationMs: playback.durationMs || undefined,
                uri: playback.track?.uri,
            });
            hasPlayer = true;
            const listening = get(context.listeningByUserUuid).get(context.localUuid() ?? "");
            const album = listening?.trackTitle === playback.track?.title ? listening?.albumName : undefined;
            publish({
                ...state,
                track: parsed.success ? { ...parsed.data, ...(album ? { album } : {}) } : null,
                playing: playback.playing,
                positionMs: playback.positionMs,
                positionAt: now(),
                issue: undefined,
            });
        });
        if (own && !isHomeJam(own.jam)) {
            stopQueue = context.desktop?.watchSpotifyQueue?.((queue) => {
                if (!own || generation !== hostGeneration) return;
                const entries = Array.isArray(queue) ? { tracks: queue, upcoming: [] } : queue;
                setQueue(entries);
            });
        }
        pollController = new AbortController();
        poll(pollController).catch((error) => logger("Playback polling stopped", { error }));
        publishListening();
    };

    const unsubscribeEvents = context.onEvent((name, data, senderId) => {
        if (senderId === undefined) return;
        if (name === JAM_KARAOKE_STATE_EVENT) {
            const sender = context.userById(senderId);
            const parsed = StateMessage.safeParse(data);
            if (!sender || !parsed.success) return;
            const room = get(context.rooms).find(
                (room) => !isLiveJam(room.jam) && room.jam.hostUuid === sender.uuid && sameRoom(room, parsed.data),
            );
            if (!room) return;
            karaokeStatesStore.update((states) => new Map(states).set(sender.uuid, parsed.data));
        } else if (name === JAM_KARAOKE_REQUEST_EVENT && own) {
            const parsed = RoomIdentity.safeParse(data);
            if (!parsed.success || !sameRoom(own, parsed.data) || !context.userById(senderId)) return;
            if (now() - (requestTimes.get(senderId) ?? -Infinity) < 2000) return;
            for (const [id, at] of requestTimes) {
                if (now() - at > 60_000) requestTimes.delete(id);
            }
            if (requestTimes.size >= 4096) return;
            requestTimes.set(senderId, now());
            context.send(JAM_KARAOKE_STATE_EVENT, { ...identity(own), ...state }, [senderId]);
        }
    });

    const unsubscribeRooms = derived(
        [context.rooms, context.sharingEnabled ?? readable(true)],
        (values) => values,
    ).subscribe(([rooms, enabled]) => {
        const nextOwn = enabled
            ? rooms.find((room) => !isLiveJam(room.jam) && room.jam.hostUuid === context.localUuid())
            : undefined;
        if (own && !enabled) publish({ track: null, next: null, playing: false, positionMs: 0, positionAt: 0 });
        if ((!own && nextOwn) || (own && (!nextOwn || !sameRoom(own, identity(nextOwn))))) {
            stopHost();
            own = nextOwn;
            if (own) startHost();
        }
        karaokeStatesStore.update(
            (states) =>
                new Map(
                    [...states].filter(([uuid, state]) =>
                        rooms.some(
                            (room) => !isLiveJam(room.jam) && room.jam.hostUuid === uuid && sameRoom(room, state),
                        ),
                    ),
                ),
        );
    });
    const unsubscribeListening = context.listeningByUserUuid.subscribe(publishListening);
    const unsubscribeAccount = context.account
        ? derived(
              [context.account.linked, context.account.authorizationExpired ?? readable(false)],
              (values) => values,
          ).subscribe(([linked]) => {
              if (!linked && !desktopPlaying) {
                  hasPlayer = false;
                  publishListening();
              }
          })
        : undefined;
    const unsubscribeQueues = jukeboxQueuesStore.subscribe((queues) => {
        if (own && isHomeJam(own.jam)) {
            const queue = queues.get(own.jam.hostUuid);
            setNext(queue?.tracks[0] ?? queue?.upcoming[0]);
        }
    });
    // The karaoke that was open when the page reloaded (a redeploy): it opens again once its Jam is back.
    const memory = context.memory ?? sessionKaraokeMemory;
    let pending = rememberedRoom(memory.read());
    let pendingSince = now();
    const unsubscribeSelected = derived([context.rooms, selectedKaraokeRoomStore], (values) => values).subscribe(
        ([rooms, selected]) => {
            if (!selected) {
                lastRequest = "";
                if (pending && now() - pendingSince <= KARAOKE_RESTORE_MS) {
                    const remembered = pending;
                    const back = rooms.find((room) => !isLiveJam(room.jam) && sameRoom(room, remembered));
                    if (back) {
                        pending = undefined;
                        selectedKaraokeRoomStore.set(back);
                    }
                    return;
                }
                pending = undefined;
                memory.write(null);
                return;
            }
            pending = undefined;
            const room = rooms.find((room) => !isLiveJam(room.jam) && sameRoom(room, identity(selected)));
            // A Spotify Jam is told by its invite link: a host pasting a new one keeps the same room for its guests.
            const successor = !room
                ? rooms.find(
                      (candidate) =>
                          !isLiveJam(candidate.jam) &&
                          !isHomeJam(candidate.jam) &&
                          !isHomeJam(selected.jam) &&
                          candidate.jam.hostUuid === selected.jam.hostUuid &&
                          candidate.zone.areaId === selected.zone.areaId &&
                          candidate.zone.propertyId === selected.zone.propertyId,
                  )
                : undefined;
            if (successor) {
                selectedKaraokeRoomStore.set(successor);
                return;
            }
            if (!room) {
                // Gone for now (its host reconnects, the server restarts): wait for it a moment, remembered.
                pending = identity(selected);
                pendingSince = now();
                selectedKaraokeRoomStore.set(undefined);
                return;
            }
            if (selected !== room) selectedKaraokeRoomStore.set(room);
            const key = JSON.stringify(identity(room));
            memory.write(key);
            if (lastRequest === key) return;
            lastRequest = key;
            const host = context.userByUuid(room.jam.hostUuid);
            if (host && room.jam.hostUuid !== context.localUuid()) {
                context.send(JAM_KARAOKE_REQUEST_EVENT, identity(room), [host.id]);
            }
        },
    );

    return () => {
        unsubscribeEvents();
        unsubscribeRooms();
        unsubscribeListening();
        unsubscribeAccount?.();
        unsubscribeQueues();
        unsubscribeSelected();
        stopHost();
        selectedKaraokeRoomStore.set(undefined);
        karaokeStatesStore.set(new Map());
    };
}
