import type { SpotifyListening } from "@workadventure/messages";
import { listeningZoneJamKey } from "@workadventure/map-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import type { JamRoom } from "../../../../src/front/ListeningZone/ListeningZoneController";
import { SpotifyPlaybackCommand } from "../../../../src/front/Interfaces/DesktopAppInterfaces";
import type { SpotifyPlaybackState } from "../../../../src/front/Interfaces/DesktopAppInterfaces";
import { EMPTY_SPOTIFY_LISTENING } from "../../../../src/common/SpotifyListening";
import { followedUserUuidStore, listenAlongAvailableStore } from "../../../../src/front/Spotify/ListeningFollower";
import { joinedJamStore } from "../../../../src/front/ListeningZone/ListeningZoneStore";
import { lampEffectsEnabledStore } from "../../../../src/front/Stores/LampEffectsStore";
import { selectedKaraokeRoomStore } from "../../../../src/front/Karaoke/JamKaraoke";
import JamRoomsList from "../../../../src/front/Components/ListeningZone/JamRoomsList.svelte";

const mocks = vi.hoisted(() => ({
    setRooms: vi.fn<(rooms: JamRoom[]) => void>(),
    setListening: vi.fn<(listening: Map<string, SpotifyListening>) => void>(),
    join: vi.fn(),
    playback: vi.fn(),
    update: vi.fn(),
    audioLeave: vi.fn().mockResolvedValue(undefined),
    local: false,
}));
vi.mock("../../../../src/front/ListeningZone/ListeningZoneController", async () => {
    const { writable } = await import("svelte/store");
    const rooms = writable<JamRoom[]>([]);
    mocks.setRooms.mockImplementation(rooms.set);
    return {
        allJamRoomsStore: rooms,
        isLocalUser: () => mocks.local,
        jamParticipantsCountStore: writable(new Map()),
        joinJam: mocks.join,
        joinHomeJam: mocks.join,
        leaveJam: mocks.join,
        stopSharingJam: mocks.join,
        localPlayerName: () => "Me",
        updateOwnRoom: mocks.update,
    };
});
vi.mock("../../../../src/front/Spotify/SpotifyListeningDirectory", async () => {
    const { writable } = await import("svelte/store");
    const listening = writable(new Map<string, SpotifyListening>());
    mocks.setListening.mockImplementation(listening.set);
    return { listeningByUserUuidStore: listening };
});
vi.mock("../../../../src/front/ListeningZone/ListeningZoneStore", async () => ({
    joinedJamStore: (await import("svelte/store")).writable(undefined),
}));
vi.mock("../../../../src/front/Stores/PlayersStore", async () => ({
    playersStore: (await import("svelte/store")).writable(new Map()),
}));
// Native Jam audio is covered separately; this suite exercises only the Spotify extension action.
vi.mock("../../../../src/front/ListeningZone/GameJamAudioSession", () => ({
    jamAudioSession: { leave: mocks.audioLeave },
}));
vi.mock("../../../../src/front/Stores/MediaStore", async () => ({
    requestedMicrophoneDeviceIdStore: (await import("svelte/store")).readable(undefined),
}));
vi.mock("../../../../src/front/Components/ListeningZone/JamAudioControls.svelte", async () => ({
    default: (await import("../JamRoomsListStub.svelte")).default,
}));
vi.mock("../../../../src/front/Components/ListeningZone/JamLinkStatus.svelte", async () => ({
    default: (await import("../JamLinkStatusStub.svelte")).default,
}));
vi.mock("../../../../src/front/Spotify/HomeJam", async () => ({
    controlJukeboxPlayback: mocks.playback,
    jukeboxQueuesStore: (await import("svelte/store")).writable(new Map()),
}));
vi.mock("../../../../src/front/Components/ListeningZone/JukeboxQueue.svelte", async () => ({
    default: (await import("../../../../src/front/Components/UI/Button.svelte")).default,
}));
vi.mock("../../../../src/i18n/i18n-svelte", async () => ({
    LL: (await import("svelte/store")).readable({
        spotify: {
            karaoke: { title: () => "Karaoke" },
            card: { stopListeningAlong: () => "Stop listening" },
            listeningZone: {
                kindSpotify: () => "Spotify",
                kindLive: () => "Live",
                liveOf: ({ name }: { name: string }) => `Live of ${name}`,
                stopLive: () => "End the Live",
                kindHome: () => "Jukebox",
                hostedBy: () => "Host",
                participants: () => "Participants",
                join: () => "Join Spotify",
                leave: () => "Leave",
                listenViaExtension: () => "Listen via extension",
                stop: () => "Stop sharing",
                stopHome: () => "Stop sharing",
                queue: () => "Queue",
                playbackPlay: () => "Play",
                playbackPause: () => "Pause",
                playbackNext: () => "Next track",
                playbackPrevious: () => "Previous track",
                playbackShuffle: () => "Shuffle",
                playbackRepeatOff: () => "Repeat off",
                playbackRepeatAll: () => "Repeat all",
                playbackRepeatOne: () => "Repeat one",
                playbackSeek: () => "Position",
                lightsDisable: () => "Turn off lights for me",
                lightsEnable: () => "Turn on lights for me",
                lightsDisableForAll: () => "Turn off lights for everyone",
                lightsEnableForAll: () => "Turn lights back on for everyone",
                playbackEmpty: () => "No track",
                playbackDisconnected: () => "Connecting to Spotify",
                audioMute: () => "Mute",
                audioUnmute: () => "Unmute",
                audioVolume: () => "Volume",
                homeJamOf: () => "Jukebox of Host",
                homeSilentNote: () => "Disconnected",
                joinHomeSilent: () => "Join silently",
                joinHome: () => "Join Jukebox",
            },
        },
    }),
}));
const room: JamRoom = {
    zone: { areaId: "area", propertyId: "property", areaName: "Music" },
    jam: { url: "https://spotify.link/classic", hostUuid: "host", hostName: "Host", title: "Classic room" },
};
const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
function render(): void {
    flushSync(() => {
        component = mount(JamRoomsList, { target });
    });
}
beforeEach(() => {
    lampEffectsEnabledStore.set(true);
    mocks.join.mockClear();
    mocks.playback.mockClear();
    mocks.update.mockClear();
    joinedJamStore.set(undefined);
    mocks.local = false;
    mocks.setRooms([room]);
    mocks.setListening(
        new Map([
            [
                "host",
                {
                    ...EMPTY_SPOTIFY_LISTENING,
                    source: "spotify",
                    trackTitle: "Track",
                    trackUrl: "https://open.spotify.com/track/abc",
                },
            ],
        ]),
    );
    followedUserUuidStore.set(undefined);
    listenAlongAvailableStore.set(false);
    selectedKaraokeRoomStore.set(undefined);
});
describe("personal light switch", () => {
    it("lets a listener toggle lights without changing the Jam or Spotify playback", () => {
        joinedJamStore.set({ ...room.zone, hostUuid: room.jam.hostUuid, url: listeningZoneJamKey(room.jam) });
        render();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-lights-toggle"]');
        if (!button) throw new Error("Missing light switch");
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(false);
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(button.getAttribute("aria-label")).toBe("Turn on lights for me");
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(true);
        expect(mocks.join).not.toHaveBeenCalled();
        expect(mocks.playback).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("lets the host turn lights off only for themselves while keeping the room lit", () => {
        mocks.local = true;
        render();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-lights-toggle"]');
        if (!button) throw new Error("Missing personal host light switch");
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(false);
        expect(button.getAttribute("aria-label")).toBe("Turn on lights for me");
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.join).not.toHaveBeenCalled();
        expect(mocks.playback).not.toHaveBeenCalled();
    });

    it("offers the host no switch for everyone: lights are only turned off per person", () => {
        mocks.local = true;
        render();
        expect(target.querySelector('[data-testid="jam-lights-toggle-all"]')).toBeNull();
        expect(target.querySelector('[data-testid="jam-lights-toggle"]')).not.toBeNull();
    });

    it("lets a guest choose their personal light preference, with no notice from an old switch for everyone", () => {
        mocks.setRooms([{ ...room, jam: { ...room.jam, lightsOff: true } }]);
        joinedJamStore.set({ ...room.zone, hostUuid: room.jam.hostUuid, url: listeningZoneJamKey(room.jam) });
        render();
        expect(target.querySelector('[data-testid="jam-lights-off-by-host"]')).toBeNull();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-lights-toggle"]');
        if (!button) throw new Error("Missing guest light switch");
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(false);
        flushSync(() => mocks.setRooms([room]));
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(target.querySelector('[data-testid="jam-lights-toggle-all"]')).toBeNull();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("lets a guest turn lights off without joining the Jam", () => {
        render();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-lights-toggle"]');
        if (!button) throw new Error("Missing guest light switch");
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(false);
        expect(get(joinedJamStore)).toBeUndefined();
        expect(target.querySelector('[data-testid="jam-lights-toggle-all"]')).toBeNull();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.join).not.toHaveBeenCalled();
    });
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.replaceChildren();
    followedUserUuidStore.set(undefined);
    listenAlongAvailableStore.set(false);
    lampEffectsEnabledStore.set(true);
    selectedKaraokeRoomStore.set(undefined);
});
describe("Jam invite link", () => {
    it("shows the invite link status on a Spotify Jam only, not on a Jukebox nor a Live", () => {
        mocks.setRooms([
            room,
            { ...room, jam: { home: true, hostUuid: "other-host", hostName: "Other host" } },
            { ...room, jam: { live: true, hostUuid: "live-host", hostName: "Live host" } },
        ]);
        render();
        const cards = [...target.querySelectorAll('[data-testid="listening-zone-room"]')];
        expect(cards.map((card) => card.querySelector('[data-testid="jam-link-status"]') !== null)).toEqual([
            true,
            false,
            false,
        ]);
    });

    it.each([true, false])(
        "keeps the relayed audio when the host's room gets a new invite link (seen by its host: %s)",
        (local) => {
            mocks.local = local;
            mocks.audioLeave.mockClear();
            joinedJamStore.set({ ...room.zone, hostUuid: room.jam.hostUuid, url: listeningZoneJamKey(room.jam) });
            render();
            flushSync(() => mocks.setRooms([{ ...room, jam: { ...room.jam, url: "https://spotify.link/fresh" } }]));
            flushSync(() => joinedJamStore.set(undefined));
            expect(target.querySelectorAll('[data-testid="listening-zone-room"]')).toHaveLength(1);
            expect(mocks.audioLeave).not.toHaveBeenCalled();
        },
    );
});

describe("Karaoke", () => {
    it.each([room, { ...room, jam: { home: true, hostUuid: "host", hostName: "Host" } } satisfies JamRoom])(
        "toggles the selected Spotify or Jukebox room without changing playback or membership",
        (selectedRoom) => {
            mocks.setRooms([selectedRoom]);
            render();
            const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-karaoke-open"]');
            if (!button) throw new Error("Missing Karaoke action");
            flushSync(() => button.click());
            expect(get(selectedKaraokeRoomStore)).toEqual(selectedRoom);
            flushSync(() => button.click());
            expect(get(selectedKaraokeRoomStore)).toBeUndefined();
            flushSync(() => button.click());
            expect(get(selectedKaraokeRoomStore)).toEqual(selectedRoom);
            expect(mocks.join).not.toHaveBeenCalled();
            expect(mocks.playback).not.toHaveBeenCalled();
            expect(get(followedUserUuidStore)).toBeUndefined();
        },
    );
    it("closes the same room after its metadata changes", () => {
        render();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-karaoke-open"]');
        if (!button) throw new Error("Missing Karaoke action");
        flushSync(() => button.click());
        flushSync(() => mocks.setRooms([{ ...room, jam: { ...room.jam, title: "Updated title" } }]));
        flushSync(() => button.click());
        expect(get(selectedKaraokeRoomStore)).toBeUndefined();
    });
    it("switches to another room instead of closing the panel", () => {
        const otherRoom: JamRoom = {
            ...room,
            jam: { home: true, hostUuid: "other-host", hostName: "Other host" },
        };
        mocks.setRooms([room, otherRoom]);
        render();
        const [first, second] = target.querySelectorAll<HTMLButtonElement>('[data-testid="jam-karaoke-open"]');
        if (!first || !second) throw new Error("Missing Karaoke actions");
        flushSync(() => first.click());
        expect(get(selectedKaraokeRoomStore)).toEqual(room);
        flushSync(() => second.click());
        expect(get(selectedKaraokeRoomStore)).toEqual(otherRoom);
        flushSync(() => second.click());
        expect(get(selectedKaraokeRoomStore)).toBeUndefined();
        expect(mocks.join).not.toHaveBeenCalled();
        expect(mocks.playback).not.toHaveBeenCalled();
        expect(get(followedUserUuidStore)).toBeUndefined();
    });
});
describe("classic Jam listening via extension", () => {
    it("keeps the official join button without offering extension listening when disconnected", () => {
        render();
        expect(target.querySelector('[data-testid="listening-zone-join"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="listening-zone-listen-via-extension"]')).toBeNull();
    });
    it("follows and stops the host without joining Spotify or touching its queue", () => {
        listenAlongAvailableStore.set(true);
        render();
        const button = target.querySelector<HTMLButtonElement>('[data-testid="listening-zone-listen-via-extension"]');
        if (!button) throw new Error("Missing listen action");
        flushSync(() => button.click());
        expect(get(followedUserUuidStore)).toBe("host");
        expect(button.textContent).toContain("Stop listening");
        expect(mocks.join).not.toHaveBeenCalled();
        flushSync(() => button.click());
        expect(get(followedUserUuidStore)).toBeUndefined();
    });
    it("does not offer listening without a playable Spotify track", () => {
        listenAlongAvailableStore.set(true);
        mocks.setListening(new Map());
        render();
        expect(target.querySelector('[data-testid="listening-zone-listen-via-extension"]')).toBeNull();
    });
    it("does not offer following your own room", () => {
        listenAlongAvailableStore.set(true);
        mocks.local = true;
        render();
        expect(target.querySelector('[data-testid="listening-zone-listen-via-extension"]')).toBeNull();
    });
});

describe("Jukebox playback controls", () => {
    const homeRoom: JamRoom = { ...room, jam: { home: true, hostUuid: "host", hostName: "Host" } };
    let reportPlayback: ((state: SpotifyPlaybackState | null) => void) | undefined;
    const playback: SpotifyPlaybackState = {
        track: { uri: "spotify:track:abc", title: "Song", artist: "Artist", artworkUrl: "" },
        playing: false,
        positionMs: 5000,
        durationMs: 120000,
        volume: 0.5,
        shuffle: false,
        repeat: 0,
    };
    beforeEach(() => {
        mocks.setRooms([homeRoom]);
        vi.stubGlobal("WAD", {
            controlSpotifyPlayback: vi.fn(),
            watchSpotifyPlayback: (callback: (state: SpotifyPlaybackState | null) => void) => {
                reportPlayback = callback;
                callback(playback);
                return () => {
                    reportPlayback = undefined;
                };
            },
        });
    });
    afterEach(() => vi.unstubAllGlobals());
    it("shows play, pause and next only for the creator and routes each command", () => {
        mocks.local = true;
        listenAlongAvailableStore.set(true);
        render();
        for (const command of [
            SpotifyPlaybackCommand.Play,
            SpotifyPlaybackCommand.Pause,
            SpotifyPlaybackCommand.Previous,
            SpotifyPlaybackCommand.Next,
            SpotifyPlaybackCommand.Shuffle,
            SpotifyPlaybackCommand.Repeat,
        ]) {
            reportPlayback?.({ ...playback, playing: command === SpotifyPlaybackCommand.Pause });
            flushSync();
            const button = target.querySelector<HTMLButtonElement>(`[data-testid="jukebox-${command}"]`);
            expect(button?.disabled).toBe(false);
            button?.click();
            expect(mocks.playback).toHaveBeenLastCalledWith(homeRoom, { command });
        }
    });
    it("hides the controls for guests", () => {
        listenAlongAvailableStore.set(true);
        render();
        expect(target.querySelector('[data-testid="jukebox-play"]')).toBeNull();
        expect(target.querySelector('[data-testid="jukebox-pause"]')).toBeNull();
        expect(target.querySelector('[data-testid="jukebox-next"]')).toBeNull();
    });
    it("renders Spotify metadata, seeks and adjusts volume, then cleans up its subscription", async () => {
        mocks.local = true;
        listenAlongAvailableStore.set(true);
        render();
        expect(target.textContent).toContain("Song");
        expect(target.textContent).toContain("Artist");
        for (const [id, value, command] of [
            ["jukebox-seek", "30000", SpotifyPlaybackCommand.Seek],
            ["jukebox-volume", "0.3", SpotifyPlaybackCommand.Volume],
        ] as const) {
            const input = target.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
            if (!input) throw new Error("Missing player slider");
            input.value = value;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            expect(mocks.playback).toHaveBeenLastCalledWith(homeRoom, { command, value: Number(value) });
        }
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        expect(reportPlayback).toBeUndefined();
    });
    it("waits for a fresh playback snapshot after disconnect instead of sending commands from stale state", () => {
        mocks.local = true;
        listenAlongAvailableStore.set(true);
        render();
        reportPlayback?.(null);
        flushSync();
        expect(target.querySelector<HTMLButtonElement>('[data-testid="jukebox-play"]')?.disabled).toBe(true);
        reportPlayback?.({ ...playback, playing: true, shuffle: true, repeat: 2 });
        flushSync();
        expect(target.querySelector<HTMLButtonElement>('[data-testid="jukebox-pause"]')?.disabled).toBe(false);
        expect(target.querySelector('[data-testid="jukebox-shuffle"]')?.getAttribute("aria-pressed")).toBe("true");
        expect(target.querySelector('[data-testid="jukebox-repeat"]')?.getAttribute("aria-label")).toBe("Repeat one");
    });
    it("shows the asked play state at once, until Spotify confirms it", () => {
        mocks.local = true;
        listenAlongAvailableStore.set(true);
        render();
        reportPlayback?.({ ...playback, playing: true });
        flushSync();
        target.querySelector<HTMLButtonElement>('[data-testid="jukebox-pause"]')?.click();
        flushSync();
        // Spotify still reports the old state: the button already shows what was asked, a second click resumes.
        reportPlayback?.({ ...playback, playing: true });
        flushSync();
        expect(target.querySelector('[data-testid="jukebox-play"]')).not.toBeNull();
        reportPlayback?.({ ...playback, playing: false });
        flushSync();
        expect(target.querySelector('[data-testid="jukebox-play"]')).not.toBeNull();
        expect(mocks.playback).toHaveBeenCalledTimes(1);
    });
    it("disables commands when Spotify disconnects and restores them when it reconnects", () => {
        mocks.local = true;
        render();
        const play = target.querySelector<HTMLButtonElement>('[data-testid="jukebox-play"]');
        expect(play?.disabled).toBe(true);
        play?.click();
        expect(mocks.playback).not.toHaveBeenCalled();
        listenAlongAvailableStore.set(true);
        flushSync();
        expect(play?.disabled).toBe(false);
        listenAlongAvailableStore.set(false);
        flushSync();
        expect(play?.disabled).toBe(true);
    });
});

describe("Live room", () => {
    it("shows Live without a Spotify track, invite or extension action", () => {
        mocks.setRooms([{ ...room, jam: { live: true, hostUuid: "host", hostName: "Host" } }]);
        listenAlongAvailableStore.set(true);
        render();
        expect(target.textContent).toContain("Live of Host");
        expect(target.textContent).not.toContain("Track");
        expect(target.querySelector('[data-testid="listening-zone-join"]')).toBeNull();
        expect(target.querySelector('[data-testid="listening-zone-listen-via-extension"]')).toBeNull();
        expect(target.querySelector('[data-testid="jukebox-queue-toggle"]')).toBeNull();
        expect(target.querySelector('[data-testid="jam-karaoke-open"]')).toBeNull();
    });

    it("lets a joined guest leave without following the host's Spotify", () => {
        mocks.setRooms([{ ...room, jam: { live: true, hostUuid: "host", hostName: "Host" } }]);
        joinedJamStore.set({ areaId: "area", areaName: "Music", hostUuid: "host", url: "live:host" });
        listenAlongAvailableStore.set(true);
        render();
        expect(target.querySelector('[data-testid="listening-zone-listen-via-extension"]')).toBeNull();
        const leave = target.querySelector<HTMLButtonElement>('[data-testid="listening-zone-join"]');
        expect(leave?.textContent).toContain("Leave");
        leave?.click();
        expect(mocks.join).toHaveBeenCalledTimes(1);
    });
});
