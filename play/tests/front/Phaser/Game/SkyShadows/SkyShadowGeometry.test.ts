import { describe, expect, it } from "vitest";
import { cloudShadowOffset } from "../../../../../src/front/Phaser/Game/Weather/Clouds";
import {
    mergeShadowBoxes,
    shadowDirection,
    shadowOffset,
    shadowPolygons,
    SHADOW_MAX_LENGTH,
} from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowGeometry";
import type { Point, ShadowBox } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowGeometry";

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

    it("casts nothing without a light high enough", () => {
        expect(shadowPolygons({ boxes: [wall], trees: [] }, { azimuth: 180, elevation: -1 })).toEqual([]);
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
