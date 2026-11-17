import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import {
    floorLevelCurrentStore,
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

    it("pulses once at a change of floor, never when motion is reduced", () => {
        expect(levelChangePulses(undefined, 0, false)).toBe(false);
        expect(levelChangePulses(0, 0, false)).toBe(false);
        expect(levelChangePulses(0, 52, false)).toBe(true);
        expect(levelChangePulses(0, 52, true)).toBe(false);
    });
});
