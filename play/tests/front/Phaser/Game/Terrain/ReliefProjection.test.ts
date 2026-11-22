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
    MAX_RISE,
    shiftAt,
    groundPointAt,
    hiddenBehindRim,
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

/** A mount raised 128 px (4 tiles) on the same cells as the hollow: its top flat from y 168 to 344, drawn 64 px higher. */
function mount(height = 128): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 10; x <= 13; x++) for (let y = 10; y <= 21; y++) changes.set(cellKey(x, y), height);
    return withHeights(undefined, changes);
}

const near = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(2);

describe("the relief seen in 3/4", () => {
    it("draws the dug ground lower by half its depth, at most 128 px", () => {
        expect(DROP_SCALE).toBe(0.5);
        expect(MAX_DROP).toBe(128);
        expect(shiftAt(hollow(), 192, 100)).toBe(0);
        expect(shiftAt(hollow(), 192, 250)).toBe(64);
        expect(shiftAt(undefined, 192, 250)).toBe(0);
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
            const screenY = groundY + shiftAt(ramp, 32, groundY);
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

    it("tells a point of the floor hidden behind the south rim from one that shows", () => {
        // The floor near the south edge (y 340) is drawn 64 px lower, at 404: the rim south of the hollow is drawn there.
        expect(hiddenBehindRim(hollow(), 192, 340, (x, y) => shiftAt(hollow(), x, y))).toBe(true);
        // The middle of the floor shows.
        expect(hiddenBehindRim(hollow(), 192, 250, (x, y) => shiftAt(hollow(), x, y))).toBe(false);
        expect(hiddenBehindRim(undefined, 192, 250, () => 0)).toBe(false);
    });

    it("draws a mount higher by half its height, at most 128 px", () => {
        expect(MAX_RISE).toBe(128);
        expect(shiftAt(mount(), 192, 250)).toBe(-64);
        expect(shiftAt(mount(256), 192, 250)).toBe(-128);
        expect(shiftAt(mount(), 192, 100)).toBe(0);
    });

    it("finds the top of a mount under the point of the screen where it is drawn", () => {
        near(groundPointAt(mount(), { x: 192, y: 250 - 64 }).y, 250);
    });

    it("gives the mount, not the ground behind it, where the mount is drawn over that ground", () => {
        // Without the mount, the screen point y 150 would be the ground at y 150, north of the mount: the top of the
        // mount (from y 168, drawn from 104 on) is drawn over it.
        expect(groundPointAt(mount(), { x: 192, y: 150 }).y).toBeGreaterThan(160);
    });

    it("tells the ground hidden behind a mount from the ground south of it", () => {
        expect(hiddenBehindRim(mount(), 192, 150, (x, y) => shiftAt(mount(), x, y))).toBe(true);
        expect(hiddenBehindRim(mount(), 192, 400, (x, y) => shiftAt(mount(), x, y))).toBe(false);
    });

    it("gives the mount to a click on its south flank, not the ground at its foot", () => {
        // The top ends at the centre of the cell 21 (y 344, drawn at 280); the flank comes down to the cell 22 (y 360).
        const found = groundPointAt(mount(), { x: 192, y: 320 });
        expect(shiftAt(mount(), 192, found.y)).toBeLessThan(0);
    });

    it("looks no further south behind a hollow than the highest ground of the map can rise", () => {
        // A map dug only: nothing is drawn higher than its place, the ground south of a point cannot hide it from far.
        let reads = 0;
        const dropOf = (x: number, y: number) => {
            reads++;
            return shiftAt(hollow(), x, y);
        };
        hiddenBehindRim(hollow(), 192, 100, dropOf);
        expect(reads).toBeLessThan(10);
    });

    it("leaves a point as it is on a map without relief", () => {
        expect(groundPointAt(undefined, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    });
});

describe("a click on the water of a lake seen in 3/4", () => {
    /** 100 px of water in the hollow: its surface 28 px under the ground, drawn 14 px lower than its place. */
    const depthAt = (x: number, y: number): number => (x >= 160 && x < 224 && y >= 160 && y < 352 ? 100 : 0);

    it("is on the water where it is drawn: where one swims, not on the floor of the lake under it", () => {
        // The swimmer at (192, 250) is drawn at the surface, 14 px lower: a click on them is a click there.
        near(groundPointAt(hollow(), { x: 192, y: 250 + 14 }, undefined, depthAt).y, 250);
        near(groundPointAt(hollow(), { x: 192, y: 300 + 14 }, undefined, depthAt).y, 300);
        // Read on the floor of the lake (64 px lower), the same click fell 50 px further north.
        near(groundPointAt(hollow(), { x: 192, y: 250 + 14 }).y, 200);
    });

    it("is on the ground as ever where there is no water", () => {
        expect(groundPointAt(hollow(), { x: 60, y: 250 }, undefined, depthAt)).toEqual({ x: 60, y: 250 });
        near(groundPointAt(mount(), { x: 192, y: 250 - 64 }, undefined, () => 0).y, 250);
    });
});

describe("a column of the relief drawn in 3/4", () => {
    const FLAT: Rgb = [200, 210, 220];
    const FLOOR: Rgb = [90, 100, 80];
    const WALL = RAMPS.wall;
    const GRASS = RAMPS.grass;
    const isWall = (color: number[]) =>
        [...WALL, RIM_OUTLINE].some((shade) => shade.every((channel, index) => channel === color[index]));
    /** One sample a pixel of the ground from y 0, drawn `dropOf(y)` px lower; dug where the drop is not 0. */
    function samples(dropOf: (y: number) => number, count = 100): ColumnSample[] {
        return Array.from({ length: count }, (_, y) => {
            const drop = dropOf(y);
            return {
                groundY: y,
                drop,
                color: drop > 0 ? FLOOR : FLAT,
                wallRamp: WALL,
                flankRamp: GRASS,
                plain: drop === 0,
            };
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

    const isRim = (color: number[]) => color.every((channel, index) => channel === RIM_OUTLINE[index]);
    const isOf = (ramp: readonly Rgb[], color: number[]) =>
        ramp.some((shade) => shade.every((channel, index) => channel === color[index]));
    const raised = (from: number, to: number, rise: number) => (y: number) => (y >= from && y <= to ? -rise : 0);

    it("draws the south flank of a steep mount in rock, cerned at its foot", () => {
        // Raised 64 px from y 40 to 79: its top drawn 32 px higher (rows 8 to 47), the flank from 48 down to its foot.
        const out = paint(samples(raised(40, 79, 32), 100), 120, 0);
        for (let row = 48; row <= 78; row++) expect(isOf(WALL, rgb(out, row)), `row ${row}`).toBe(true);
        expect(isRim(rgb(out, 79))).toBe(true);
        // The flat ground at its foot is left to the map.
        expect(alpha(out, 80)).toBe(0);
    });

    it("draws the south flank of a gentle mount in shaded grass, one face without lines of ground across it", () => {
        // Down 32 px over 12 px of ground south of the top: the drawing falls 3.7 px a pixel, under CLIFF_JUMP_PX.
        const out = paint(
            samples((y) => (y < 40 ? 0 : y <= 60 ? -32 : y < 72 ? -32 + ((y - 60) * 32) / 12 : 0), 100),
            120,
            0,
        );
        // The flank: from under the top (drawn at 28) to the foot (72).
        let grass = 0;
        for (let row = 30; row <= 70; row++) {
            const color = rgb(out, row);
            expect(isOf(WALL, color), `row ${row}`).toBe(false);
            expect(color, `row ${row}`).not.toEqual(FLAT);
            if (isOf(GRASS, color)) grass++;
        }
        expect(grass).toBeGreaterThan(30);
        expect(isRim(rgb(out, 71))).toBe(true);
    });

    it("cerns the silhouette of a mount where it hides the ground behind it", () => {
        // The ground north of the mount (y 0 to 39, plain) is drawn at its place; the top of the mount over its rows 8 on.
        const out = paint(samples(raised(40, 79, 32), 100), 120, 0);
        expect(alpha(out, 7)).toBe(0);
        expect(isRim(rgb(out, 8))).toBe(true);
        expect(rgb(out, 9)).toEqual(FLAT);
    });

    it("cerns no slope that only looks compressed: a line where something is hidden, not a band", () => {
        // The drawing goes down 0.1 px a pixel of ground (a slope rising 1.8 px a px towards the viewer): each row shows
        // a ground 10 px further south than the row above, yet nothing is hidden.
        const out = paint(
            samples((y) => (y < 20 ? 0 : y < 80 ? -(y - 20) * 0.9 : -54), 100),
            120,
            0,
        );
        let rims = 0;
        for (let row = 0; row < 120; row++) if (isRim(rgb(out, row))) rims++;
        expect(rims).toBeLessThanOrEqual(1);
    });

    it("draws a mount against a hollow as a flank then a face, cerned once where they meet", () => {
        // Raised 128 px (drawn 64 higher) from y 20 to 49, dug 128 px (drawn 64 lower) from y 50 on.
        const out = paint(
            samples((y) => (y < 20 ? 0 : y < 50 ? -64 : 64), 100),
            200,
            -60,
        );
        // Rows of the screen: row index = screen row + 60. The top ends at 49 - 64 = -15, the floor starts at 114.
        let rims = 0;
        for (let screen = -14; screen < 114; screen++) {
            const color = rgb(out, screen + 60);
            expect(color, `row ${screen}`).not.toEqual(FLAT);
            expect(color, `row ${screen}`).not.toEqual(FLOOR);
            if (isRim(color)) rims++;
        }
        expect(rims).toBe(1);
    });

    it("draws a coarse column (a sample every 4 px) as the sharp one, four times smaller and as dark", () => {
        // Dug 128 px deep (drawn 64 px lower) from y 80 to 399.
        const sharp = paint(samples(dug(80, 399, 64), 480), 560, 0);
        const coarseSamples: ColumnSample[] = Array.from({ length: 120 }, (_, row) => {
            const drop = dug(80, 399, 64)(row * 4);
            return {
                groundY: row,
                drop: drop / 4,
                color: drop > 0 ? FLOOR : FLAT,
                wallRamp: WALL,
                flankRamp: GRASS,
                plain: drop === 0,
            };
        });
        const coarse = new Uint8ClampedArray(140 * 4);
        paintColumn(coarseSamples, coarseSamples.length, 140, 0, coarse, 1, 0, 4);
        // The face: the rows 80 to 143 sharp, 20 to 35 coarse; then the floor.
        expect(isRim(rgb(coarse, 20))).toBe(true);
        for (let row = 21; row <= 35; row++) expect(isWall(rgb(coarse, row)), `row ${row}`).toBe(true);
        expect(rgb(coarse, 40)).toEqual(FLOOR);
        // As dark, to the grain of the dither on 15 rows (21 % lighter if the drop were not counted in pixels).
        expect(Math.abs(light(coarse, 21, 35) - light(sharp, 81, 143))).toBeLessThan(light(sharp, 81, 143) * 0.1);
    });

    it("draws in a block the face of a drop that starts north of it", () => {
        // The block starts at the row 30; the hollow starts 8 px north of it, its face reaches into the block.
        const out = paint(samples(dug(22, 79, 32), 100), 60, 30);
        expect(alpha(out, 0)).toBe(255);
        expect(isWall(rgb(out, 0))).toBe(true);
    });
});

describe("when the relief is seen in 3/4", () => {
    it("when the player chose it, out of the editor and out of the basic mode only", () => {
        expect(projectionShown({ chosen: true, editorOpen: false, basic: false })).toBe(true);
        expect(projectionShown({ chosen: true, editorOpen: true, basic: false })).toBe(false);
        expect(projectionShown({ chosen: true, editorOpen: false, basic: true })).toBe(false);
        // Not chosen: the ground of the map is drawn flat, by the other engine.
        expect(projectionShown({ chosen: false, editorOpen: false, basic: false })).toBe(false);
    });
});
