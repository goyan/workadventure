import type { ListeningZoneJam } from "@workadventure/map-editor";
import type { SpotifyListening } from "@workadventure/messages";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_SPOTIFY_LISTENING } from "../../../src/common/SpotifyListening";
import type { WorkAdventureDesktopApi } from "../../../src/front/Interfaces/DesktopAppInterfaces";
import type { JoinedJam, ListeningZone } from "../../../src/front/ListeningZone/ListeningZoneStore";
import { HOME_JAM_QUEUE_EVENT, startHomeJam } from "../../../src/front/Spotify/HomeJam";

const ZONE: ListeningZone = { areaId: "zone-1", propertyId: "prop", areaName: "Salon" };
const USERS = [
    { id: 1, uuid: "host", name: "Nat" },
    { id: 2, uuid: "guest", name: "Amine" },
    { id: 3, uuid: "stranger", name: "Bob" },
];
const homeJam: ListeningZoneJam = { home: true, hostUuid: "host", hostName: "Nat" };
const inJam = (areaId: string): SpotifyListening => ({ ...EMPTY_SPOTIFY_LISTENING, jamAreaId: areaId });

function createHarness(localUuid: string) {
    const jam = writable<ListeningZoneJam | null>(homeJam);
    const joined = writable<JoinedJam | undefined>(undefined);
    const listening = writable(new Map<string, SpotifyListening>());
    let onQueueRequest: ((uris: string[]) => void) | undefined;
    let eventListener: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
    const desktop = {
        desktop: true,
        setHomeJam: vi.fn(),
        onQueueRequest: (callback: (uris: string[]) => void) => (onQueueRequest = callback),
        enqueueOnSpotify: vi.fn(),
    } as unknown as WorkAdventureDesktopApi;
    const sendToUser = vi.fn();
    let now = 0;
    const stop = startHomeJam({
        zone: writable(ZONE),
        jam,
        joined,
        listeningByUserUuid: listening,
        localUuid: () => localUuid,
        userByUuid: (uuid) => USERS.find((user) => user.uuid === uuid),
        userById: (id) => USERS.find((user) => user.id === id),
        sendToUser,
        onEvent: (listener) => {
            eventListener = listener;
            return () => (eventListener = undefined);
        },
        desktop,
        now: () => now,
    });
    return {
        jam,
        joined,
        listening,
        desktop,
        sendToUser,
        stop,
        queueFromSpotify: (uris: string[]) => onQueueRequest?.(uris),
        receive: (data: unknown, senderId: number) => eventListener?.(HOME_JAM_QUEUE_EVENT, data, senderId),
        advance: (ms: number) => (now += ms),
    };
}

describe("home Jam, as a guest", () => {
    it("tells the desktop app while in the home Jam, so that Spotify offers to add tracks to it", () => {
        const guest = createHarness("guest");
        expect(guest.desktop.setHomeJam).not.toHaveBeenCalled();

        guest.joined.set({ areaId: ZONE.areaId, areaName: ZONE.areaName, url: "home:host" });
        expect(guest.desktop.setHomeJam).toHaveBeenLastCalledWith({ hostName: "Nat" });

        guest.joined.set(undefined);
        expect(guest.desktop.setHomeJam).toHaveBeenLastCalledWith(null);
    });

    it("sends the tracks added from Spotify to the host, and nothing outside the home Jam", () => {
        const guest = createHarness("guest");
        guest.queueFromSpotify(["spotify:track:abc"]);
        expect(guest.sendToUser).not.toHaveBeenCalled();

        guest.joined.set({ areaId: ZONE.areaId, areaName: ZONE.areaName, url: "home:host" });
        guest.queueFromSpotify(["spotify:track:abc", "spotify:track:def"]);
        guest.queueFromSpotify(["spotify:episode:abc"]);

        expect(guest.sendToUser.mock.calls).toEqual([[1, { uris: ["spotify:track:abc", "spotify:track:def"] }]]);
    });
});

describe("home Jam, as the host", () => {
    it("adds a participant's tracks to its Spotify queue, with their name", () => {
        const host = createHarness("host");
        host.listening.set(new Map([["guest", inJam(ZONE.areaId)]]));

        host.receive({ uris: ["spotify:track:abc"] }, 2);

        expect(host.desktop.enqueueOnSpotify).toHaveBeenCalledWith({ uris: ["spotify:track:abc"], from: "Amine" });
    });

    it("ignores users outside its home Jam, invalid tracks, and a Jam it does not host", () => {
        const host = createHarness("host");
        host.listening.set(new Map([["guest", inJam(ZONE.areaId)]]));

        host.receive({ uris: ["spotify:track:abc"] }, 3);
        host.receive({ uris: ["javascript:alert(1)"] }, 2);
        host.jam.set({ home: true, hostUuid: "guest", hostName: "Amine" });
        host.receive({ uris: ["spotify:track:abc"] }, 2);

        expect(host.desktop.enqueueOnSpotify).not.toHaveBeenCalled();
    });

    it("limits how often one participant adds tracks", () => {
        const host = createHarness("host");
        host.listening.set(new Map([["guest", inJam(ZONE.areaId)]]));

        for (let request = 0; request < 12; request++) host.receive({ uris: ["spotify:track:abc"] }, 2);
        expect(host.desktop.enqueueOnSpotify).toHaveBeenCalledTimes(10);

        host.advance(60_000);
        host.receive({ uris: ["spotify:track:abc"] }, 2);
        expect(host.desktop.enqueueOnSpotify).toHaveBeenCalledTimes(11);
    });
});

describe("home Jam without the desktop app", () => {
    it("does nothing", () => {
        const stop = startHomeJam({
            zone: writable(ZONE),
            jam: writable(homeJam),
            joined: writable(undefined),
            listeningByUserUuid: writable(new Map()),
            localUuid: () => "guest",
            userByUuid: () => undefined,
            userById: () => undefined,
            sendToUser: vi.fn(),
            onEvent: vi.fn(),
            desktop: undefined,
        });
        expect(stop).toBeTypeOf("function");
    });
});
