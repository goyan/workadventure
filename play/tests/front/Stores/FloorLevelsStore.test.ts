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

import { mapEditorPlacementLevelStore } from "../../../src/front/Stores/MapEditorStore";
import { mapLayerLevelStore } from "../../../src/front/Stores/MapLayerStore";

const name = (level: number): string => (level === 0 ? "Sol" : `Niveau ${level}`);

describe("the stack of the floors", () => {
    it("lists the floors of the map from the highest to the ground, the current one marked", () => {
        expect(floorLevelStack([52, 116], 52, undefined, name)).toEqual({
            levels: [
                { elevation: 116, name: "Niveau 116" },
                { elevation: 52, name: "Niveau 52" },
                { elevation: 0, name: "Sol" },
            ],
            current: 52,
        });
    });

    it("is not there on a map without floors nor relief, in the game as in the map editor", () => {
        expect(floorLevelStack([], 0, undefined, name)).toBeUndefined();
        expect(floorLevelStack([], 0, { choice: "auto", level: 0 }, name)).toBeUndefined();
    });

    it("shows the level the map editor works on while it is open, with the altitudes", () => {
        // "auto": the level under the pointer is the current one, the display ceiling of the game is left aside.
        expect(floorLevelStack([52], 0, { choice: "auto", level: 52 }, name, 116, 48, -24)).toEqual({
            levels: [
                { elevation: 52, name: "Niveau 52" },
                { elevation: 0, name: "Sol" },
            ],
            current: 52,
            viewed: undefined,
            altitude: 48,
            pointerAltitude: -24,
        });
        // A level chosen in the editor is listed even without slabs.
        expect(floorLevelStack([52], 0, { choice: 116, level: 52 }, name)).toEqual({
            levels: [
                { elevation: 116, name: "Niveau 116" },
                { elevation: 52, name: "Niveau 52" },
                { elevation: 0, name: "Sol" },
            ],
            current: 116,
            viewed: 116,
        });
        expect(floorLevelStack([], 0, { choice: "auto", level: 0 }, name, undefined, 48)?.altitude).toBe(48);
    });

    it("is there on a map with a relief and no floor, with the altitude of the avatar", () => {
        expect(floorLevelStack([], 0, undefined, name, undefined, 48)).toEqual({
            levels: [{ elevation: 0, name: "Sol" }],
            current: 0,
            viewed: undefined,
            altitude: 48,
        });
        expect(floorLevelStack([52], 52, undefined, name, undefined, 0)?.altitude).toBe(0);
    });

    it("tells the altitude under the pointer with the one of the avatar", () => {
        expect(floorLevelStack([], 0, undefined, name, undefined, 48, -24)).toMatchObject({
            altitude: 48,
            pointerAltitude: -24,
        });
        expect(floorLevelStack([], 0, undefined, name, undefined, 48)).not.toHaveProperty("pointerAltitude");
        // No relief, no altitude: nothing under the pointer either.
        expect(floorLevelStack([52], 0, undefined, name, undefined, undefined, 16)).not.toHaveProperty(
            "pointerAltitude",
        );
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

    it("follows the level of the map editor while it is open", () => {
        floorLevelsBuiltStore.set([52]);
        floorLevelCurrentStore.set(0);
        floorLevelsHiddenStore.set(true);
        mapEditorPlacementLevelStore.set(52);
        expect(get(floorLevelsStore)).toMatchObject({ current: 52, viewed: 52 });
        mapEditorPlacementLevelStore.set("auto");
        mapLayerLevelStore.set(0);
        expect(get(floorLevelsStore)).toMatchObject({ current: 0, viewed: undefined });
        floorLevelsHiddenStore.set(false);
        floorLevelsBuiltStore.set([]);
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
