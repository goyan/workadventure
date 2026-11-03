import type { SpotifyListening } from "@workadventure/messages";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinedJam } from "../../../src/front/ListeningZone/ListeningZoneStore";
import { SpotifyListeningSharer } from "../../../src/front/Spotify/SpotifyListeningSharer";
import type { CurrentlyPlayingResult } from "../../../src/front/Spotify/SpotifyPlayerApi";

const POLL_MS = 1_000;

const song: CurrentlyPlayingResult = {
    status: "ok",
    track: { title: "Song", artist: "Artist", url: "https://open.spotify.com/track/abc" },
};

function createHarness(options: { linked?: boolean; sharing?: boolean } = {}) {
    const linked = writable(options.linked ?? true);
    const sharing = writable(options.sharing ?? true);
    const joinedJam = writable<JoinedJam | undefined>(undefined);
    const published: SpotifyListening[] = [];
    const expireAccessToken = vi.fn();
    const reportAccessDenied = vi.fn();
    const fetchTrack = vi.fn<(accessToken: string) => Promise<CurrentlyPlayingResult>>().mockResolvedValue(song);

    const sharer = new SpotifyListeningSharer(
        (listening) => published.push(listening),
        { linked, getAccessToken: () => Promise.resolve("token"), expireAccessToken, reportAccessDenied },
        sharing,
        joinedJam,
        fetchTrack,
        POLL_MS,
    );

    return { sharer, linked, sharing, joinedJam, published, fetchTrack, expireAccessToken, reportAccessDenied };
}

describe("SpotifyListeningSharer", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("publishes the playing track, then polls again", async () => {
        const { sharer, published, fetchTrack } = createHarness();

        await vi.advanceTimersByTimeAsync(0);
        expect(published.at(-1)).toMatchObject({ trackTitle: "Song", artistName: "Artist" });

        fetchTrack.mockResolvedValue({ status: "ok", track: undefined });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(published.at(-1)?.trackTitle).toBe("");
        expect(fetchTrack).toHaveBeenCalledTimes(2);

        sharer.destroy();
    });

    it("does not publish the same listening twice", async () => {
        const { sharer, published } = createHarness();

        await vi.advanceTimersByTimeAsync(POLL_MS * 3);

        expect(published).toHaveLength(1);
        sharer.destroy();
    });

    it("stops polling and clears the track when sharing is turned off", async () => {
        const { sharer, sharing, published, fetchTrack } = createHarness();
        await vi.advanceTimersByTimeAsync(0);

        sharing.set(false);
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);

        expect(published.at(-1)?.trackTitle).toBe("");
        expect(fetchTrack).toHaveBeenCalledTimes(1);
        sharer.destroy();
    });

    it("publishes the joined Jam even without a linked account", async () => {
        const { sharer, joinedJam, published, fetchTrack } = createHarness({ linked: false });

        joinedJam.set({ areaId: "lounge", areaName: "Lounge", url: "https://spotify.link/abc" });
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(fetchTrack).not.toHaveBeenCalled();
        expect(published.at(-1)).toMatchObject({ trackTitle: "", jamAreaId: "lounge", jamAreaName: "Lounge" });
        sharer.destroy();
    });

    it("reports an account the Spotify app refuses, and asks again much later only", async () => {
        const { sharer, fetchTrack, reportAccessDenied } = createHarness();
        fetchTrack.mockResolvedValue({ status: "forbidden" });

        await vi.advanceTimersByTimeAsync(POLL_MS * 10);

        expect(reportAccessDenied).toHaveBeenCalledTimes(1);
        expect(fetchTrack).toHaveBeenCalledTimes(1);
        sharer.destroy();
    });

    it("has the token refreshed when Spotify rejects it", async () => {
        const { sharer, fetchTrack, expireAccessToken } = createHarness();
        fetchTrack.mockResolvedValueOnce({ status: "unauthorized" });

        await vi.advanceTimersByTimeAsync(0);

        expect(expireAccessToken).toHaveBeenCalled();
        sharer.destroy();
    });
});
