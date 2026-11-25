import { describe, expect, it } from "vitest";
import {
    hashedCell,
    instanceStarts,
    offMapRects,
    outdoorTexels,
} from "../../../../../src/front/Phaser/Game/Weather/PrecipitationLayer";
import {
    perspectiveCamera,
    perspectiveDropPlanes,
    perspectiveFlakePlanes,
} from "../../../../../src/front/Phaser/Game/Weather/PerspectiveFall";
import { flakeMix } from "../../../../../src/front/Phaser/Game/Weather/Snowfall";
import { fallHash } from "../../../../../src/front/Phaser/Game/Weather/FallHash";
import { rainPlanes } from "../../../../../src/front/Phaser/Game/Weather/Rain";

describe("instanceStarts", () => {
    it("puts the groups one after the other, every copy of every cell once, the slots left past the last", () => {
        const groups = [
            { firstColumn: -3, firstRow: 4, columns: 10, rows: 5, copies: 2 },
            { firstColumn: 0, firstRow: 0, columns: 3, rows: 3, copies: 7 },
        ];
        const { starts, count } = instanceStarts(groups, 3);
        expect(starts.slice(0, 2)).toEqual([0, 100]);
        expect(count).toBe(100 + 63);
        expect(starts[2]).toBeGreaterThan(count);
    });

    it("reads the instances of a ×32 rain or snow, flat or in perspective, under the 16 million a float counts", () => {
        const wide = { x: 0, y: 0, width: 2600, height: 1500 };
        const still = { x: 0, y: 0 };
        const heavySnow = { level: 1, mix: flakeMix({ temperature: -4, humidity: 90 }) };
        const camera = perspectiveCamera(wide);
        for (const planes of [
            rainPlanes(wide, 1, still, true, 160),
            perspectiveDropPlanes(wide, camera, 1, still, true, 160),
            perspectiveFlakePlanes(wide, heavySnow, still, true, 160),
        ]) {
            const { count } = instanceStarts(planes, 3);
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(2 ** 24);
        }
    });
});

describe("hashedCell", () => {
    it("gives the hash the same column as the whole number, however far the air carried the cells", () => {
        for (const column of [-2.5e10, -1, 0, 4095, 4096, 7.3e9]) {
            const wrapped = hashedCell(column);
            expect(wrapped).toBeGreaterThanOrEqual(0);
            expect(wrapped).toBeLessThan(4096);
            expect(fallHash(wrapped + 17, 3, 5)).toBe(fallHash(column + 17, 3, 5));
        }
    });
});

describe("the outdoor mask", () => {
    it("counts what is off the map as outdoors, as the outdoor grid does", () => {
        const rects = offMapRects({ x: -100, y: -50, width: 400, height: 300 }, 200, 200);
        const covered = (x: number, y: number): boolean =>
            rects.some((rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height);
        expect(covered(-10, 100)).toBe(true);
        expect(covered(250, 100)).toBe(true);
        expect(covered(100, -10)).toBe(true);
        expect(covered(100, 210)).toBe(true);
        expect(covered(100, 100)).toBe(false);
        expect(covered(0, 0)).toBe(false);
        // No part twice.
        const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
        expect(area).toBe(400 * 300 - 200 * 200);
        expect(offMapRects({ x: 10, y: 10, width: 50, height: 50 }, 200, 200)).toEqual([]);
    });

    it("marks a texel outdoors when its centre is in an outdoor rectangle", () => {
        const area = { x: 64, y: 32, width: 64, height: 32 };
        const { width, height, texels } = outdoorTexels(area, [{ x: 72, y: 32, width: 16, height: 8 }], 4);
        expect([width, height]).toEqual([16, 8]);
        const at = (x: number, y: number): number =>
            texels[Math.floor((y - 32) / 4) * width + Math.floor((x - 64) / 4)];
        expect(at(73, 33)).toBe(255);
        expect(at(87, 39)).toBe(255);
        expect(at(71, 33)).toBe(0);
        expect(at(89, 33)).toBe(0);
        expect(at(73, 41)).toBe(0);
    });
});
