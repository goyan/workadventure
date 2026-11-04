import type { ListeningZoneJam } from "@workadventure/map-editor";
import type { SpotifyListening } from "@workadventure/messages";
import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SPOTIFY_LISTENING } from "../../../src/common/SpotifyListening";
import type { JukeboxTrack, WorkAdventureDesktopApi } from "../../../src/front/Interfaces/DesktopAppInterfaces";
import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";
import type { JoinedJam, ListeningZone } from "../../../src/front/ListeningZone/ListeningZoneStore";
import {
    HOME_JAM_QUEUE_EVENT,
    jukeboxQueuesStore,
    JUKEBOX_MOVE_EVENT,
    likeTrack,
    moveInJukebox,
    JUKEBOX_REMOVE_EVENT,
    JUKEBOX_STATE_EVENT,
    JUKEBOX_STATE_REQUEST_EVENT,
    removeFromJukebox,
    requestJukeboxQueue,
    startHomeJam,
    trackUriOf,
} from "../../../src/front/Spotify/HomeJam";

const ZONE: ListeningZone = { areaId: "zone-1", propertyId: "prop", areaName: "Salon" };
const USERS = [
    { id: 1, uuid: "host", name: "Nat" },
    { id: 2, uuid: "guest", name: "Amine" },
    { id: 3, uuid: "stranger", name: "Bob" },
];
const homeJam: ListeningZoneJam = { home: true, hostUuid: "host", hostName: "Nat" };
const inRoom = (areaId: string, hostUuid: string): SpotifyListening => ({
    ...EMPTY_SPOTIFY_LISTENING,
    jamAreaId: areaId,
    jamHostUuid: hostUuid,
});
const joinedHome = { areaId: ZONE.areaId, areaName: ZONE.areaName, url: "home:host", hostUuid: "host" };
const queued: JukeboxTrack = {
    uri: "spotify:track:abc",
    uid: "q1",
    title: "Song",
    artist: "Artist",
    artworkUrl: "",
    addedBy: "Amine",
    addedByUuid: "guest",
};

function createHarness(localUuid: string, jam: ListeningZoneJam = homeJam) {
    // Another room on the map, a Spotify Jam: it must not get in the way.
    const rooms = writable<JamRoom[]>([
        { zone: ZONE, jam: { url: "https://spotify.link/abc123", hostUuid: "stranger", hostName: "Bob" } },
        { zone: ZONE, jam },
    ]);
    const joined = writable<JoinedJam | undefined>(undefined);
    const listening = writable(new Map<string, SpotifyListening>());
    let onQueueRequest: ((uris: string[]) => void) | undefined;
    let onSpotifyQueue: ((tracks: JukeboxTrack[]) => void) | undefined;
    let eventListener: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
    const desktop = {
        desktop: true,
        setHomeJam: vi.fn(),
        onQueueRequest: (callback: (uris: string[]) => void) => (onQueueRequest = callback),
        enqueueOnSpotify: vi.fn(),
        dequeueOnSpotify: vi.fn(),
        moveInSpotifyQueue: vi.fn(),
        watchSpotifyQueue: (callback: (tracks: JukeboxTrack[]) => void) => {
            onSpotifyQueue = callback;
            return () => (onSpotifyQueue = undefined);
        },
    } as unknown as WorkAdventureDesktopApi;
    const send = vi.fn();
    let now = 0;
    const stop = startHomeJam({
        rooms,
        joined,
        listeningByUserUuid: listening,
        localUuid: () => localUuid,
        userByUuid: (uuid) => USERS.find((user) => user.uuid === uuid),
        userById: (id) => USERS.find((user) => user.id === id),
        send,
        onEvent: (listener) => {
            eventListener = listener;
            return () => (eventListener = undefined);
        },
        desktop,
        now: () => now,
    });
    return {
        rooms,
        joined,
        listening,
        desktop,
        send,
        stop,
        queueFromSpotify: (uris: string[]) => onQueueRequest?.(uris),
        spotifyQueueChanges: (tracks: JukeboxTrack[]) => onSpotifyQueue?.(tracks),
        receive: (name: string, data: unknown, senderId: number) => eventListener?.(name, data, senderId),
        advance: (ms: number) => (now += ms),
    };
}

afterEach(() => {
    jukeboxQueuesStore.set(new Map());
});

describe("Jukebox, as a guest", () => {
    it("tells the desktop app while in the Jukebox, so that Spotify offers to add tracks to it", () => {
        const guest = createHarness("guest");
        expect(guest.desktop.setHomeJam).not.toHaveBeenCalled();

        guest.joined.set(joinedHome);
        expect(guest.desktop.setHomeJam).toHaveBeenLastCalledWith({ hostName: "Nat" });

        guest.joined.set(undefined);
        expect(guest.desktop.setHomeJam).toHaveBeenLastCalledWith(null);
        guest.stop();
    });

    it("sends the tracks added from Spotify to the host, and nothing outside the Jukebox", () => {
        const guest = createHarness("guest");
        guest.queueFromSpotify(["spotify:track:abc"]);
        expect(guest.send).not.toHaveBeenCalled();

        guest.joined.set(joinedHome);
        guest.queueFromSpotify(["spotify:track:abc", "spotify:track:def"]);
        guest.queueFromSpotify(["spotify:episode:abc"]);

        expect(guest.send.mock.calls).toEqual([
            [HOME_JAM_QUEUE_EVENT, { uris: ["spotify:track:abc", "spotify:track:def"] }, [1]],
        ]);
        guest.stop();
    });

    it("keeps the queue only its host sends, and asks the host for it", () => {
        const guest = createHarness("guest");

        guest.receive(JUKEBOX_STATE_EVENT, { tracks: [queued] }, 3);
        expect(get(jukeboxQueuesStore).get("stranger")).toBeUndefined();
        guest.receive(JUKEBOX_STATE_EVENT, { tracks: [queued] }, 1);
        expect(get(jukeboxQueuesStore).get("host")).toEqual([queued]);

        requestJukeboxQueue("host");
        expect(guest.send).toHaveBeenLastCalledWith(JUKEBOX_STATE_REQUEST_EVENT, {}, [1]);
        guest.stop();
    });

    it("asks the host to remove a track", () => {
        const guest = createHarness("guest");

        removeFromJukebox({ zone: ZONE, jam: homeJam }, queued);

        expect(guest.send).toHaveBeenLastCalledWith(JUKEBOX_REMOVE_EVENT, { uri: queued.uri, uid: queued.uid }, [1]);
        guest.stop();
    });
});

describe("Jukebox, as the host", () => {
    it("adds a participant's tracks to its Spotify queue, with their name", () => {
        const host = createHarness("host");
        host.listening.set(new Map([["guest", inRoom(ZONE.areaId, "host")]]));

        host.receive(HOME_JAM_QUEUE_EVENT, { uris: ["spotify:track:abc"] }, 2);

        expect(host.desktop.enqueueOnSpotify).toHaveBeenCalledWith({
            uris: ["spotify:track:abc"],
            from: "Amine",
            fromUuid: "guest",
        });
        host.stop();
    });

    it("ignores users of another room, invalid tracks, and a Jukebox it does not host", () => {
        const host = createHarness("host");
        host.listening.set(
            new Map([
                ["guest", inRoom(ZONE.areaId, "host")],
                ["stranger", inRoom(ZONE.areaId, "stranger")],
            ]),
        );

        host.receive(HOME_JAM_QUEUE_EVENT, { uris: ["spotify:track:abc"] }, 3);
        host.receive(HOME_JAM_QUEUE_EVENT, { uris: ["javascript:alert(1)"] }, 2);
        host.rooms.set([{ zone: ZONE, jam: { home: true, hostUuid: "guest", hostName: "Amine" } }]);
        host.receive(HOME_JAM_QUEUE_EVENT, { uris: ["spotify:track:abc"] }, 2);

        expect(host.desktop.enqueueOnSpotify).not.toHaveBeenCalled();
        host.stop();
    });

    it("limits how often one participant adds tracks", () => {
        const host = createHarness("host");
        host.listening.set(new Map([["guest", inRoom(ZONE.areaId, "host")]]));

        for (let request = 0; request < 12; request++) {
            host.receive(HOME_JAM_QUEUE_EVENT, { uris: ["spotify:track:abc"] }, 2);
        }
        expect(host.desktop.enqueueOnSpotify).toHaveBeenCalledTimes(10);

        host.advance(60_000);
        host.receive(HOME_JAM_QUEUE_EVENT, { uris: ["spotify:track:abc"] }, 2);
        expect(host.desktop.enqueueOnSpotify).toHaveBeenCalledTimes(11);
        host.stop();
    });

    it("shares its Spotify queue with everyone, and with whoever asks for it", () => {
        const host = createHarness("host");

        host.spotifyQueueChanges([queued]);
        expect(host.send).toHaveBeenLastCalledWith(JUKEBOX_STATE_EVENT, { tracks: [queued] }, []);
        expect(get(jukeboxQueuesStore).get("host")).toEqual([queued]);

        host.receive(JUKEBOX_STATE_REQUEST_EVENT, {}, 3);
        expect(host.send).toHaveBeenLastCalledWith(JUKEBOX_STATE_EVENT, { tracks: [queued] }, [3]);
        host.stop();
    });

    it("removes a participant's choice, but not in DJ mode, and never for an outsider", () => {
        const host = createHarness("host");
        host.listening.set(new Map([["guest", inRoom(ZONE.areaId, "host")]]));
        const removal = { uri: queued.uri, uid: queued.uid };

        host.receive(JUKEBOX_REMOVE_EVENT, removal, 3);
        expect(host.desktop.dequeueOnSpotify).not.toHaveBeenCalled();
        host.receive(JUKEBOX_REMOVE_EVENT, removal, 2);
        expect(host.desktop.dequeueOnSpotify).toHaveBeenCalledWith(removal);

        host.rooms.set([{ zone: ZONE, jam: { ...homeJam, djMode: true } }]);
        host.receive(JUKEBOX_REMOVE_EVENT, removal, 2);
        expect(host.desktop.dequeueOnSpotify).toHaveBeenCalledTimes(1);
        host.stop();
    });
});

describe("Jukebox, the one who added a track", () => {
    const other: JukeboxTrack = { ...queued, uid: "q2", addedBy: "Bob", addedByUuid: "stranger" };
    const third: JukeboxTrack = { ...queued, uid: "q3", addedBy: "", addedByUuid: "" };

    function hostWithQueue(jam: ListeningZoneJam = homeJam) {
        const host = createHarness("host", jam);
        host.listening.set(new Map([["guest", inRoom(ZONE.areaId, "host")]]));
        host.spotifyQueueChanges([other, queued, third]);
        return host;
    }

    it("still removes their own track in DJ mode, but not someone else's", () => {
        const host = hostWithQueue({ ...homeJam, djMode: true });

        host.receive(JUKEBOX_REMOVE_EVENT, { uri: other.uri, uid: other.uid }, 2);
        expect(host.desktop.dequeueOnSpotify).not.toHaveBeenCalled();

        host.receive(JUKEBOX_REMOVE_EVENT, { uri: queued.uri, uid: queued.uid }, 2);
        expect(host.desktop.dequeueOnSpotify).toHaveBeenCalledWith({ uri: queued.uri, uid: queued.uid });
        host.stop();
    });

    it("moves their own track before the previous one or after the next one, and nobody else's", () => {
        const host = hostWithQueue();

        host.receive(JUKEBOX_MOVE_EVENT, { uri: other.uri, uid: other.uid, direction: "down" }, 2);
        expect(host.desktop.moveInSpotifyQueue).not.toHaveBeenCalled();

        host.receive(JUKEBOX_MOVE_EVENT, { uri: queued.uri, uid: queued.uid, direction: "up" }, 2);
        expect(host.desktop.moveInSpotifyQueue).toHaveBeenLastCalledWith({
            uri: queued.uri,
            uid: queued.uid,
            before: { uri: other.uri, uid: other.uid },
        });
        host.receive(JUKEBOX_MOVE_EVENT, { uri: queued.uri, uid: queued.uid, direction: "down" }, 2);
        expect(host.desktop.moveInSpotifyQueue).toHaveBeenLastCalledWith({
            uri: queued.uri,
            uid: queued.uid,
            after: { uri: third.uri, uid: third.uid },
        });
        host.stop();
    });

    it("lets the host move any track directly, and asks the host for a guest's move", () => {
        const host = hostWithQueue();
        moveInJukebox({ zone: ZONE, jam: homeJam }, third, "up");
        expect(host.desktop.moveInSpotifyQueue).toHaveBeenLastCalledWith({
            uri: third.uri,
            uid: third.uid,
            before: { uri: queued.uri, uid: queued.uid },
        });
        host.stop();

        const guest = createHarness("guest");
        moveInJukebox({ zone: ZONE, jam: homeJam }, queued, "down");
        expect(guest.send).toHaveBeenLastCalledWith(
            JUKEBOX_MOVE_EVENT,
            { uri: queued.uri, uid: queued.uid, direction: "down" },
            [1],
        );
        guest.stop();
    });
});

describe("likeTrack", () => {
    it("saves a track through the desktop app, and does nothing without it", () => {
        const likeOnSpotify = vi.fn();
        expect(likeTrack("spotify:track:abc", { likeOnSpotify } as unknown as WorkAdventureDesktopApi)).toBe(true);
        expect(likeOnSpotify).toHaveBeenCalledWith({ uri: "spotify:track:abc" });
        expect(likeTrack("spotify:track:abc", undefined)).toBe(false);
        expect(likeTrack("javascript:alert(1)", { likeOnSpotify } as unknown as WorkAdventureDesktopApi)).toBe(false);
    });
});

describe("Jukebox without the desktop app", () => {
    it("still shows the queues hosts send", () => {
        let eventListener: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
        const stop = startHomeJam({
            rooms: writable([{ zone: ZONE, jam: homeJam }]),
            joined: writable(undefined),
            listeningByUserUuid: writable(new Map()),
            localUuid: () => "guest",
            userByUuid: (uuid) => USERS.find((user) => user.uuid === uuid),
            userById: (id) => USERS.find((user) => user.id === id),
            send: vi.fn(),
            onEvent: (listener) => {
                eventListener = listener;
                return () => undefined;
            },
            desktop: undefined,
        });

        eventListener?.(JUKEBOX_STATE_EVENT, { tracks: [queued] }, 1);

        expect(get(jukeboxQueuesStore).get("host")).toEqual([queued]);
        stop();
    });
});

describe("trackUriOf", () => {
    it("reads a track link or URI, and nothing else", () => {
        expect(trackUriOf(" https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x ")).toBe(
            "spotify:track:4cOdK2wGLETKBW3PvgPWqT",
        );
        expect(trackUriOf("spotify:track:abc")).toBe("spotify:track:abc");
        expect(trackUriOf("https://open.spotify.com/album/abc")).toBeUndefined();
        expect(trackUriOf("https://evil.example/track/abc")).toBeUndefined();
        expect(trackUriOf("not a link")).toBeUndefined();
    });
});
