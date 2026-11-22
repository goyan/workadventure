import { describe, expect, it } from "vitest";
import { cloudShadowOffset } from "../../../../../src/front/Phaser/Game/Weather/Clouds";
import {
    mergeShadowBoxes,
    shadowDirection,
    shadowOffset,
    shadowPolygons,
    SHADOW_MAX_LENGTH,
} from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowGeometry";
import type {
    Point,
    ShadowBox,
    ShadowPlate,
    ShadowSlope,
} from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowGeometry";

/** Whether a point is inside a polygon (ray casting). */
function inside(polygon: readonly Point[], x: number, y: number): boolean {
    let result = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const a = polygon[index];
        const b = polygon[previous];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
}

const inAny = (polygons: readonly (readonly Point[])[], x: number, y: number): boolean =>
    polygons.some((polygon) => inside(polygon, x, y));

/** An east-west wall foot, 6 px thick, two tiles high, from x = 0 to 64, on the line y = 100. */
const wall: ShadowBox = { x: 0, y: 94, width: 64, height: 6, rise: 64 };

describe("shadowDirection / shadowOffset", () => {
    it("points where the shadows of the clouds point, for any sun", () => {
        for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315, 17, 203]) {
            for (const elevation of [10, 30, 60]) {
                const cloud = cloudShadowOffset({ azimuth, elevation });
                const wallShadow = shadowOffset(32, { azimuth, elevation });
                expect(cloud).toBeDefined();
                expect(wallShadow).toBeDefined();
                if (!cloud || !wallShadow) continue;
                const cloudLength = Math.hypot(cloud.x, cloud.y);
                const wallLength = Math.hypot(wallShadow.x, wallShadow.y);
                // The same unit direction.
                expect(wallShadow.x / wallLength).toBeCloseTo(cloud.x / cloudLength, 9);
                expect(wallShadow.y / wallLength).toBeCloseTo(cloud.y / cloudLength, 9);
            }
        }
    });

    it("falls north under a sun in the south, south under a sun in the north (map north up, y down)", () => {
        expect(shadowDirection(180).y).toBeCloseTo(-1, 9);
        expect(shadowDirection(0).y).toBeCloseTo(1, 9);
        expect(shadowDirection(90).x).toBeCloseTo(-1, 9);
    });

    it("is as long as the height over the tangent of the elevation, bounded", () => {
        const at45 = shadowOffset(64, { azimuth: 180, elevation: 45 });
        expect(Math.hypot(at45?.x ?? 0, at45?.y ?? 0)).toBeCloseTo(64, 6);
        const at30 = shadowOffset(32, { azimuth: 180, elevation: 30 });
        expect(Math.hypot(at30?.x ?? 0, at30?.y ?? 0)).toBeCloseTo(32 / Math.tan(Math.PI / 6), 6);
        const low = shadowOffset(64, { azimuth: 180, elevation: 3 });
        expect(Math.hypot(low?.x ?? 0, low?.y ?? 0)).toBeCloseTo(SHADOW_MAX_LENGTH, 6);
        expect(SHADOW_MAX_LENGTH).toBe(4 * 32);
    });

    it("keeps the length within the limits of the light: never past its maximum, at least its minimum", () => {
        const length = (height: number, elevation: number, min: number, max: number): number => {
            const offset = shadowOffset(height, { azimuth: 180, elevation, shadowLength: { min, max } });
            return Math.hypot(offset?.x ?? 0, offset?.y ?? 0);
        };
        // A high sun: 32 px over tan(60°), whatever the maximum set.
        for (const max of [32, 64, 128, 256]) expect(length(32, 60, 0, max)).toBeCloseTo(32 / Math.sqrt(3), 6);
        // A low sun: the maximum set, never more.
        for (const max of [32, 64, 128, 256]) expect(length(64, 3, 0, max)).toBeCloseTo(max, 6);
        // A minimum: even at noon a wall keeps a shadow that long.
        expect(length(32, 80, 48, 128)).toBeCloseTo(48, 6);
        // A minimum above the maximum: the maximum wins.
        expect(length(32, 80, 96, 64)).toBeCloseTo(64, 6);
    });

    it("gives no shadow with the light at or under the horizon", () => {
        expect(shadowOffset(32, { azimuth: 180, elevation: 0 })).toBeUndefined();
        expect(shadowOffset(32, { azimuth: 180, elevation: -4 })).toBeUndefined();
    });
});

describe("shadowPolygons", () => {
    it("casts the shadow of a wall from its foot, away from the light, as long as the wall is high", () => {
        // Sun due south at 45°: the shadow of a 64 px wall reaches 64 px north of its foot.
        const polygons = shadowPolygons({ boxes: [wall], trees: [] }, { azimuth: 180, elevation: 45 });
        expect(inAny(polygons, 32, 97)).toBe(true);
        expect(inAny(polygons, 32, 60)).toBe(true);
        expect(inAny(polygons, 32, 40)).toBe(true);
        expect(inAny(polygons, 32, 25)).toBe(false);
        // Nothing on the lit side, nor beyond the ends of the wall.
        expect(inAny(polygons, 32, 110)).toBe(false);
        expect(inAny(polygons, 80, 60)).toBe(false);
    });

    it("slants the shadow with the light: a sun in the south-east throws it to the north-west", () => {
        const polygons = shadowPolygons({ boxes: [wall], trees: [] }, { azimuth: 135, elevation: 45 });
        const offset = shadowOffset(64, { azimuth: 135, elevation: 45 });
        expect(offset?.x).toBeLessThan(0);
        expect(offset?.y).toBeLessThan(0);
        // The far end of the shadow is the foot moved by the offset.
        expect(inAny(polygons, 32 + (offset?.x ?? 0) * 0.95, 97 + (offset?.y ?? 0) * 0.95)).toBe(true);
        expect(inAny(polygons, 70, 60)).toBe(false);
    });

    it("throws the shadow of a tree as a round crown on a trunk, not as a box", () => {
        const tree = { x: 200, y: 300, crownRadius: 20, crownHeight: 60, trunkWidth: 6 };
        const light = { azimuth: 180, elevation: 45 };
        const polygons = shadowPolygons({ boxes: [], trees: [tree] }, light);
        const offset = shadowOffset(60, light);
        const centre = { x: 200 + (offset?.x ?? 0), y: 300 + (offset?.y ?? 0) };
        // The shadow of the crown is round around where the centre of the crown falls; the trunk joins it to the foot.
        expect(inAny(polygons, centre.x, centre.y)).toBe(true);
        expect(inAny(polygons, centre.x + 15, centre.y)).toBe(true);
        expect(inAny(polygons, centre.x + 19, centre.y - 19)).toBe(false);
        expect(inAny(polygons, 200, 290)).toBe(true);
        expect(polygons.some((polygon) => polygon.length >= 12)).toBe(true);
    });

    it("keeps the shadow of a low detail (no trunk) joined to its foot, however low the light", () => {
        const rock = { x: 200, y: 300, crownRadius: 12, crownHeight: 16, trunkWidth: 0 };
        // A low sun in the south: the top of the rock falls 16 / tan(12°) = 75 px north of its foot.
        const light = { azimuth: 180, elevation: 12 };
        const polygons = shadowPolygons({ boxes: [], trees: [], details: [rock] }, light);
        expect(polygons).toHaveLength(1);
        // One shape from under the rock to where its top falls, with no gap between them.
        expect(inAny(polygons, 200, 296)).toBe(true);
        expect(inAny(polygons, 200, 260)).toBe(true);
        expect(inAny(polygons, 200, 300 - 75)).toBe(true);
        expect(inAny(polygons, 200 + 30, 260)).toBe(false);
    });

    it("moves the shadow of the crown with a tree bent by the wind, its foot staying where it is", () => {
        const tree = { x: 200, y: 300, crownRadius: 20, crownHeight: 60, trunkWidth: 6 };
        const light = { azimuth: 180, elevation: 45 };
        const shadow = (bend: number) => shadowPolygons({ boxes: [], trees: [{ ...tree, bend }] }, light);
        const xs = (bend: number): number[] => shadow(bend).flatMap((polygon) => polygon.map((point) => point.x));
        // The top of the tree stands 10 px to the right: so does the shadow of its crown.
        expect(Math.max(...xs(10))).toBeCloseTo(Math.max(...xs(0)) + 10, 5);
        expect(Math.min(...xs(-10))).toBeCloseTo(Math.min(...xs(0)) - 10, 5);
        // The trunk still starts at the foot of the tree.
        expect(inAny(shadow(10), 200, 299)).toBe(true);
    });

    it("casts nothing without a light high enough", () => {
        expect(shadowPolygons({ boxes: [wall], trees: [] }, { azimuth: 180, elevation: -1 })).toEqual([]);
    });
});

describe("shadowPolygons: the raised floors", () => {
    /** The deck of a low bridge: one tile at 20 px above the ground, 8 px thick, over the tile (100, 200). */
    const deck: ShadowPlate = { x: 100, y: 200, width: 32, height: 32, rise: 20, thickness: 8 };
    /** A sun in the east at 45°: the shadows go west, as long as what throws them is high. */
    const east = { azimuth: 90, elevation: 45 };

    it("throws the shadow of a deck as far from its footprint as the deck is high, the light passing under it", () => {
        const polygons = shadowPolygons({ boxes: [], trees: [], plates: [deck] }, east);
        // Its top falls 20 px west, its underside 12 px: the shadow spans x = 80 to 120 under a 32 px wide deck.
        expect(inAny(polygons, 82, 216)).toBe(true);
        expect(inAny(polygons, 110, 216)).toBe(true);
        expect(inAny(polygons, 118, 216)).toBe(true);
        // The ground under the eastern edge of the deck is lit: the sun comes in under it.
        expect(inAny(polygons, 125, 216)).toBe(false);
        expect(inAny(polygons, 78, 216)).toBe(false);
        // Not beyond its sides along the light.
        expect(inAny(polygons, 110, 196)).toBe(false);
        expect(inAny(polygons, 110, 236)).toBe(false);
    });

    it("moves the shadow of a deck twice as far for a deck twice as high", () => {
        const high = { ...deck, rise: 40 };
        const xs = (plate: ShadowPlate): number[] =>
            shadowPolygons({ boxes: [], trees: [], plates: [plate] }, east).flatMap((polygon) =>
                polygon.map((point) => point.x),
            );
        expect(Math.min(...xs(deck))).toBeCloseTo(100 - 20, 5);
        expect(Math.min(...xs(high))).toBeCloseTo(100 - 40, 5);
        // A lower sun: 20 / tan(30°) = 34.6 px.
        const low = shadowPolygons({ boxes: [], trees: [], plates: [deck] }, { azimuth: 90, elevation: 30 });
        expect(Math.min(...low.flatMap((polygon) => polygon.map((point) => point.x)))).toBeCloseTo(
            100 - 20 / Math.tan(Math.PI / 6),
            5,
        );
    });

    it("casts no shadow of a deck with the light at or under the horizon", () => {
        expect(shadowPolygons({ boxes: [], trees: [], plates: [deck] }, { azimuth: 90, elevation: 0 })).toEqual([]);
        expect(shadowPolygons({ boxes: [], trees: [], plates: [deck] }, { azimuth: 90, elevation: -4 })).toEqual([]);
    });

    it("throws the shadow of a ramp from its foot on the ground to where its top falls", () => {
        // A ramp going up east from the ground to 20 px, over x = 0 to 64, y = 0 to 32; a sun in the north at 45°.
        const ramp: ShadowSlope = {
            low: [
                { x: 0, y: 0 },
                { x: 0, y: 32 },
            ],
            base: 0,
            high: [
                { x: 64, y: 0 },
                { x: 64, y: 32 },
            ],
            top: 20,
        };
        const polygons = shadowPolygons({ boxes: [], trees: [], slopes: [ramp] }, { azimuth: 0, elevation: 45 });
        // Its top edge falls 20 px south; its foot stays where it is.
        expect(inAny(polygons, 60, 48)).toBe(true);
        expect(inAny(polygons, 4, 16)).toBe(true);
        expect(inAny(polygons, 4, 40)).toBe(false);
        expect(inAny(polygons, 60, 56)).toBe(false);
    });
});

describe("mergeShadowBoxes", () => {
    it("joins the pieces of one wall side by side, as long as they are as high", () => {
        const merged = mergeShadowBoxes([
            { x: 0, y: 94, width: 32, height: 6, rise: 64 },
            { x: 32, y: 94, width: 32, height: 6, rise: 64 },
            { x: 64, y: 94, width: 32, height: 6, rise: 32 },
            { x: 200, y: 0, width: 12, height: 32, rise: 32 },
            { x: 200, y: 32, width: 12, height: 32, rise: 32 },
        ]);
        expect(merged).toHaveLength(3);
        expect(merged).toContainEqual({ x: 0, y: 94, width: 64, height: 6, rise: 64 });
        expect(merged).toContainEqual({ x: 64, y: 94, width: 32, height: 6, rise: 32 });
        expect(merged).toContainEqual({ x: 200, y: 0, width: 12, height: 64, rise: 32 });
    });
});
