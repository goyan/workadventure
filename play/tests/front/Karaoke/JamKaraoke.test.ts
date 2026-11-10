import { afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
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
    } = {},
) {
    const rooms = writable([room]);
    let receive: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
    const send = vi.fn();
    const stop = startJamKaraoke({
        rooms,
        listeningByUserUuid: writable<ListeningByUserUuid>(new Map()),
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
    });
    return {
        rooms,
        stop,
        send,
        receive: (name: string, data: unknown, senderId: number) => receive?.(name, data, senderId),
    };
}

afterEach(() => {
    selectedKaraokeRoomStore.set(undefined);
    karaokeStatesStore.set(new Map());
    vi.useRealTimers();
});

describe("Jam karaoke", () => {
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
});
