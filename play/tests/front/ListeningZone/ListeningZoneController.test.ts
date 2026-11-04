import type { ListeningZoneJam } from "@workadventure/map-editor";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUserStore } from "../../../src/front/Connection/LocalUserStore";
import { joinHomeJam, leaveHomeJam, syncJoinedJam } from "../../../src/front/ListeningZone/ListeningZoneController";
import { currentListeningZoneStore, joinedJamStore } from "../../../src/front/ListeningZone/ListeningZoneStore";
import type { AreaPropertyVariablesManager } from "../../../src/front/Phaser/Game/AreaPropertyVariablesManager";
import { followedUserUuidStore } from "../../../src/front/Spotify/ListeningFollower";
import { areaPropertyVariablesManagerStore } from "../../../src/front/Stores/AreaPropertyVariablesStore";

const zone = { areaId: "lounge", propertyId: "listening", areaName: "Lounge" };

describe("syncJoinedJam", () => {
    let jamVariable: ListeningZoneJam | null = null;
    const variableChanges = writable<unknown>(undefined);
    const setJam = (jam: ListeningZoneJam | null) => {
        jamVariable = jam;
        variableChanges.set({});
    };

    beforeEach(() => {
        vi.spyOn(localUserStore, "getLocalUser").mockReturnValue({ uuid: "me" } as ReturnType<
            typeof localUserStore.getLocalUser
        >);
        areaPropertyVariablesManagerStore.set({
            variableChanges,
            getVariable: () => jamVariable,
        } as unknown as AreaPropertyVariablesManager);
        currentListeningZoneStore.set(zone);
        joinedJamStore.set(undefined);
        followedUserUuidStore.set(undefined);
        jamVariable = null;
    });

    afterEach(() => {
        areaPropertyVariablesManagerStore.set(undefined);
        currentListeningZoneStore.set(undefined);
        vi.restoreAllMocks();
    });

    it("puts the host in their Jam once the server accepted it", () => {
        const unsubscribe = syncJoinedJam();

        setJam({ url: "https://spotify.link/mine", hostUuid: "me", hostName: "Me" });

        expect(get(joinedJamStore)).toEqual({ areaId: "lounge", areaName: "Lounge", url: "https://spotify.link/mine" });
        unsubscribe();
    });

    it("forgets a joined Jam once it is removed or replaced", () => {
        const unsubscribe = syncJoinedJam();
        setJam({ url: "https://spotify.link/theirs", hostUuid: "dj", hostName: "DJ" });
        joinedJamStore.set({ areaId: "lounge", areaName: "Lounge", url: "https://spotify.link/theirs" });

        setJam({ url: "https://spotify.link/theirs", hostUuid: "dj", hostName: "DJ" });
        expect(get(joinedJamStore)).toBeDefined();

        setJam({ url: "https://spotify.link/other", hostUuid: "dj2", hostName: "DJ 2" });
        expect(get(joinedJamStore)).toBeUndefined();
        unsubscribe();
    });

    describe("home Jam", () => {
        const homeJam: ListeningZoneJam = { home: true, hostUuid: "dj", hostName: "DJ" };
        const joinedHome = { areaId: "lounge", areaName: "Lounge", url: "home:dj" };

        it("is joined by listening along with its host, and left by stopping", () => {
            const unsubscribe = syncJoinedJam();
            setJam(homeJam);

            joinHomeJam();
            expect(get(followedUserUuidStore)).toBe("dj");
            expect(get(joinedJamStore)).toEqual(joinedHome);

            leaveHomeJam();
            expect(get(followedUserUuidStore)).toBeUndefined();
            expect(get(joinedJamStore)).toBeUndefined();
            unsubscribe();
        });

        it("ends for a guest who stops listening along from the host's card", () => {
            const unsubscribe = syncJoinedJam();
            setJam(homeJam);
            joinHomeJam();

            followedUserUuidStore.set(undefined);

            expect(get(joinedJamStore)).toBeUndefined();
            unsubscribe();
        });

        it("stops the follow when the host ends it", () => {
            const unsubscribe = syncJoinedJam();
            setJam(homeJam);
            joinHomeJam();

            setJam(null);

            expect(get(joinedJamStore)).toBeUndefined();
            expect(get(followedUserUuidStore)).toBeUndefined();
            unsubscribe();
        });
    });
});
