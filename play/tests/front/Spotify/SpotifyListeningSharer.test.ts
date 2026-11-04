import type { SpotifyListening } from "@workadventure/messages";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinedJam } from "../../../src/front/ListeningZone/ListeningZoneStore";
import { SpotifyListeningSharer } from "../../../src/front/Spotify/SpotifyListeningSharer";
import type { CurrentlyPlayingResult, SpotifyTrack } from "../../../src/front/Spotify/SpotifyPlayerApi";

const POLL_MS = 1_000;

const song: CurrentlyPlayingResult = {
    status: "ok",
    track: { title: "Song", artist: "Artist", url: "https://open.spotify.com/track/abc" },
};

function createHarness(options: { linked?: boolean; sharing?: boolean } = {}) {
    const linked = writable(options.linked ?? true);
    const sharing = writable(options.sharing ?? true);
    const joinedJam = writable<JoinedJam | undefined>(undefined);
    const listeningAlong = writable<string | undefined>(undefined);
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
        undefined,
        listeningAlong,
    );

    return {
        sharer,
        linked,
        sharing,
        joinedJam,
        listeningAlong,
        published,
        fetchTrack,
        expireAccessToken,
        reportAccessDenied,
    };
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

    it("publishes who this user listens along with, and stops when the follow ends", async () => {
        const { sharer, listeningAlong, published } = createHarness();
        await vi.advanceTimersByTimeAsync(POLL_MS);

        listeningAlong.set("nat");
        expect(published.at(-1)?.listeningAlongUuid).toBe("nat");

        listeningAlong.set(undefined);
        expect(published.at(-1)?.listeningAlongUuid).toBe("");
        sharer.destroy();
    });

    it("publishes the joined Jam even without a linked account", async () => {
        const { sharer, joinedJam, published, fetchTrack } = createHarness({ linked: false });

        joinedJam.set({ areaId: "lounge", areaName: "Lounge", url: "https://spotify.link/abc", hostUuid: "dj" });
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(fetchTrack).not.toHaveBeenCalled();
        expect(published.at(-1)).toMatchObject({
            trackTitle: "",
            jamAreaId: "lounge",
            jamAreaName: "Lounge",
            jamHostUuid: "dj",
        });
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

    describe("with the Spotify app of this computer (desktop app)", () => {
        function createLocalHarness(options: { linked?: boolean } = {}) {
            const linked = writable(options.linked ?? false);
            const sharing = writable(true);
            const published: SpotifyListening[] = [];
            const fetchTrack = vi
                .fn<(accessToken: string) => Promise<CurrentlyPlayingResult>>()
                .mockResolvedValue(song);
            let onTrack: ((track: SpotifyTrack | undefined) => void) | undefined;
            const stopWatching = vi.fn();
            const watch = vi.fn((callback: (track: SpotifyTrack | undefined) => void) => {
                onTrack = callback;
                return stopWatching;
            });
            const sharer = new SpotifyListeningSharer(
                (listening) => published.push(listening),
                {
                    linked,
                    getAccessToken: () => Promise.resolve("token"),
                    expireAccessToken: vi.fn(),
                    reportAccessDenied: vi.fn(),
                },
                sharing,
                writable<JoinedJam | undefined>(undefined),
                fetchTrack,
                POLL_MS,
                { watch },
            );
            const play = (track: SpotifyTrack | undefined) => onTrack?.(track);
            return { sharer, linked, sharing, published, fetchTrack, watch, stopWatching, play };
        }

        it("shares without a linked account, and never calls the Web API", async () => {
            const { sharer, published, fetchTrack, play } = createLocalHarness();

            play({ title: "Local song", artist: "Band", url: "https://open.spotify.com/track/xyz" });
            await vi.advanceTimersByTimeAsync(POLL_MS * 3);

            expect(published.at(-1)).toMatchObject({ trackTitle: "Local song", artistName: "Band" });
            expect(fetchTrack).not.toHaveBeenCalled();
            sharer.destroy();
        });

        it("clears the track when nothing plays, and stops reading when sharing is turned off", () => {
            const { sharer, sharing, published, watch, stopWatching, play } = createLocalHarness();
            play({ title: "Local song", artist: "Band", url: "" });
            play(undefined);
            expect(published.at(-1)?.trackTitle).toBe("");

            sharing.set(false);
            expect(stopWatching).toHaveBeenCalledOnce();
            sharing.set(true);
            expect(watch).toHaveBeenCalledTimes(2);
            sharer.destroy();
        });

        it("also reads a linked account, for music played on another device", async () => {
            const { sharer, published, fetchTrack, play } = createLocalHarness({ linked: true });

            await vi.advanceTimersByTimeAsync(0);
            expect(published.at(-1)).toMatchObject({ trackTitle: "Song", artistName: "Artist" });

            play({ title: "Local song", artist: "Band", url: "https://open.spotify.com/track/xyz" });
            expect(published.at(-1)).toMatchObject({ trackTitle: "Local song", artistName: "Band" });

            play(undefined);
            expect(published.at(-1)).toMatchObject({ trackTitle: "Song", artistName: "Artist" });
            expect(fetchTrack).toHaveBeenCalled();
            sharer.destroy();
        });

        it("starts reading the account linked while sharing, and stops when it is unlinked", async () => {
            const { sharer, linked, published, fetchTrack } = createLocalHarness();
            await vi.advanceTimersByTimeAsync(POLL_MS);
            expect(fetchTrack).not.toHaveBeenCalled();

            linked.set(true);
            await vi.advanceTimersByTimeAsync(0);
            expect(published.at(-1)?.trackTitle).toBe("Song");

            linked.set(false);
            await vi.advanceTimersByTimeAsync(POLL_MS * 3);
            expect(published.at(-1)?.trackTitle).toBe("");
            expect(fetchTrack).toHaveBeenCalledTimes(1);
            sharer.destroy();
        });
    });
});

describe("SpotifyListeningSharer positions", () => {
    function createPositionHarness() {
        const published: SpotifyListening[] = [];
        let onTrack: ((track: SpotifyTrack | undefined) => void) | undefined;
        const sharer = new SpotifyListeningSharer(
            (listening) => published.push(listening),
            {
                linked: writable(false),
                getAccessToken: () => Promise.resolve("token"),
                expireAccessToken: vi.fn(),
                reportAccessDenied: vi.fn(),
            },
            writable(true),
            writable<JoinedJam | undefined>(undefined),
            vi.fn(),
            POLL_MS,
            {
                watch: (callback) => {
                    onTrack = callback;
                    return () => undefined;
                },
            },
        );
        const play = (positionMs: number, positionAt: number) =>
            onTrack?.({ title: "Song", artist: "Artist", url: "", positionMs, positionAt });
        return { sharer, published, play };
    }

    it("publishes the position, then again only when it moves away from the deduced one", () => {
        const { sharer, published, play } = createPositionHarness();

        play(10_000, 1_000);
        play(15_000, 6_000);
        expect(published).toHaveLength(1);
        expect(published[0]).toMatchObject({ positionMs: 10_000, positionAt: 1_000 });

        play(90_000, 7_000);
        expect(published).toHaveLength(2);
        sharer.destroy();
    });
});
