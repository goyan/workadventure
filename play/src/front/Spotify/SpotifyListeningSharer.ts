import type { SpotifyListening } from "@workadventure/messages";
import { derived, type Readable, type Unsubscriber } from "svelte/store";
import { EMPTY_SPOTIFY_LISTENING } from "../../common/SpotifyListening";
import type { JoinedJam } from "../ListeningZone/ListeningZoneStore";
import type { SpotifyAccount } from "./SpotifyAccount";
import type { LocalSpotifyPlayer } from "./LocalSpotifyPlayer";
import { type CurrentlyPlayingResult, fetchCurrentlyPlaying, type SpotifyTrack } from "./SpotifyPlayerApi";

/** Spotify has no push API for the player: we poll, at a pace that stays far below its rate limit. */
export const SPOTIFY_POLL_INTERVAL_MS = 15_000;
/** A position closer than that to the one others deduce is not published again: positions move every second. */
export const POSITION_DRIFT_MS = 3000;
/** An account refused by the Spotify app stays refused until an admin registers it: no need to ask often. */
const ACCESS_DENIED_POLL_INTERVAL_MS = 5 * 60_000;

/**
 * Publishes what the local user listens to (when sharing) and the Jam they joined, as their `spotifyListening` in
 * the world space. Both sources are read when available: the Spotify or Music app of this computer, through the
 * desktop app (`localPlayer`), and the Web API of a linked account, which also sees a phone, the web player or a
 * speaker. The local player wins while it plays: it is read more often.
 */
export class SpotifyListeningSharer {
    private localTrack: SpotifyTrack | undefined;
    private apiTrack: SpotifyTrack | undefined;
    private polling = false;
    private jam: JoinedJam | undefined;
    private published: SpotifyListening = EMPTY_SPOTIFY_LISTENING;
    // Incremented on every start and stop, so that a poll still in flight never schedules a second loop.
    private pollGeneration = 0;
    private pollTimeout: ReturnType<typeof setTimeout> | undefined;
    private stopWatchingLocalPlayer: (() => void) | undefined;
    private readonly unsubscriber: Unsubscriber;

    constructor(
        private readonly publish: (listening: SpotifyListening) => void,
        private readonly account: Pick<
            SpotifyAccount,
            "linked" | "getAccessToken" | "expireAccessToken" | "reportAccessDenied"
        >,
        sharingEnabled: Readable<boolean>,
        joinedJam: Readable<JoinedJam | undefined>,
        private readonly fetchTrack: (accessToken: string) => Promise<CurrentlyPlayingResult> = fetchCurrentlyPlaying,
        private readonly pollIntervalMs = SPOTIFY_POLL_INTERVAL_MS,
        private readonly localPlayer: LocalSpotifyPlayer | undefined = undefined,
    ) {
        this.unsubscriber = derived([account.linked, sharingEnabled, joinedJam], (values) => values).subscribe(
            ([linked, enabled, jam]) => {
                this.jam = jam;
                // The local player needs no account: sharing is enough.
                this.readLocalPlayer(enabled && localPlayer !== undefined);
                this.readWebApi(enabled && linked);
                this.publishIfChanged();
            },
        );
    }

    public destroy(): void {
        this.unsubscriber();
        this.readLocalPlayer(false);
        this.readWebApi(false);
    }

    private readLocalPlayer(read: boolean): void {
        if (read && !this.stopWatchingLocalPlayer && this.localPlayer) {
            this.stopWatchingLocalPlayer = this.localPlayer.watch((track) => {
                this.localTrack = track;
                this.publishIfChanged();
            });
        } else if (!read && this.stopWatchingLocalPlayer) {
            this.stopWatchingLocalPlayer();
            this.stopWatchingLocalPlayer = undefined;
            this.localTrack = undefined;
        }
    }

    private readWebApi(read: boolean): void {
        if (read && !this.polling) {
            this.polling = true;
            const generation = ++this.pollGeneration;
            this.poll(generation).catch((error) => console.error("Spotify polling stopped", error));
        } else if (!read && this.polling) {
            this.polling = false;
            this.pollGeneration++;
            clearTimeout(this.pollTimeout);
            this.pollTimeout = undefined;
            this.apiTrack = undefined;
        }
    }

    private async poll(generation: number): Promise<void> {
        let delay = this.pollIntervalMs;
        try {
            const accessToken = await this.account.getAccessToken();
            const result = accessToken ? await this.fetchTrack(accessToken) : undefined;
            if (generation !== this.pollGeneration) {
                return;
            }
            if (result === undefined) {
                this.apiTrack = undefined;
            } else if (result.status === "ok") {
                this.apiTrack = result.track;
            } else if (result.status === "unauthorized") {
                this.account.expireAccessToken();
            } else if (result.status === "forbidden") {
                this.apiTrack = undefined;
                this.account.reportAccessDenied();
                delay = Math.max(delay, ACCESS_DENIED_POLL_INTERVAL_MS);
            } else {
                delay = Math.max(delay, result.retryAfterMs);
            }
        } catch (error) {
            // A network hiccup keeps the last known track: the next poll will tell.
            console.warn("Could not read the Spotify player", error);
        }
        if (generation !== this.pollGeneration) {
            return;
        }
        this.publishIfChanged();
        this.pollTimeout = setTimeout(() => {
            this.poll(generation).catch((error) => console.error("Spotify polling stopped", error));
        }, delay);
    }

    private publishIfChanged(): void {
        const track = this.localTrack ?? this.apiTrack;
        const listening: SpotifyListening = {
            trackTitle: track?.title ?? "",
            artistName: track?.artist ?? "",
            trackUrl: track?.url ?? "",
            jamAreaId: this.jam?.areaId ?? "",
            jamAreaName: this.jam?.areaName ?? "",
            albumName: track?.album ?? "",
            artworkUrl: track?.artworkUrl ?? "",
            source: track?.source ?? "",
            positionMs: track?.positionMs ?? 0,
            positionAt: track?.positionAt ?? 0,
            contextUri: track?.contextUri ?? "",
            contextName: track?.contextName ?? "",
        };
        if (sameListening(listening, this.published)) {
            return;
        }
        this.published = listening;
        this.publish(listening);
    }
}

/** Same track, Jam and source, at a position others would deduce from the previous one. */
function sameListening(next: SpotifyListening, previous: SpotifyListening): boolean {
    const withoutPosition = (listening: SpotifyListening) => ({ ...listening, positionMs: 0, positionAt: 0 });
    if (JSON.stringify(withoutPosition(next)) !== JSON.stringify(withoutPosition(previous))) {
        return false;
    }
    if (next.positionAt === 0 || previous.positionAt === 0) {
        return next.positionAt === previous.positionAt;
    }
    const deduced = previous.positionMs + (next.positionAt - previous.positionAt);
    return Math.abs(deduced - next.positionMs) < POSITION_DRIFT_MS;
}
