import { afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { Writable } from "svelte/store";
import { EMPTY_SPOTIFY_LISTENING } from "../../../src/common/SpotifyListening";
import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";
import type { SpotifyPlaybackState } from "../../../src/front/Interfaces/DesktopAppInterfaces";
import type { ListeningByUserUuid } from "../../../src/front/Spotify/SpotifyListeningDirectory";
import {
    JAM_KARAOKE_REQUEST_EVENT,
    JAM_KARAOKE_STATE_EVENT,
    karaokeStatesStore,
    selectedKaraokeRoomStore,
    startJamKaraoke,
    karaokePositionMs,
} from "../../../src/front/Karaoke/JamKaraoke";
import type { JamKaraokeContext } from "../../../src/front/Karaoke/JamKaraoke";

const room: JamRoom = {
    zone: { areaId: "area", propertyId: "property", areaName: "Test" },
    jam: { home: true, hostUuid: "host", hostName: "Host" },
};
const spotifyRoom: JamRoom = {
    zone: { areaId: "area", propertyId: "property", areaName: "Test" },
    jam: { url: "https://spotify.link/old", hostUuid: "host", hostName: "Host" },
};
function linkedAccount() {
    return {
        linked: writable(true),
        getAccessToken: vi.fn().mockResolvedValue("test-token"),
        expireAccessToken: vi.fn(),
        reportAccessDenied: vi.fn(),
    };
}
const state = {
    track: { title: "Test song", artist: "Test artist", durationMs: 200_000 },
    next: { title: "Next song", artist: "Test artist" },
    playing: true,
    positionMs: 1000,
    positionAt: 10_000,
};
function harness(
    options: {
        localUuid?: string;
        desktop?: JamKaraokeContext["desktop"];
        sharingEnabled?: JamKaraokeContext["sharingEnabled"];
        account?: JamKaraokeContext["account"];
        memory?: JamKaraokeContext["memory"];
        now?: () => number;
        rooms?: JamRoom[];
        listening?: Writable<ListeningByUserUuid>;
    } = {},
) {
    const rooms = writable(options.rooms ?? [room]);
    const listening = options.listening ?? writable<ListeningByUserUuid>(new Map());
    let receive: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
    const send = vi.fn();
    const stop = startJamKaraoke({
        rooms,
        listeningByUserUuid: listening,
        localUuid: () => options.localUuid ?? "guest",
        userByUuid: (uuid) => ({ id: uuid === "host" ? 1 : 2, name: uuid }),
        userById: (id) => ({ uuid: id === 1 ? "host" : "guest", name: "Test" }),
        send,
        onEvent: (listener) => {
            receive = listener;
            return () => {
                receive = undefined;
            };
        },
        desktop: options.desktop,
        sharingEnabled: options.sharingEnabled,
        account: options.account,
        memory: options.memory ?? fakeMemory(),
        now: options.now,
    });
    return {
        rooms,
        listening,
        stop,
        send,
        receive: (name: string, data: unknown, senderId: number) => receive?.(name, data, senderId),
    };
}

/** A tab's session storage for the karaoke: what was open before the page reloaded. */
function fakeMemory(initial: string | null = null) {
    let value = initial;
    return { read: () => value, write: vi.fn((next: string | null) => (value = next)), current: () => value };
}

afterEach(() => {
    selectedKaraokeRoomStore.set(undefined);
    karaokeStatesStore.set(new Map());
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("Jam karaoke", () => {
    it("applies a queue rate limit to playback polling too, until Retry-After expires", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);
        const current = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        vi.stubGlobal("fetch", (url: string) =>
            url.endsWith("/queue")
                ? Promise.resolve(new Response(null, { status: 429, headers: { "Retry-After": "10" } }))
                : current(),
        );
        const game = harness({
            localUuid: "host",
            account: {
                linked: writable(true),
                getAccessToken: vi.fn().mockResolvedValue("test-token"),
                expireAccessToken: vi.fn(),
                reportAccessDenied: vi.fn(),
            },
        });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(5000);
        expect(current).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(5000);
        expect(current).toHaveBeenCalledTimes(2);
        game.stop();
    });

    it("keeps polling the current track while a queue request is still waiting", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);
        let finishQueue: ((response: Response) => void) | undefined;
        let title = "First song";
        const fetchFn = vi.fn((url: string) =>
            url.endsWith("/queue")
                ? new Promise<Response>((resolve) => {
                      finishQueue = resolve;
                  })
                : Promise.resolve(
                      Response.json({
                          is_playing: true,
                          progress_ms: 0,
                          currently_playing_type: "track",
                          item: { name: title, artists: [{ name: "Test artist" }], external_urls: {} },
                      }),
                  ),
        );
        vi.stubGlobal("fetch", fetchFn);
        const game = harness({
            localUuid: "host",
            account: {
                linked: writable(true),
                getAccessToken: vi.fn().mockResolvedValue("test-token"),
                expireAccessToken: vi.fn(),
                reportAccessDenied: vi.fn(),
            },
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(finishQueue).toBeDefined();
        title = "Next song";
        await vi.advanceTimersByTimeAsync(5000);
        expect(get(karaokeStatesStore).get("host")?.track?.title).toBe("Next song");
        expect(fetchFn.mock.calls.filter(([url]) => url.endsWith("/queue"))).toHaveLength(1);
        game.stop();
        finishQueue?.(Response.json({ queue: [] }));
        await vi.advanceTimersByTimeAsync(0);
    });

    it("continues current playback polling when the optional queue scope is denied", async () => {
        vi.useFakeTimers();
        const current = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        vi.stubGlobal("fetch", (url: string) =>
            url.endsWith("/queue") ? Promise.resolve(new Response(null, { status: 403 })) : current(),
        );
        const denied = vi.fn();
        const game = harness({
            localUuid: "host",
            account: {
                linked: writable(true),
                getAccessToken: vi.fn().mockResolvedValue("test-token"),
                expireAccessToken: vi.fn(),
                reportAccessDenied: denied,
            },
        });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(5000);
        expect(current).toHaveBeenCalledTimes(2);
        expect(denied).not.toHaveBeenCalled();
        game.stop();
    });

    it("respects the host's sharing preference and clears already shared metadata when disabled", () => {
        const enabled = writable(false);
        let notify: ((state: SpotifyPlaybackState | null) => void) | undefined;
        const stopWatching = vi.fn();
        const watchSpotifyPlayback = vi.fn((callback: (state: SpotifyPlaybackState | null) => void) => {
            notify = callback;
            return stopWatching;
        });
        const game = harness({ localUuid: "host", sharingEnabled: enabled, desktop: { watchSpotifyPlayback } });
        expect(watchSpotifyPlayback).not.toHaveBeenCalled();
        enabled.set(true);
        expect(watchSpotifyPlayback).toHaveBeenCalledOnce();
        notify?.({
            track: { uri: "spotify:track:test", title: "Test song", artist: "Test artist", artworkUrl: "" },
            playing: true,
            positionMs: 1000,
            durationMs: 200_000,
            volume: 50,
            shuffle: false,
            repeat: 0,
        });
        expect(get(karaokeStatesStore).get("host")?.track?.title).toBe("Test song");
        enabled.set(false);
        expect(stopWatching).toHaveBeenCalledOnce();
        expect(get(karaokeStatesStore).get("host")?.track).toBeNull();
        expect(game.send).toHaveBeenLastCalledWith(
            JAM_KARAOKE_STATE_EVENT,
            expect.objectContaining({ track: null, next: null, playing: false }),
            [],
        );
        game.stop();
    });
    it("shares desktop pauses and seeks, answers guests with a snapshot and stops watching at room end", () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);
        let notify: ((state: SpotifyPlaybackState | null) => void) | undefined;
        const stopWatching = vi.fn();
        const game = harness({
            localUuid: "host",
            desktop: {
                watchSpotifyPlayback: (callback) => {
                    notify = callback;
                    return stopWatching;
                },
            },
        });
        const playback: SpotifyPlaybackState = {
            track: { uri: "spotify:track:test", title: "Test song", artist: "Test artist", artworkUrl: "" },
            playing: true,
            positionMs: 1000,
            durationMs: 200_000,
            volume: 50,
            shuffle: false,
            repeat: 0,
        };
        notify?.(playback);
        expect(get(karaokeStatesStore).get("host")).toMatchObject({
            track: state.track,
            playing: true,
            positionMs: 1000,
            positionAt: 10_000,
        });
        notify?.({ ...playback, playing: false });
        expect(game.send).toHaveBeenLastCalledWith(
            JAM_KARAOKE_STATE_EVENT,
            expect.objectContaining({ playing: false, positionMs: 1000 }),
            [],
        );
        vi.setSystemTime(11_000);
        notify?.({ ...playback, playing: false, positionMs: 25_000 });
        game.receive(
            JAM_KARAOKE_REQUEST_EVENT,
            {
                areaId: "area",
                propertyId: "property",
                jamKey: "home:host",
            },
            2,
        );
        expect(game.send).toHaveBeenLastCalledWith(
            JAM_KARAOKE_STATE_EVENT,
            expect.objectContaining({ playing: false, positionMs: 25_000 }),
            [2],
        );
        game.rooms.set([]);
        expect(stopWatching).toHaveBeenCalledOnce();
        expect(get(karaokeStatesStore).size).toBe(0);
        notify?.(playback);
        expect(get(karaokeStatesStore).size).toBe(0);
        game.stop();
    });

    it("drops a previous host watcher and previous metadata when its room is replaced", () => {
        let notify: ((state: SpotifyPlaybackState | null) => void) | undefined;
        const game = harness({
            localUuid: "host",
            desktop: {
                watchSpotifyPlayback: (callback) => {
                    notify = callback;
                    return () => undefined;
                },
            },
        });
        const previous = notify;
        game.rooms.set([{ ...room, jam: { live: true, hostUuid: "host", hostName: "Host" } }]);
        previous?.({
            track: { uri: "spotify:track:test", title: "Old song", artist: "Test artist", artworkUrl: "" },
            playing: true,
            positionMs: 1000,
            durationMs: 200_000,
            volume: 50,
            shuffle: false,
            repeat: 0,
        });
        expect(get(karaokeStatesStore).size).toBe(0);
        game.stop();
    });

    it("follows playback, freezes on pause, clamps to duration and supports an audio delay", () => {
        expect(karaokePositionMs(state, 11_000)).toBe(2000);
        expect(karaokePositionMs({ ...state, playing: false }, 11_000)).toBe(1000);
        expect(karaokePositionMs(state, 11_000, -500)).toBe(1500);
        expect(karaokePositionMs(state, 300_000)).toBe(200_000);
    });

    it("accepts only the actual host's state for the exact active Jam", () => {
        const game = harness();
        const data = { areaId: "area", propertyId: "property", jamKey: "home:host", ...state };
        game.receive(JAM_KARAOKE_STATE_EVENT, data, 2);
        expect(get(karaokeStatesStore).size).toBe(0);
        game.receive(JAM_KARAOKE_STATE_EVENT, { ...data, propertyId: "other" }, 1);
        expect(get(karaokeStatesStore).size).toBe(0);
        game.receive(JAM_KARAOKE_STATE_EVENT, data, 1);
        expect(get(karaokeStatesStore).get("host")).toMatchObject(state);
        // A newer host may send an issue this front does not know: the playback still reads, without it.
        game.receive(JAM_KARAOKE_STATE_EVENT, { ...data, positionMs: 2000, issue: "somethingNew" }, 1);
        expect(get(karaokeStatesStore).get("host")).toMatchObject({ positionMs: 2000 });
        expect(get(karaokeStatesStore).get("host")?.issue).toBeUndefined();
        game.stop();
    });

    it("requests the selected host's snapshot without joining Spotify and closes on room removal", () => {
        const game = harness();
        selectedKaraokeRoomStore.set(room);
        expect(game.send).toHaveBeenCalledWith(
            JAM_KARAOKE_REQUEST_EVENT,
            {
                areaId: "area",
                propertyId: "property",
                jamKey: "home:host",
            },
            [1],
        );
        game.rooms.set([]);
        expect(get(selectedKaraokeRoomStore)).toBeUndefined();
        expect(get(karaokeStatesStore).size).toBe(0);
        game.stop();
    });

    it("excludes Live rooms even when selected programmatically", () => {
        const game = harness();
        const live: JamRoom = { ...room, jam: { live: true, hostUuid: "host", hostName: "Host" } };
        game.rooms.set([live]);
        selectedKaraokeRoomStore.set(live);
        expect(get(selectedKaraokeRoomStore)).toBeUndefined();
        expect(game.send).not.toHaveBeenCalled();
        game.stop();
    });

    it("remembers in the tab the Jam whose karaoke is open, and forgets it once closed", () => {
        const memory = fakeMemory();
        const game = harness({ memory });

        selectedKaraokeRoomStore.set(room);
        expect(memory.current()).toBe(JSON.stringify({ areaId: "area", propertyId: "property", jamKey: "home:host" }));

        selectedKaraokeRoomStore.set(undefined);
        expect(memory.current()).toBeNull();
        game.stop();
    });

    it("opens the karaoke again on the same Jam after the page reloads, once the Jam is back", () => {
        let time = 50_000;
        const memory = fakeMemory(JSON.stringify({ areaId: "area", propertyId: "property", jamKey: "home:host" }));
        const game = harness({ memory, now: () => time, rooms: [] });
        expect(get(selectedKaraokeRoomStore)).toBeUndefined();

        time += 5_000;
        game.rooms.set([room]);

        expect(get(selectedKaraokeRoomStore)).toEqual(room);
        expect(game.send).toHaveBeenCalledWith(
            JAM_KARAOKE_REQUEST_EVENT,
            { areaId: "area", propertyId: "property", jamKey: "home:host" },
            [1],
        );
        game.stop();
    });

    it("does not open a karaoke out of the blue: the Jam must be back within a minute of the reload", () => {
        let time = 50_000;
        const memory = fakeMemory(JSON.stringify({ areaId: "area", propertyId: "property", jamKey: "home:host" }));
        const game = harness({ memory, now: () => time, rooms: [] });

        time += 61_000;
        game.rooms.set([room]);

        expect(get(selectedKaraokeRoomStore)).toBeUndefined();
        expect(memory.current()).toBeNull();
        game.stop();
    });

    it("says why the host's position is unknown when WorkAdventure reads no player of theirs (the beta report)", () => {
        // Host in a browser without the desktop player, Spotify not linked: only their presence names the track.
        const linked = writable(false);
        const authorizationExpired = writable(false);
        const listening = writable<ListeningByUserUuid>(
            new Map([
                [
                    "host",
                    {
                        ...EMPTY_SPOTIFY_LISTENING,
                        trackTitle: "Pearl Necklace",
                        artistName: "ZZ Top",
                        trackUrl: "https://open.spotify.com/track/abc",
                    },
                ],
            ]),
        );
        const game = harness({
            localUuid: "host",
            rooms: [spotifyRoom],
            listening,
            account: {
                linked,
                authorizationExpired,
                getAccessToken: vi.fn().mockResolvedValue(undefined),
                expireAccessToken: vi.fn(),
                reportAccessDenied: vi.fn(),
            },
        });
        expect(get(karaokeStatesStore).get("host")).toMatchObject({
            track: { title: "Pearl Necklace", artist: "ZZ Top" },
            positionAt: 0,
            issue: "noPlayer",
        });
        // Spotify rejected the refresh token: the link is gone, which the host is told apart.
        authorizationExpired.set(true);
        expect(get(karaokeStatesStore).get("host")?.issue).toBe("authorizationExpired");
        expect(game.send).toHaveBeenLastCalledWith(
            JAM_KARAOKE_STATE_EVENT,
            expect.objectContaining({ issue: "authorizationExpired" }),
            [],
        );
        game.stop();
    });

    it("reports a Spotify player with nothing to play (204), then clears it once a track plays", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);
        let response = (): Response => new Response(null, { status: 204 });
        vi.stubGlobal("fetch", (url: string) =>
            Promise.resolve(url.endsWith("/queue") ? Response.json({ queue: [] }) : response()),
        );
        const game = harness({ localUuid: "host", rooms: [spotifyRoom], account: linkedAccount() });
        await vi.advanceTimersByTimeAsync(0);
        expect(get(karaokeStatesStore).get("host")).toMatchObject({ track: null, issue: "noPlayback" });

        response = () =>
            Response.json({
                is_playing: true,
                progress_ms: 1000,
                currently_playing_type: "track",
                item: { name: "Test song", artists: [{ name: "Test artist" }], external_urls: {} },
            });
        await vi.advanceTimersByTimeAsync(5000);
        expect(get(karaokeStatesStore).get("host")?.track?.title).toBe("Test song");
        expect(get(karaokeStatesStore).get("host")?.issue).toBeUndefined();
        game.stop();
    });

    it("reports Spotify refusing to read the host's player (403) and waits the existing five minutes", async () => {
        vi.useFakeTimers();
        const current = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
        vi.stubGlobal("fetch", (url: string) =>
            url.endsWith("/queue") ? Promise.resolve(Response.json({ queue: [] })) : current(),
        );
        const game = harness({ localUuid: "host", rooms: [spotifyRoom], account: linkedAccount() });
        await vi.advanceTimersByTimeAsync(0);
        expect(get(karaokeStatesStore).get("host")?.issue).toBe("accessDenied");
        await vi.advanceTimersByTimeAsync(299_000);
        expect(current).toHaveBeenCalledOnce();
        game.stop();
    });

    it("reports a desktop Spotify app that plays nothing", () => {
        let notify: ((state: SpotifyPlaybackState | null) => void) | undefined;
        const game = harness({
            localUuid: "host",
            rooms: [spotifyRoom],
            desktop: {
                watchSpotifyPlayback: (callback) => {
                    notify = callback;
                    return () => undefined;
                },
            },
        });
        expect(get(karaokeStatesStore).get("host")?.issue).toBeUndefined();
        notify?.(null);
        expect(get(karaokeStatesStore).get("host")).toMatchObject({ track: null, issue: "noPlayback" });
        // Another player's presence changes: the host's desktop still plays nothing.
        game.listening.set(new Map([["guest", { ...EMPTY_SPOTIFY_LISTENING, trackTitle: "Other song" }]]));
        expect(get(karaokeStatesStore).get("host")?.issue).toBe("noPlayback");
        notify?.({
            track: { uri: "spotify:track:test", title: "Test song", artist: "Test artist", artworkUrl: "" },
            playing: true,
            positionMs: 1000,
            durationMs: 200_000,
            volume: 50,
            shuffle: false,
            repeat: 0,
        });
        expect(get(karaokeStatesStore).get("host")?.issue).toBeUndefined();
        game.stop();
    });

    it("keeps the karaoke open on a Spotify Jam whose host pastes a new invite link", () => {
        const game = harness({ rooms: [spotifyRoom] });
        selectedKaraokeRoomStore.set(spotifyRoom);
        const replaced: JamRoom = { ...spotifyRoom, jam: { ...spotifyRoom.jam, url: "https://spotify.link/new" } };
        game.rooms.set([replaced]);
        expect(get(selectedKaraokeRoomStore)).toEqual(replaced);
        expect(game.send).toHaveBeenLastCalledWith(
            JAM_KARAOKE_REQUEST_EVENT,
            { areaId: "area", propertyId: "property", jamKey: "https://spotify.link/new" },
            [1],
        );
        game.stop();
    });

    it("waits a minute for a Jam that vanishes (its host reconnects), then opens its karaoke again", () => {
        let time = 50_000;
        const memory = fakeMemory();
        const game = harness({ memory, now: () => time });
        selectedKaraokeRoomStore.set(room);

        time += 120_000;
        game.rooms.set([]);
        expect(get(selectedKaraokeRoomStore)).toBeUndefined();
        expect(memory.current()).not.toBeNull();

        time += 10_000;
        game.rooms.set([room]);
        expect(get(selectedKaraokeRoomStore)).toEqual(room);
        game.stop();
    });
});
