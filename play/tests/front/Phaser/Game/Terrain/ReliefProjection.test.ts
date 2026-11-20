import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { ColumnSample } from "../../../../../src/front/Phaser/Game/Terrain/ReliefProjection";
import { RAMPS } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import type { Rgb } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import {
    DROP_SCALE,
    RELIEF_TEXEL,
    RIM_OUTLINE,
    MAX_DROP,
    dropAt,
    groundPointAt,
    paintColumn,
    projectionShown,
} from "../../../../../src/front/Phaser/Game/Terrain/ReliefProjection";

/**
 * A hollow dug 128 px deep (4 tiles), cells 10 to 13 across and 10 to 21 down: from x 160 to 224, y 160 to 352 on the
 * map. Its floor is flat between the centres of its border cells (y 168 to 344).
 */
function hollow(): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 10; x <= 13; x++) for (let y = 10; y <= 21; y++) changes.set(cellKey(x, y), -128);
    return withHeights(undefined, changes);
}

const near = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(2);

describe("the relief seen in 3/4", () => {
    it("draws the dug ground lower by half its depth, at most 128 px", () => {
        expect(DROP_SCALE).toBe(0.5);
        expect(MAX_DROP).toBe(128);
        expect(dropAt(hollow(), 192, 100)).toBe(0);
        expect(dropAt(hollow(), 192, 250)).toBe(64);
        expect(dropAt(undefined, 192, 250)).toBe(0);
    });

    it("finds the floor of a hollow under the point of the screen where it is drawn", () => {
        const ground = groundPointAt(hollow(), { x: 192, y: 250 + 64 });
        expect(ground.x).toBe(192);
        near(ground.y, 250);
    });

    it("takes a click on the face of the drop to its foot", () => {
        // The north face runs on the screen from the rim (y 152) to where the floor starts (168 + 64 = 232).
        const ground = groundPointAt(hollow(), { x: 192, y: 190 });
        near(ground.y, 168);
    });

    it("finds the ground of a gentle slope under every point of the screen, not the bottom of the slope", () => {
        // Going down 8 px a cell southwards from the cell row 10 to 30: drawn 4 px lower a cell, no face.
        const changes = new Map<string, number>();
        for (let y = 10; y <= 30; y++) for (let x = 0; x < 4; x++) changes.set(cellKey(x, y), -8 * (y - 9));
        const ramp = withHeights(undefined, changes);
        // Up to where the flat ground south of the ramp (from the row 31, drawn at its place) starts hiding it.
        for (let groundY = 200; groundY < 380; groundY += 3) {
            const screenY = groundY + dropAt(ramp, 32, groundY);
            near(groundPointAt(ramp, { x: 32, y: screenY }).y, groundY);
        }
    });

    it("takes every click on the face of a drop to its foot", () => {
        for (let screenY = 156; screenY <= 228; screenY += 2) {
            near(groundPointAt(hollow(), { x: 192, y: screenY }).y, 168);
        }
    });

    it("gives the ground of the south rim where it hides the floor", () => {
        // The floor near the south side (drawn down to 344 + 64 = 408) is behind the flat ground south of the hollow.
        const ground = groundPointAt(hollow(), { x: 192, y: 380 });
        near(ground.y, 380);
    });

    it("finds the deck of a bridge over a hollow where it is, and the floor beside it", () => {
        // A bridge over the hollow on the tile x 192 to 224, y 224 to 256: its deck is at the level of the ground.
        const onBridge = (x: number, y: number): boolean => x >= 192 && x < 224 && y >= 224 && y < 256;
        near(groundPointAt(hollow(), { x: 200, y: 240 }, onBridge).y, 240);
        // Beside the bridge, the same point of the screen shows the floor of the hollow, 64 px higher on the map.
        near(groundPointAt(hollow(), { x: 176, y: 240 }, onBridge).y, 176);
    });

    it("leaves a point as it is on a map without relief", () => {
        expect(groundPointAt(undefined, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    });
});

describe("a column of the relief drawn in 3/4", () => {
    const FLAT: Rgb = [200, 210, 220];
    const FLOOR: Rgb = [90, 100, 80];
    const WALL = RAMPS.wall;
    const isWall = (color: number[]) =>
        [...WALL, RIM_OUTLINE].some((shade) => shade.every((channel, index) => channel === color[index]));
    /** One sample a pixel of the ground from y 0, drawn `dropOf(y)` px lower; dug where the drop is not 0. */
    function samples(dropOf: (y: number) => number, count = 100): ColumnSample[] {
        return Array.from({ length: count }, (_, y) => {
            const drop = dropOf(y);
            return { groundY: y, drop, color: drop > 0 ? FLOOR : FLAT, wallRamp: WALL, plain: drop === 0 };
        });
    }
    const dug = (from: number, to: number, drop: number) => (y: number) => (y >= from && y <= to ? drop : 0);
    const paint = (column: ColumnSample[], rows: number, firstRow: number): Uint8ClampedArray => {
        const out = new Uint8ClampedArray(rows * 4);
        paintColumn(column, column.length, rows, firstRow, out, 1, 0);
        return out;
    };
    const alpha = (out: Uint8ClampedArray, row: number) => out[row * 4 + 3];
    const rgb = (out: Uint8ClampedArray, row: number) => [out[row * 4], out[row * 4 + 1], out[row * 4 + 2]];
    const light = (out: Uint8ClampedArray, from: number, to: number) => {
        let total = 0;
        for (let row = from; row <= to; row++) total += rgb(out, row).reduce((a, b) => a + b, 0);
        return total / (to - from + 1);
    };

    it("draws a pixel of the ground for a pixel of the screen", () => {
        expect(RELIEF_TEXEL).toBe(1);
    });

    it("leaves the plain ground to the map", () => {
        const out = paint(
            samples(() => 0),
            100,
            0,
        );
        expect([...Array(100).keys()].every((row) => alpha(out, row) === 0)).toBe(true);
    });

    it("draws the face of the drop under the north rim, cerned at its top, then the floor lower by its drop", () => {
        // Dug 64 px deep from y 20: drawn 32 px lower, the face from the row 20 to the row 51.
        const out = paint(samples(dug(20, 79, 32), 100), 120, 0);
        expect(alpha(out, 19)).toBe(0);
        expect(rgb(out, 20)).toEqual([...RIM_OUTLINE]);
        for (let row = 20; row <= 51; row++) expect(isWall(rgb(out, row)), `row ${row}`).toBe(true);
        expect(light(out, 21, 28)).toBeGreaterThan(light(out, 44, 51));
        expect(rgb(out, 60)).toEqual(FLOOR);
    });

    it("draws a steep slope as one face: no line of the ground across it", () => {
        // The drawing falls 3 px for a pixel of ground from y 20 to y 40, then the floor.
        const out = paint(
            samples((y) => (y < 20 ? 0 : Math.min(40, (y - 20) * 2)), 100),
            140,
            0,
        );
        // The rim (y 20) is plain ground, left to the map; the face goes from the row under it to its foot.
        for (let row = 21; row <= 80; row++) expect(isWall(rgb(out, row)), `row ${row}`).toBe(true);
        expect(rgb(out, 90)).toEqual(FLOOR);
    });

    it("draws a slope falling 2.5 px a pixel as one face, cerned once: no stripes from the rounding", () => {
        const out = paint(
            samples((y) => (y < 20 ? 0 : Math.min(60, (y - 20) * 1.5)), 100),
            160,
            0,
        );
        let rims = 0;
        for (let row = 0; row < 160; row++)
            if (rgb(out, row).every((channel, index) => channel === RIM_OUTLINE[index])) rims++;
        expect(rims).toBe(1);
        for (let row = 21; row <= 100; row++) expect(isWall(rgb(out, row)), `row ${row}`).toBe(true);
    });

    it("draws a gentle slope as ground, stretched, without a face", () => {
        // The drawing falls 1.8 px for a pixel of ground: never more than 2 rows at once.
        const out = paint(
            samples((y) => (y < 20 ? 0 : Math.min(32, (y - 20) * 0.8)), 100),
            140,
            0,
        );
        for (let row = 21; row <= 90; row++) expect(rgb(out, row), `row ${row}`).toEqual(FLOOR);
    });

    it("lets the south rim hide the floor behind it", () => {
        const out = paint(samples(dug(20, 79, 32), 100), 120, 0);
        expect(rgb(out, 85)).toEqual(FLAT);
        expect(alpha(out, 115)).toBe(0);
    });

    it("draws in a block the face of a drop that starts north of it", () => {
        // The block starts at the row 30; the hollow starts 8 px north of it, its face reaches into the block.
        const out = paint(samples(dug(22, 79, 32), 100), 60, 30);
        expect(alpha(out, 0)).toBe(255);
        expect(isWall(rgb(out, 0))).toBe(true);
    });
});

describe("when the relief is seen in 3/4", () => {
    it("out of the editor and out of the basic mode only", () => {
        expect(projectionShown({ editorOpen: false, basic: false })).toBe(true);
        expect(projectionShown({ editorOpen: true, basic: false })).toBe(false);
        expect(projectionShown({ editorOpen: false, basic: true })).toBe(false);
    });
});
