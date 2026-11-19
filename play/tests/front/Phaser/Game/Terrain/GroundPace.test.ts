import { cellKey, MUD_PACE, SAND_PACE, soilCode, withSoils } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { groundPace } from "../../../../../src/front/Phaser/Game/Terrain/GroundPace";

const terrain = withSoils(
    undefined,
    new Map([
        [cellKey(10, 5), soilCode("sand")],
        [cellKey(20, 5), soilCode("clay")],
    ]),
);
const water = (depth: number) => ({ relief: () => terrain, depthAt: () => depth });

describe("groundPace", () => {
    it("is the usual speed on a map without soils, and on a ground not painted", () => {
        expect(groundPace(undefined, 168, 88, 0)).toBe(1);
        expect(groundPace({ relief: () => undefined, depthAt: () => 5 }, 168, 88, 0)).toBe(1);
        expect(groundPace(water(5), 600, 600, 0)).toBe(1);
    });

    it("reads the soil under the feet and the water lying on it", () => {
        // The cell (10, 5) covers the pixels 160 to 175 by 80 to 95.
        expect(groundPace(water(0), 168, 88, 0)).toBe(SAND_PACE);
        expect(groundPace(water(0), 328, 88, 0)).toBe(1);
        expect(groundPace(water(3), 328, 88, 0)).toBe(MUD_PACE);
        // A clay wet through by the rain, without water lying on it.
        expect(groundPace(water(0), 328, 88, 0, () => 0.8)).toBe(MUD_PACE);
        expect(groundPace(water(0), 328, 88, 0, () => 0.3)).toBe(1);
    });
});
