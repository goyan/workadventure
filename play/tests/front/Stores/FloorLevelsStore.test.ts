import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import {
    floorLevelCurrentStore,
    floorLevelViewedStore,
    floorLevelStack,
    floorLevelsBuiltStore,
    floorLevelsHiddenStore,
    floorLevelsStore,
    levelChangePulses,
} from "../../../src/front/Stores/FloorLevelsStore";

const name = (level: number): string => (level === 0 ? "Sol" : `Niveau ${level}`);

describe("the stack of the floors", () => {
    it("lists the floors of the map from the highest to the ground, the current one marked", () => {
        expect(floorLevelStack([52, 116], 52, false, name)).toEqual({
            levels: [
                { elevation: 116, name: "Niveau 116" },
                { elevation: 52, name: "Niveau 52" },
                { elevation: 0, name: "Sol" },
            ],
            current: 52,
        });
    });

    it("is not there on a map without floors, nor in the map editor", () => {
        expect(floorLevelStack([], 0, false, name)).toBeUndefined();
        expect(floorLevelStack([52], 0, true, name)).toBeUndefined();
    });

    it("is there on a map with a relief and no floor, with the altitude of the avatar", () => {
        expect(floorLevelStack([], 0, false, name, undefined, 48)).toEqual({
            levels: [{ elevation: 0, name: "Sol" }],
            current: 0,
            viewed: undefined,
            altitude: 48,
        });
        expect(floorLevelStack([], 0, true, name, undefined, 48)).toBeUndefined();
        expect(floorLevelStack([52], 52, false, name, undefined, 0)?.altitude).toBe(0);
    });

    it("follows the floor of the avatar", () => {
        floorLevelsBuiltStore.set([52]);
        floorLevelsHiddenStore.set(false);
        floorLevelCurrentStore.set(0);
        expect(get(floorLevelsStore)?.current).toBe(0);
        floorLevelCurrentStore.set(52);
        expect(get(floorLevelsStore)?.current).toBe(52);
        expect(get(floorLevelsStore)?.levels.map((level) => level.elevation)).toEqual([52, 0]);
        floorLevelsBuiltStore.set([]);
        expect(get(floorLevelsStore)).toBeUndefined();
    });

    it("can display another floor while retaining the physical floor of the avatar", () => {
        floorLevelsBuiltStore.set([52, 116]);
        floorLevelCurrentStore.set(0);
        floorLevelViewedStore.set(116);
        expect(get(floorLevelsStore)).toMatchObject({ current: 0, viewed: 116 });
        floorLevelViewedStore.set(undefined);
        expect(get(floorLevelsStore)).toMatchObject({ current: 0, viewed: undefined });
        floorLevelsBuiltStore.set([]);
    });

    it("pulses once at a change of floor, never when motion is reduced", () => {
        expect(levelChangePulses(undefined, 0, false)).toBe(false);
        expect(levelChangePulses(0, 0, false)).toBe(false);
        expect(levelChangePulses(0, 52, false)).toBe(true);
        expect(levelChangePulses(0, 52, true)).toBe(false);
    });
});
