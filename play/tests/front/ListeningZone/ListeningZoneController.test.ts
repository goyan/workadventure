import type { ListeningZoneJam } from "@workadventure/map-editor";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUserStore } from "../../../src/front/Connection/LocalUserStore";
import {
    joinHomeJam,
    joinJam,
    leaveJam,
    shareJam,
    startHomeJam,
    syncJoinedJam,
} from "../../../src/front/ListeningZone/ListeningZoneController";
import { currentListeningZoneStore, joinedJamStore } from "../../../src/front/ListeningZone/ListeningZoneStore";
import type { AreaPropertyVariablesManager } from "../../../src/front/Phaser/Game/AreaPropertyVariablesManager";
import { followedUserUuidStore } from "../../../src/front/Spotify/ListeningFollower";
import { areaPropertyVariablesManagerStore } from "../../../src/front/Stores/AreaPropertyVariablesStore";

const zone = { areaId: "lounge", propertyId: "listening", areaName: "Lounge" };
const spotifyRoom: ListeningZoneJam = { url: "https://spotify.link/theirs", hostUuid: "dj", hostName: "DJ" };
const homeRoom: ListeningZoneJam = { home: true, hostUuid: "nat", hostName: "Nat" };

describe("Jam rooms of a listening zone", () => {
    let rooms: ListeningZoneJam[] = [];
    const variableChanges = writable<unknown>(undefined);
    const setRooms = (next: ListeningZoneJam[]) => {
        rooms = next;
        variableChanges.set({});
    };
    const setVariable = vi.fn((_areaId: string, _propertyId: string, _key: string, value: unknown) => {
        setRooms((value as ListeningZoneJam[] | null) ?? []);
    });

    beforeEach(() => {
        vi.spyOn(localUserStore, "getLocalUser").mockReturnValue({ uuid: "me" } as ReturnType<
            typeof localUserStore.getLocalUser
        >);
        vi.spyOn(localUserStore, "getName").mockReturnValue("Me");
        vi.spyOn(window, "open").mockReturnValue(null);
        areaPropertyVariablesManagerStore.set({
            variableChanges,
            getVariable: () => rooms,
            setVariable,
        } as unknown as AreaPropertyVariablesManager);
        currentListeningZoneStore.set(zone);
        joinedJamStore.set(undefined);
        followedUserUuidStore.set(undefined);
        rooms = [];
        setVariable.mockClear();
    });

    afterEach(() => {
        areaPropertyVariablesManagerStore.set(undefined);
        currentListeningZoneStore.set(undefined);
        vi.restoreAllMocks();
    });

    it("opens our room next to the others, and puts us in it once the server accepted it", () => {
        const unsubscribe = syncJoinedJam();
        setRooms([homeRoom]);

        shareJam("https://spotify.link/mine");

        expect(rooms).toEqual([homeRoom, { url: "https://spotify.link/mine", hostUuid: "me", hostName: "Me" }]);
        expect(get(joinedJamStore)).toMatchObject({ url: "https://spotify.link/mine", hostUuid: "me" });
        unsubscribe();
    });

    it("replaces our room when we open another kind: one room per user", () => {
        const unsubscribe = syncJoinedJam();
        shareJam("https://spotify.link/mine");

        startHomeJam();

        expect(rooms).toEqual([{ home: true, hostUuid: "me", hostName: "Me" }]);
        expect(get(joinedJamStore)).toMatchObject({ url: "home:me" });
        unsubscribe();
    });

    it("joins one room at a time: joining another leaves the home Jam and its follow", () => {
        const unsubscribe = syncJoinedJam();
        setRooms([spotifyRoom, homeRoom]);

        joinHomeJam(homeRoom);
        expect(get(followedUserUuidStore)).toBe("nat");
        expect(get(joinedJamStore)).toEqual({ areaId: "lounge", areaName: "Lounge", url: "home:nat", hostUuid: "nat" });

        joinJam(spotifyRoom);
        expect(get(followedUserUuidStore)).toBeUndefined();
        expect(get(joinedJamStore)).toMatchObject({ url: spotifyRoom.url, hostUuid: "dj" });
        unsubscribe();
    });

    it("forgets a joined room once its host closes it, and keeps the others", () => {
        const unsubscribe = syncJoinedJam();
        setRooms([spotifyRoom, homeRoom]);
        joinHomeJam(homeRoom);

        setRooms([spotifyRoom]);

        expect(get(joinedJamStore)).toBeUndefined();
        expect(get(followedUserUuidStore)).toBeUndefined();
        unsubscribe();
    });

    it("ends the home Jam for a guest who stops listening along from the host's card", () => {
        const unsubscribe = syncJoinedJam();
        setRooms([homeRoom]);
        joinHomeJam(homeRoom);

        followedUserUuidStore.set(undefined);

        expect(get(joinedJamStore)).toBeUndefined();
        unsubscribe();
    });

    it("leaves a room on request", () => {
        const unsubscribe = syncJoinedJam();
        setRooms([homeRoom]);
        joinHomeJam(homeRoom);

        leaveJam();

        expect(get(joinedJamStore)).toBeUndefined();
        expect(get(followedUserUuidStore)).toBeUndefined();
        unsubscribe();
    });
});
