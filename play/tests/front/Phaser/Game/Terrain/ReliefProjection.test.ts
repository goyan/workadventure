import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { ColumnSample } from "../../../../../src/front/Phaser/Game/Terrain/ReliefProjection";
import {
    DROP_SCALE,
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
    const FLAT: [number, number, number] = [200, 210, 220];
    const FLOOR: [number, number, number] = [90, 100, 80];
    const WALL: [number, number, number] = [150, 130, 100];
    /** One sample a texel (2 px) of the ground from y 0, dug `drop` px lower on the texels `from` to `to`. */
    function samples(from: number, to: number, drop: number, count = 100): ColumnSample[] {
        return Array.from({ length: count }, (_, texel) => {
            const dug = texel >= from && texel <= to;
            return {
                groundY: texel * 2,
                drop: dug ? drop : 0,
                color: dug ? FLOOR : FLAT,
                wallTint: WALL,
                plain: !dug,
            };
        });
    }
    const paint = (column: ColumnSample[], rows: number, firstRow: number): Uint8ClampedArray => {
        const out = new Uint8ClampedArray(rows * 4);
        paintColumn(column, rows, firstRow, out, 1, 0);
        return out;
    };
    const alpha = (out: Uint8ClampedArray, row: number) => out[row * 4 + 3];
    const rgb = (out: Uint8ClampedArray, row: number) => [out[row * 4], out[row * 4 + 1], out[row * 4 + 2]];

    it("leaves the plain ground to the map", () => {
        const out = paint(samples(1000, 1000, 0), 100, 0);
        expect([...Array(100).keys()].every((row) => alpha(out, row) === 0)).toBe(true);
    });

    it("draws the face of the drop under the north rim, then the floor lower by its drop", () => {
        // Dug 64 px deep: drawn 32 px (16 texels) lower, from the texel 20 of the ground.
        const out = paint(samples(20, 79, 32), 120, 0);
        expect(alpha(out, 19)).toBe(0);
        for (let row = 20; row <= 35; row++) expect(alpha(out, row)).toBe(255);
        const top = rgb(out, 20).reduce((a, b) => a + b, 0);
        const foot = rgb(out, 35).reduce((a, b) => a + b, 0);
        expect(top).toBeGreaterThan(foot);
        expect(rgb(out, 40)).toEqual(FLOOR);
    });

    it("lets the south rim hide the floor behind it", () => {
        const out = paint(samples(20, 79, 32), 120, 0);
        expect(alpha(out, 85)).toBe(255);
        expect(rgb(out, 85)).toEqual(FLAT);
        expect(alpha(out, 97)).toBe(0);
    });

    it("draws in a block the face of a drop that starts north of it", () => {
        // The block starts at the texel 30; the hollow starts 4 texels north of it.
        const out = paint(samples(26, 79, 32), 60, 30);
        expect(alpha(out, 0)).toBe(255);
        expect(alpha(out, 11)).toBe(255);
    });
});

describe("when the relief is seen in 3/4", () => {
    it("out of the editor and out of the basic mode only", () => {
        expect(projectionShown({ editorOpen: false, basic: false })).toBe(true);
        expect(projectionShown({ editorOpen: true, basic: false })).toBe(false);
        expect(projectionShown({ editorOpen: false, basic: true })).toBe(false);
    });
});
