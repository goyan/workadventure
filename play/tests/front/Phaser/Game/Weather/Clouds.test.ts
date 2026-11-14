import { describe, expect, it } from "vitest";
import {
    CLOUD_DRIFT_PER_SECOND,
    cloudPatches,
    cloudShadowOffset,
    cloudSunlight,
    overcastVeil,
    shadowPatches,
} from "../../../../../src/front/Phaser/Game/Weather/Clouds";
import { fogBlocks } from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";

const TILE = 32;
const view = { x: 0, y: 0, width: 800, height: 600 };

describe("cloudShadowOffset (north up, y down)", () => {
    it("casts the shadow away from the sun, three tiles of height, six tiles at most", () => {
        // Paris, 2026-11-14 at solar noon: the sun is south, 22.9° high; 3 / tan(22.9°) = 7.1 tiles, kept to 6.
        const noon = cloudShadowOffset({ elevation: 22.9, azimuth: 180 });
        expect(noon?.x).toBeCloseTo(0, 6);
        expect(noon?.y).toBeCloseTo(-6 * TILE, 6);
        // A high sun in the north (southern hemisphere): a short shadow southwards, 3 / tan(64°) tiles.
        const sydney = cloudShadowOffset({ elevation: 64, azimuth: 0 });
        expect(sydney?.x).toBeCloseTo(0, 6);
        expect(sydney?.y).toBeCloseTo((3 / Math.tan((64 * Math.PI) / 180)) * TILE, 6);
        // Morning sun in the east: the shadow goes west.
        const morning = cloudShadowOffset({ elevation: 45, azimuth: 90 });
        expect(morning?.x).toBeCloseTo(-3 * TILE, 6);
        expect(morning?.y).toBeCloseTo(0, 6);
    });

    it("casts no shadow with the sun under 2°", () => {
        expect(cloudShadowOffset({ elevation: 1.9, azimuth: 240 })).toBeUndefined();
        expect(cloudShadowOffset(undefined)).toBeUndefined();
    });
});

describe("cloudSunlight", () => {
    it("fades the clouds from sunset (-0.833°) to 2° and their shadows from 2° to 6°", () => {
        expect(cloudSunlight(-1)).toEqual({ clouds: 0, shadows: 0 });
        expect(cloudSunlight(2)).toEqual({ clouds: 1, shadows: 0 });
        expect(cloudSunlight(4).shadows).toBeCloseTo(0.5, 6);
        expect(cloudSunlight(30)).toEqual({ clouds: 1, shadows: 1 });
        // Without a sun (no clock yet): clouds, no shadow.
        expect(cloudSunlight(undefined)).toEqual({ clouds: 1, shadows: 0 });
    });
});

describe("cloudPatches", () => {
    it("shows more clouds for a cloudier sky, one after the other", () => {
        const weight = (cloudiness: number) =>
            cloudPatches(0, view, cloudiness, false).reduce((sum, patch) => sum + (patch.weight ?? 1), 0);
        expect(weight(0)).toBe(0);
        expect(weight(0.2)).toBeLessThan(weight(0.5));
        expect(weight(0.5)).toBeLessThan(weight(0.9));
    });

    it("drifts about 8 px a second, and stands still when motion is reduced", () => {
        const before = cloudPatches(10_000, view, 0.5, false);
        const after = cloudPatches(11_000, view, 0.5, false);
        const moved = before.map((patch, index) => Math.hypot(after[index].x - patch.x, after[index].y - patch.y));
        // Most patches move by the drift; one that wraps around the window jumps.
        expect(moved.filter((distance) => Math.abs(distance - CLOUD_DRIFT_PER_SECOND) < 0.01).length).toBeGreaterThan(
            moved.length / 2,
        );
        expect(cloudPatches(10_000, view, 0.5, true)).toEqual(cloudPatches(99_000, view, 0.5, true));
    });

    it("casts shadows that are the same clouds, moved by the offset", () => {
        const offset = { x: -100, y: 60 };
        const shadows = shadowPatches(5_000, view, 0.5, false, offset);
        const shifted = cloudPatches(5_000, { ...view, x: view.x - offset.x, y: view.y - offset.y }, 0.5, false);
        expect(shadows).toEqual(shifted.map((patch) => ({ ...patch, x: patch.x + offset.x, y: patch.y + offset.y })));
    });

    it("weighs a fading cloud less in the blocks", () => {
        const run = [{ x: 0, y: 0, width: 64, height: 64 }];
        const full = fogBlocks(run, [{ x: 32, y: 32, radius: 64, weight: 1 }], 16);
        const half = fogBlocks(run, [{ x: 32, y: 32, radius: 64, weight: 0.5 }], 16);
        const levels = (blocks: typeof full) => blocks.reduce((sum, block) => sum + block.level * block.width, 0);
        expect(levels(half)).toBeLessThan(levels(full));
        expect(levels(half)).toBeGreaterThan(0);
    });
});

describe("overcastVeil", () => {
    it("greys an overcast sky only, rising from 0.6 to 0.9 of cloudiness", () => {
        expect(overcastVeil(0.5)).toBe(0);
        expect(overcastVeil(0.75)).toBeCloseTo(0.04, 6);
        expect(overcastVeil(0.9)).toBeCloseTo(0.08, 6);
        expect(overcastVeil(1)).toBeCloseTo(0.08, 6);
    });
});
