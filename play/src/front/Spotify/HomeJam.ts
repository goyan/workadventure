import { isHomeJam, listeningZoneJamKey } from "@workadventure/map-editor";
import { derived, get, type Readable, type Unsubscriber, writable } from "svelte/store";
import { z } from "zod";
import type { SpotifyPlaybackRequest } from "../Interfaces/DesktopAppInterfaces";
import type { JukeboxQueue, JukeboxTrack, WorkAdventureDesktopApi } from "../Interfaces/DesktopAppInterfaces";
import type { JamRoom } from "../ListeningZone/ListeningZoneController";
import type { JoinedJam } from "../ListeningZone/ListeningZoneStore";
import type { ListeningByUserUuid } from "./SpotifyListeningDirectory";

/** A Jukebox guest asks its host, through the room server (which sets the sender), to queue tracks. */
export const HOME_JAM_QUEUE_EVENT = "workadventure.home-jam-queue";
/** A participant asks the host to remove a track from the queue. */
export const JUKEBOX_REMOVE_EVENT = "workadventure.jukebox-remove";
/** The host's queue, sent to everyone on every change and to whoever asks for it. */
export const JUKEBOX_STATE_EVENT = "workadventure.jukebox-state";
/** The one who added a track (or the host) moves it up or down the queue. */
export const JUKEBOX_MOVE_EVENT = "workadventure.jukebox-move";
/** Someone opening a Jukebox's queue asks its host for it. */
export const JUKEBOX_STATE_REQUEST_EVENT = "workadventure.jukebox-state-request";
/** Same limit as the desktop app and the extension. */
const MAX_TRACKS_PER_REQUEST = 5;
/** A guest cannot flood the host: requests beyond that, within a minute, are dropped. */
const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_SHOWN_QUEUE = 30;
const MAX_SHOWN_UPCOMING = 20;

const trackUri = z.string().regex(/^spotify:track:[A-Za-z0-9]+$/);
const queueUid = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const QueueRequest = z.object({ uris: z.array(trackUri).min(1).max(MAX_TRACKS_PER_REQUEST) });
const RemoveRequest = z.object({ uri: trackUri, uid: queueUid });
/** One step up or down (buttons), or just before or after another track of the same list (drag and drop). */
const Placement = z.union([
    z.object({ direction: z.enum(["up", "down"]) }),
    z.object({ before: queueUid }),
    z.object({ after: queueUid }),
]);
export type MovePlacement = z.infer<typeof Placement>;
export type MoveDirection = "up" | "down";
const MoveRequest = z.intersection(RemoveRequest, Placement);
const artworkUrl = z.union([z.literal(""), z.string().startsWith("https://i.scdn.co/image/").max(200)]);
const JukeboxState = z.object({
    tracks: z
        .array(
            z.object({
                uri: trackUri,
                uid: queueUid,
                title: z.string().max(200),
                artist: z.string().max(200),
                artworkUrl,
                addedBy: z.string().max(100),
                addedByUuid: z.string().max(256),
            }),
        )
        .max(MAX_SHOWN_QUEUE),
    // Older hosts send the queue only.
    upcoming: z
        .array(
            z.object({
                uri: trackUri,
                uid: queueUid.optional().catch(undefined),
                title: z.string().max(200),
                artist: z.string().max(200),
                artworkUrl,
            }),
        )
        .max(MAX_SHOWN_UPCOMING)
        .default([]),
    contextName: z.string().max(200).default(""),
});

/** What each Jukebox plays next, by host uuid, as its host last sent it. */
export const jukeboxQueuesStore = writable<ReadonlyMap<string, JukeboxQueue>>(new Map());

/** What the Jukebox views can do; set while the game runs. */
let actions:
    | {
          playback: (room: JamRoom, request: SpotifyPlaybackRequest) => void;
          request: (hostUuid: string) => void;
          add: (room: JamRoom, uri: string) => void;
          remove: (room: JamRoom, track: Pick<JukeboxTrack, "uri" | "uid">) => void;
          move: (room: JamRoom, track: Pick<JukeboxTrack, "uri" | "uid">, placement: MovePlacement) => void;
      }
    | undefined;

/** Only the creator can control their active Jukebox; guests never send playback commands to the host. */
export function controlJukeboxPlayback(room: JamRoom, request: SpotifyPlaybackRequest): void {
    actions?.playback(room, request);
}

/** Asks the host of a Jukebox for its queue, to show it. */
export function requestJukeboxQueue(hostUuid: string): void {
    actions?.request(hostUuid);
}

/** Adds a track to a Jukebox: directly for its host, through the host for a participant. */
export function addToJukebox(room: JamRoom, uri: string): void {
    actions?.add(room, uri);
}

/** Removes a track from a Jukebox: directly for its host, through the host (who checks the DJ mode) otherwise. */
export function removeFromJukebox(room: JamRoom, track: Pick<JukeboxTrack, "uri" | "uid">): void {
    actions?.remove(room, track);
}

/** Moves a track up or down a Jukebox's queue: directly for its host, through the host for the one who added it. */
export function moveInJukebox(
    room: JamRoom,
    track: Pick<JukeboxTrack, "uri" | "uid">,
    placement: MoveDirection | MovePlacement,
): void {
    actions?.move(room, track, typeof placement === "string" ? { direction: placement } : placement);
}

/** Saves a track to the Liked Songs of this computer's Spotify; false without the desktop app and the extension. */
export function likeTrack(uri: string, desktop: WorkAdventureDesktopApi | undefined = window.WAD): boolean {
    if (!trackUri.safeParse(uri).success || !desktop?.likeOnSpotify) return false;
    desktop.likeOnSpotify({ uri });
    return true;
}

/** `spotify:track:<id>` from a track link or URI pasted by the user; undefined for anything else. */
export function trackUriOf(input: string): string | undefined {
    const value = input.trim();
    if (trackUri.safeParse(value).success) return value;
    try {
        const url = new URL(value);
        const [, kind, id] = url.pathname.split("/");
        return url.hostname === "open.spotify.com" && kind === "track" && id && /^[A-Za-z0-9]+$/.test(id)
            ? `spotify:track:${id}`
            : undefined;
    } catch {
        return undefined;
    }
}

export interface HomeJamContext {
    /** Every Jam room of the map, with the zone it was opened in. */
    rooms: Readable<JamRoom[]>;
    joined: Readable<JoinedJam | undefined>;
    listeningByUserUuid: Readable<ListeningByUserUuid>;
    localUuid: () => string | undefined;
    /** The connected user with this uuid (id and name), undefined when they are not in the room. */
    userByUuid: (uuid: string) => { id: number; name: string } | undefined;
    userById: (id: number) => { uuid: string; name: string } | undefined;
    /** Sends an event through the room server: to these users, or to everyone for an empty list. */
    send: (name: string, data: unknown, userIds: number[]) => void;
    /** Events received from other users: name, data and the sender's id as set by the room server. */
    onEvent: (listener: (name: string, data: unknown, senderId: number | undefined) => void) => Unsubscriber;
    desktop: WorkAdventureDesktopApi | undefined;
    now?: () => number;
}

/**
 * Wires the Jukebox (a home Jam: guests' Spotify apps play the host's tracks). Everyone keeps the queues hosts send,
 * to show them. With the desktop app: a guest's Spotify offers "add to the Jukebox" (right click), and the host's
 * desktop app shares its queue, adds the participants' tracks and removes tracks. The host only obeys users taking
 * part in its Jukebox (they publish it in their listening); the DJ mode keeps removals to the host.
 */
export function startHomeJam(context: HomeJamContext): Unsubscriber {
    const { desktop } = context;
    const now = context.now ?? Date.now;
    const requestsBySender = new Map<number, number[]>();

    const ownJukebox = derived(context.rooms, (rooms) =>
        rooms.find(({ jam }) => isHomeJam(jam) && jam.hostUuid === context.localUuid()),
    );
    /** The Jukebox room this user takes part in as a guest. */
    const guestOf = derived(
        [context.rooms, context.joined],
        ([rooms, joined]) =>
            rooms.find(
                ({ jam }) =>
                    isHomeJam(jam) && jam.hostUuid !== context.localUuid() && joined?.url === listeningZoneJamKey(jam),
            ) ?? null,
    );

    const sendTo = (uuid: string, name: string, data: unknown) => {
        const user = context.userByUuid(uuid);
        if (user) context.send(name, data, [user.id]);
    };
    const ownState = (): JukeboxQueue =>
        get(jukeboxQueuesStore).get(context.localUuid() ?? "") ?? { tracks: [], upcoming: [], contextName: "" };
    const ownQueue = () => ownState().tracks;
    const addedByOf = (uid: string) => ownQueue().find((track) => track.uid === uid)?.addedByUuid ?? "";
    const setQueue = (hostUuid: string, queue: JukeboxQueue) =>
        jukeboxQueuesStore.update((queues) => new Map(queues).set(hostUuid, queue));

    /**
     * Where a track moves: just before the previous one, or just after the next one, within its own list (the tracks
     * added to the queue, or the rest of the playlist).
     */
    const moveTarget = (uid: string, placement: MovePlacement) => {
        const { tracks, upcoming } = ownState();
        const list: { uri: string; uid?: string }[] = tracks.some((track) => track.uid === uid) ? tracks : upcoming;
        const index = list.findIndex((track) => track.uid === uid);
        if (index < 0) return undefined;
        let target: { uri: string; uid?: string } | undefined;
        if ("direction" in placement) {
            target = list[placement.direction === "up" ? index - 1 : index + 1];
        } else {
            const targetUid = "before" in placement ? placement.before : placement.after;
            target = targetUid !== uid ? list.find((track) => track.uid === targetUid) : undefined;
        }
        if (!target?.uid) return undefined;
        const entry = { uri: target.uri, uid: target.uid };
        const before = "direction" in placement ? placement.direction === "up" : "before" in placement;
        return before ? { before: entry } : { after: entry };
    };

    /** A participant of our Jukebox, within the rate limit: the only users a host obeys. */
    const acceptFromParticipant = (senderId: number): { uuid: string; name: string } | undefined => {
        const own = get(ownJukebox);
        const sender = context.userById(senderId);
        if (!own || !sender) return undefined;
        const listening = get(context.listeningByUserUuid).get(sender.uuid);
        if (listening?.jamAreaId !== own.zone.areaId || listening.jamHostUuid !== context.localUuid()) return undefined;
        const recent = (requestsBySender.get(senderId) ?? []).filter((at) => now() - at < 60_000);
        if (recent.length >= MAX_REQUESTS_PER_MINUTE) return undefined;
        requestsBySender.set(senderId, [...recent, now()]);
        return sender;
    };

    actions = {
        playback: (room, request) => {
            const own = get(ownJukebox);
            if (
                !own ||
                !isHomeJam(room.jam) ||
                listeningZoneJamKey(own.jam) !== listeningZoneJamKey(room.jam) ||
                own.zone.areaId !== room.zone.areaId ||
                own.zone.propertyId !== room.zone.propertyId
            )
                return;
            desktop?.controlSpotifyPlayback?.(request);
        },
        request: (hostUuid) => {
            if (hostUuid !== context.localUuid()) sendTo(hostUuid, JUKEBOX_STATE_REQUEST_EVENT, {});
            else desktop?.refreshSpotifyQueue?.();
        },
        add: (room, uri) => {
            const request = QueueRequest.safeParse({ uris: [uri] });
            if (!request.success) return;
            if (room.jam.hostUuid === context.localUuid()) {
                desktop?.enqueueOnSpotify?.({ uris: request.data.uris, from: "" });
            } else {
                sendTo(room.jam.hostUuid, HOME_JAM_QUEUE_EVENT, request.data);
            }
        },
        remove: (room, track) => {
            const request = RemoveRequest.safeParse(track);
            if (!request.success) return;
            if (room.jam.hostUuid === context.localUuid()) {
                desktop?.dequeueOnSpotify?.(request.data);
            } else {
                sendTo(room.jam.hostUuid, JUKEBOX_REMOVE_EVENT, request.data);
            }
        },
        move: (room, track, placement) => {
            const request = MoveRequest.safeParse({ uri: track.uri, uid: track.uid, ...placement });
            if (!request.success) return;
            if (room.jam.hostUuid === context.localUuid()) {
                const target = moveTarget(request.data.uid, placement);
                if (target) desktop?.moveInSpotifyQueue?.({ uri: request.data.uri, uid: request.data.uid, ...target });
            } else {
                sendTo(room.jam.hostUuid, JUKEBOX_MOVE_EVENT, request.data);
            }
        },
    };

    const unsubscribeEvents = context.onEvent((name, data, senderId) => {
        if (senderId === undefined) return;
        if (name === JUKEBOX_STATE_EVENT) {
            // Only the host of a Jukebox speaks for its queue.
            const sender = context.userById(senderId);
            const state = JukeboxState.safeParse(data);
            const isHost = get(context.rooms).some(({ jam }) => isHomeJam(jam) && jam.hostUuid === sender?.uuid);
            if (sender && state.success && isHost) setQueue(sender.uuid, state.data);
        } else if (name === JUKEBOX_STATE_REQUEST_EVENT) {
            if (get(ownJukebox)) context.send(JUKEBOX_STATE_EVENT, ownState(), [senderId]);
        } else if (name === HOME_JAM_QUEUE_EVENT) {
            const request = QueueRequest.safeParse(data);
            const sender = request.success ? acceptFromParticipant(senderId) : undefined;
            if (request.success && sender) {
                desktop?.enqueueOnSpotify?.({ uris: request.data.uris, from: sender.name, fromUuid: sender.uuid });
            }
        } else if (name === JUKEBOX_REMOVE_EVENT) {
            const request = RemoveRequest.safeParse(data);
            const own = get(ownJukebox);
            const djMode = own !== undefined && isHomeJam(own.jam) && own.jam.djMode === true;
            const sender = request.success ? acceptFromParticipant(senderId) : undefined;
            // The one who added a track may always remove it; the DJ mode only stops the others.
            if (request.success && sender && (!djMode || addedByOf(request.data.uid) === sender.uuid)) {
                desktop?.dequeueOnSpotify?.(request.data);
            }
        } else if (name === JUKEBOX_MOVE_EVENT) {
            const request = MoveRequest.safeParse(data);
            const sender = request.success ? acceptFromParticipant(senderId) : undefined;
            const target = request.success ? moveTarget(request.data.uid, request.data) : undefined;
            if (request.success && sender && target && addedByOf(request.data.uid) === sender.uuid) {
                desktop?.moveInSpotifyQueue?.({ uri: request.data.uri, uid: request.data.uid, ...target });
            }
        }
    });

    // The host shares its Spotify queue while hosting a Jukebox.
    let stopWatchingQueue: (() => void) | undefined;
    const unsubscribeOwn = ownJukebox.subscribe((own) => {
        const watchSpotifyQueue = desktop?.watchSpotifyQueue;
        if (own && !stopWatchingQueue && watchSpotifyQueue) {
            stopWatchingQueue = watchSpotifyQueue((queue) => {
                // Older desktop apps send the queue only.
                const state = JukeboxState.safeParse(Array.isArray(queue) ? { tracks: queue } : queue);
                if (!state.success) return;
                setQueue(context.localUuid() ?? "", state.data);
                context.send(JUKEBOX_STATE_EVENT, state.data, []);
            });
        } else if (!own && stopWatchingQueue) {
            stopWatchingQueue();
            stopWatchingQueue = undefined;
        }
    });

    // A guest's Spotify offers "add to the Jukebox", and sends the tracks to the host.
    // Only changes are told: the desktop app starts with no Jukebox.
    let told: string | null = null;
    const unsubscribeGuest = guestOf.subscribe((room) => {
        const hostName = room ? room.jam.hostName : null;
        if (hostName === told) return;
        told = hostName;
        desktop?.setHomeJam?.(room ? { hostName: room.jam.hostName } : null);
    });
    desktop?.onQueueRequest?.((uris) => {
        const room = get(guestOf);
        const request = QueueRequest.safeParse({ uris });
        if (room && request.success) sendTo(room.jam.hostUuid, HOME_JAM_QUEUE_EVENT, request.data);
    });

    return () => {
        actions = undefined;
        unsubscribeEvents();
        unsubscribeOwn();
        stopWatchingQueue?.();
        unsubscribeGuest();
        if (told) desktop?.setHomeJam?.(null);
    };
}
