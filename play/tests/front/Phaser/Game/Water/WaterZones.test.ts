import { describe, expect, it } from "vitest";
import {
    DIVE_DEPTH,
    DIVE_DISTANCE,
    findDiveTarget,
    intersectsWater,
    isPointInWater,
    segmentCrossesWater,
} from "../../../../../src/front/Phaser/Game/Water/WaterZones";

const pool = { x: 100, y: 100, width: 200, height: 100 };

describe("WaterZones", () => {
    it("tells whether a point or a body is in the water", () => {
        expect(isPointInWater([pool], { x: 150, y: 150 })).toBe(true);
        expect(isPointInWater([pool], { x: 300, y: 150 })).toBe(false);
        expect(intersectsWater([pool], { x: 90, y: 150, width: 16, height: 16 })).toBe(true);
        expect(intersectsWater([pool], { x: 80, y: 150, width: 16, height: 16 })).toBe(false);
    });

    it("dives from the edge to a spot inside the water, in front of the player", () => {
        expect(findDiveTarget([pool], { x: 150, y: 90 })).toMatchObject({ x: 150, y: 100 + DIVE_DEPTH, distance: 10 });
        expect(findDiveTarget([pool], { x: 310, y: 120 })).toMatchObject({ x: 300 - DIVE_DEPTH, y: 120 });
    });

    it("offers no dive far from the water", () => {
        expect(findDiveTarget([pool], { x: 150, y: 100 - DIVE_DISTANCE - 1 })).toBeUndefined();
        expect(findDiveTarget([], { x: 150, y: 90 })).toBeUndefined();
    });

    it("dives into the middle of a narrow pool", () => {
        const channel = { x: 0, y: 0, width: 20, height: 100 };
        expect(findDiveTarget([channel], { x: -5, y: 50 })).toMatchObject({ x: 10, y: 50 });
    });

    it("dives on contact into water set to it, with the key otherwise", () => {
        expect(findDiveTarget([{ ...pool, trigger: "auto" }], { x: 150, y: 95 })?.trigger).toBe("auto");
        expect(findDiveTarget([pool], { x: 150, y: 95 })?.trigger).toBe("key");
    });

    it("detects a walk across the water", () => {
        expect(segmentCrossesWater([pool], { x: 50, y: 150 }, { x: 350, y: 150 })).toBe(true);
        expect(segmentCrossesWater([pool], { x: 50, y: 50 }, { x: 350, y: 50 })).toBe(false);
    });
});
