import type { SpotifyListening } from "@workadventure/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import type { JamRoom } from "../../../../src/front/ListeningZone/ListeningZoneController";
import { EMPTY_SPOTIFY_LISTENING } from "../../../../src/common/SpotifyListening";
import { followedUserUuidStore, listenAlongAvailableStore } from "../../../../src/front/Spotify/ListeningFollower";
import JamRoomsList from "../../../../src/front/Components/ListeningZone/JamRoomsList.svelte";

const mocks = vi.hoisted(() => ({
    setRooms: vi.fn<(rooms: JamRoom[]) => void>(),
    setListening: vi.fn<(listening: Map<string, SpotifyListening>) => void>(),
    join: vi.fn(),
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
    jamAudioSession: { leave: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../../../src/front/Stores/MediaStore", async () => ({
    requestedMicrophoneDeviceIdStore: (await import("svelte/store")).readable(undefined),
}));
vi.mock("../../../../src/front/Components/ListeningZone/JamAudioControls.svelte", async () => ({
    default: (await import("../JamRoomsListStub.svelte")).default,
}));
vi.mock("../../../../src/front/Spotify/HomeJam", async () => ({
    jukeboxQueuesStore: (await import("svelte/store")).writable(new Map()),
}));
vi.mock("../../../../src/front/Components/ListeningZone/JukeboxQueue.svelte", async () => ({
    default: (await import("../../../../src/front/Components/UI/Button.svelte")).default,
}));
vi.mock("../../../../src/i18n/i18n-svelte", async () => ({
    LL: (await import("svelte/store")).readable({
        spotify: {
            card: { stopListeningAlong: () => "Stop listening" },
            listeningZone: {
                kindSpotify: () => "Spotify",
                kindHome: () => "Jukebox",
                hostedBy: () => "Host",
                participants: () => "Participants",
                join: () => "Join Spotify",
                leave: () => "Leave",
                listenViaExtension: () => "Listen via extension",
                stop: () => "Stop sharing",
                stopHome: () => "Stop sharing",
                queue: () => "Queue",
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
    mocks.join.mockClear();
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
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.replaceChildren();
    followedUserUuidStore.set(undefined);
    listenAlongAvailableStore.set(false);
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
