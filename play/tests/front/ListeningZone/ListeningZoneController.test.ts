import type { ListeningZoneJam } from "@workadventure/map-editor";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUserStore } from "../../../src/front/Connection/LocalUserStore";
import {
    allJamRoomsStore,
    type JamRoom,
    joinHomeJam,
    joinJam,
    leaveJam,
    leaveListeningZone,
    shareJam,
    startHomeJam,
    stopSharingJam,
    syncJoinedJam,
    updateOwnRoom,
} from "../../../src/front/ListeningZone/ListeningZoneController";
import {
    currentListeningZoneStore,
    joinedJamStore,
    listeningZoneNamesStore,
} from "../../../src/front/ListeningZone/ListeningZoneStore";
import type { AreaPropertyVariablesManager } from "../../../src/front/Phaser/Game/AreaPropertyVariablesManager";
import { followedUserUuidStore } from "../../../src/front/Spotify/ListeningFollower";
import { areaPropertyVariablesManagerStore } from "../../../src/front/Stores/AreaPropertyVariablesStore";

const lounge = { areaId: "lounge", propertyId: "listening", areaName: "Lounge" };
const patio = { areaId: "patio", propertyId: "listening", areaName: "Patio" };
const spotifyJam: ListeningZoneJam = { url: "https://spotify.link/theirs", hostUuid: "dj", hostName: "DJ" };
const homeJam: ListeningZoneJam = { home: true, hostUuid: "nat", hostName: "Nat" };

describe("Jam rooms", () => {
    // The Jam variable of each zone, by "areaId::propertyId".
    const variables = new Map<string, ListeningZoneJam[]>();
    const variableChanges = writable<unknown>(undefined);
    const setRooms = (zone: typeof lounge, rooms: ListeningZoneJam[]) => {
        variables.set(`${zone.areaId}::${zone.propertyId}`, rooms);
        variableChanges.set({});
    };
    const roomsOf = (zone: typeof lounge) => variables.get(`${zone.areaId}::${zone.propertyId}`) ?? [];
    const room = (zone: typeof lounge, jam: ListeningZoneJam): JamRoom => ({ zone, jam });

    beforeEach(() => {
        vi.spyOn(localUserStore, "getLocalUser").mockReturnValue({ uuid: "me" } as ReturnType<
            typeof localUserStore.getLocalUser
        >);
        // An OpenID login: the session name is known, the stored one is empty.
        vi.spyOn(localUserStore, "getDisplayNameForMatrixProfile").mockReturnValue("Me");
        vi.spyOn(localUserStore, "getName").mockReturnValue(null);
        vi.spyOn(window, "open").mockReturnValue(null);
        variables.clear();
        localStorage.clear();
        listeningZoneNamesStore.set(
            new Map([
                ["lounge", "Lounge"],
                ["patio", "Patio"],
            ]),
        );
        areaPropertyVariablesManagerStore.set({
            variableChanges,
            getVariablesWithKey: () =>
                [...variables.entries()].map(([key, value]) => {
                    const [areaId, propertyId] = key.split("::");
                    return { areaId, propertyId, value };
                }),
            setVariable: (areaId: string, propertyId: string, _key: string, value: unknown) =>
                setRooms({ areaId, propertyId, areaName: "" }, (value as ListeningZoneJam[] | null) ?? []),
        } as unknown as AreaPropertyVariablesManager);
        currentListeningZoneStore.set(lounge);
        joinedJamStore.set(undefined);
        followedUserUuidStore.set(undefined);
    });

    afterEach(() => {
        areaPropertyVariablesManagerStore.set(undefined);
        currentListeningZoneStore.set(undefined);
        vi.restoreAllMocks();
    });

    it("lists the rooms of every zone, with the zone they were opened in", () => {
        setRooms(lounge, [spotifyJam]);
        setRooms(patio, [homeJam]);

        expect(get(allJamRoomsStore)).toEqual([room(lounge, spotifyJam), room(patio, homeJam)]);
    });

    it("opens our room, titled, with the session name, and puts us in it", () => {
        const unsubscribe = syncJoinedJam();
        setRooms(lounge, [homeJam]);

        shareJam("https://spotify.link/mine", "  Vendredi rock ");

        expect(roomsOf(lounge)).toEqual([
            homeJam,
            { url: "https://spotify.link/mine", hostUuid: "me", hostName: "Me", title: "Vendredi rock" },
        ]);
        expect(get(joinedJamStore)).toMatchObject({ url: "https://spotify.link/mine", hostUuid: "me" });
        unsubscribe();
    });

    it("moves our room when we open one in another zone: one room per user", () => {
        const unsubscribe = syncJoinedJam();
        shareJam("https://spotify.link/mine");

        currentListeningZoneStore.set(patio);
        startHomeJam();

        expect(roomsOf(lounge)).toEqual([]);
        expect(roomsOf(patio)).toEqual([{ home: true, hostUuid: "me", hostName: "Me" }]);
        unsubscribe();
    });

    it("keeps our room when we walk out of the zone, and closes it on request from anywhere", () => {
        const unsubscribe = syncJoinedJam();
        shareJam("https://spotify.link/mine");

        leaveListeningZone(lounge.propertyId);
        expect(roomsOf(lounge)).toHaveLength(1);

        stopSharingJam();
        expect(roomsOf(lounge)).toEqual([]);
        unsubscribe();
    });

    it("lets the host rename the room and switch the DJ mode of a Jukebox", () => {
        const unsubscribe = syncJoinedJam();
        setRooms(lounge, [spotifyJam]);
        startHomeJam("Old school");

        updateOwnRoom({ title: "Vendredi rock" });
        updateOwnRoom({ djMode: true });
        expect(roomsOf(lounge)[1]).toEqual({
            home: true,
            hostUuid: "me",
            hostName: "Me",
            title: "Vendredi rock",
            djMode: true,
        });

        updateOwnRoom({ title: "  " });
        expect(JSON.parse(JSON.stringify(roomsOf(lounge)[1]))).toEqual({
            home: true,
            hostUuid: "me",
            hostName: "Me",
            djMode: true,
        });
        expect(roomsOf(lounge)[0]).toEqual(spotifyJam);
        unsubscribe();
    });

    it("joins a room from anywhere, one at a time, and stays in it out of the zone", () => {
        const unsubscribe = syncJoinedJam();
        setRooms(lounge, [spotifyJam]);
        setRooms(patio, [homeJam]);
        currentListeningZoneStore.set(undefined);

        joinHomeJam(room(patio, homeJam));
        expect(get(followedUserUuidStore)).toBe("nat");
        expect(get(joinedJamStore)).toEqual({ areaId: "patio", areaName: "Patio", url: "home:nat", hostUuid: "nat" });

        joinJam(room(lounge, spotifyJam));
        expect(get(followedUserUuidStore)).toBeUndefined();
        expect(get(joinedJamStore)).toMatchObject({ areaId: "lounge", url: spotifyJam.url });
        unsubscribe();
    });

    it("forgets a joined room once its host closes it, and stops following its host", () => {
        const unsubscribe = syncJoinedJam();
        setRooms(patio, [homeJam]);
        joinHomeJam(room(patio, homeJam));

        setRooms(patio, []);

        expect(get(joinedJamStore)).toBeUndefined();
        expect(get(followedUserUuidStore)).toBeUndefined();
        unsubscribe();
    });

    it("keeps the Jam and follow while the room variables are unavailable during reconnect", () => {
        const unsubscribe = syncJoinedJam();
        setRooms(patio, [homeJam]);
        joinHomeJam(room(patio, homeJam));
        const manager = get(areaPropertyVariablesManagerStore);

        areaPropertyVariablesManagerStore.set(undefined);
        expect(get(joinedJamStore)).toMatchObject({ url: "home:nat" });
        expect(get(followedUserUuidStore)).toBe("nat");
        areaPropertyVariablesManagerStore.set(manager);
        expect(get(joinedJamStore)).toMatchObject({ url: "home:nat" });
        unsubscribe();
    });

    it("ends the home Jam for a guest who stops listening along from the host's card", () => {
        const unsubscribe = syncJoinedJam();
        setRooms(patio, [homeJam]);
        joinHomeJam(room(patio, homeJam));

        followedUserUuidStore.set(undefined);

        expect(get(joinedJamStore)).toBeUndefined();
        unsubscribe();
    });

    describe("after a reload", () => {
        /** A reload: the page forgets everything but what the browser stored. */
        function reload(zone: typeof lounge, rooms: ListeningZoneJam[]) {
            joinedJamStore.set(undefined);
            followedUserUuidStore.set(undefined);
            setRooms(zone, rooms);
        }

        it("joins the home Jam again, wherever we are, and follows its host again", () => {
            const unsubscribe = syncJoinedJam();
            setRooms(patio, [homeJam]);
            joinHomeJam(room(patio, homeJam));
            currentListeningZoneStore.set(undefined);

            reload(patio, [homeJam]);

            expect(get(joinedJamStore)).toMatchObject({ url: "home:nat" });
            expect(get(followedUserUuidStore)).toBe("nat");
            unsubscribe();
        });

        it("shows the Spotify Jam joined again, without opening its link again", () => {
            const unsubscribe = syncJoinedJam();
            setRooms(lounge, [spotifyJam]);
            joinJam(room(lounge, spotifyJam));
            vi.mocked(window.open).mockClear();

            reload(lounge, [spotifyJam]);

            expect(get(joinedJamStore)).toMatchObject({ url: spotifyJam.url });
            expect(window.open).not.toHaveBeenCalled();
            unsubscribe();
        });

        it("does not join again a room left on purpose", () => {
            const unsubscribe = syncJoinedJam();
            setRooms(patio, [homeJam]);
            joinHomeJam(room(patio, homeJam));
            leaveJam();

            reload(patio, [homeJam]);

            expect(get(joinedJamStore)).toBeUndefined();
            unsubscribe();
        });
    });
});
