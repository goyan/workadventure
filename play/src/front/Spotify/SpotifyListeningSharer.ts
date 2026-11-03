import type { SpotifyListening } from "@workadventure/messages";
import { derived, type Readable, type Unsubscriber } from "svelte/store";
import { EMPTY_SPOTIFY_LISTENING } from "../../common/SpotifyListening";
import type { JoinedJam } from "../ListeningZone/ListeningZoneStore";
import type { SpotifyAccount } from "./SpotifyAccount";
import { type CurrentlyPlayingResult, fetchCurrentlyPlaying, type SpotifyTrack } from "./SpotifyPlayerApi";

/** Spotify has no push API for the player: we poll, at a pace that stays far below its rate limit. */
export const SPOTIFY_POLL_INTERVAL_MS = 15_000;
/** An account refused by the Spotify app stays refused until an admin registers it: no need to ask often. */
const ACCESS_DENIED_POLL_INTERVAL_MS = 5 * 60_000;

/**
 * Publishes what the local user listens to (when linked and sharing) and the Jam they joined, as their
 * `spotifyListening` in the world space.
 */
export class SpotifyListeningSharer {
    private track: SpotifyTrack | undefined;
    private jam: JoinedJam | undefined;
    private published: SpotifyListening = EMPTY_SPOTIFY_LISTENING;
    // Incremented on every start and stop, so that a poll still in flight never schedules a second loop.
    private pollGeneration = 0;
    private pollTimeout: ReturnType<typeof setTimeout> | undefined;
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
    ) {
        let sharing = false;
        this.unsubscriber = derived([account.linked, sharingEnabled, joinedJam], (values) => values).subscribe(
            ([linked, enabled, jam]) => {
                this.jam = jam;
                const shouldShare = linked && enabled;
                if (shouldShare && !sharing) {
                    this.startPolling();
                } else if (!shouldShare && sharing) {
                    this.stopPolling();
                }
                sharing = shouldShare;
                this.publishIfChanged();
            },
        );
    }

    public destroy(): void {
        this.unsubscriber();
        this.stopPolling();
    }

    private startPolling(): void {
        const generation = ++this.pollGeneration;
        this.poll(generation).catch((error) => console.error("Spotify polling stopped", error));
    }

    private stopPolling(): void {
        this.pollGeneration++;
        clearTimeout(this.pollTimeout);
        this.pollTimeout = undefined;
        this.track = undefined;
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
                this.track = undefined;
            } else if (result.status === "ok") {
                this.track = result.track;
            } else if (result.status === "unauthorized") {
                this.account.expireAccessToken();
            } else if (result.status === "forbidden") {
                this.track = undefined;
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
        const listening: SpotifyListening = {
            trackTitle: this.track?.title ?? "",
            artistName: this.track?.artist ?? "",
            trackUrl: this.track?.url ?? "",
            jamAreaId: this.jam?.areaId ?? "",
            jamAreaName: this.jam?.areaName ?? "",
        };
        if (JSON.stringify(listening) === JSON.stringify(this.published)) {
            return;
        }
        this.published = listening;
        this.publish(listening);
    }
}
