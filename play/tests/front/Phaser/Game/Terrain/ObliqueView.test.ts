import { describe, expect, it } from "vitest";
import { cellKey, heightAt, TERRAIN_CELL, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { waterDepthAtPoint } from "../../../../../src/front/Phaser/Game/Terrain/AvatarDrop";
import {
    decodeHeight,
    encodeHeight,
    heightsOver,
    heightTexel,
    rowOf,
    seenPoint,
    writeHeights,
} from "../../../../../src/front/Phaser/Game/Terrain/ObliqueView";
import { groundPointAt, heightAtPoint, shiftAt } from "../../../../../src/front/Phaser/Game/Terrain/ReliefProjection";

/** A relief of cells 10 to 13 across and 10 to 21 down, all at this height: a hollow under 0, a mount over it. */
function block(height: number): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 10; x <= 13; x++) for (let y = 10; y <= 21; y++) changes.set(cellKey(x, y), height);
    return withHeights(undefined, changes);
}

/** A slope: the ground falls by 8 px a cell going south, from 96 px high, cells 10 to 22 down. */
function slope(): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 8; x <= 15; x++) for (let y = 10; y <= 22; y++) changes.set(cellKey(x, y), 96 - (y - 10) * 8);
    return withHeights(undefined, changes);
}

/**
 * The reference: the southernmost point of the column drawn at this row of the screen or above it, looked for a
 * quarter of a pixel at a time from as far south as anything is drawn higher.
 */
function reference(surfaceAt: (y: number) => number, screenY: number): number {
    for (let y = screenY + 128; y >= screenY - 130; y -= 0.25) {
        if (rowOf(surfaceAt(y), y) <= screenY) return y;
    }
    return screenY - 130;
}

describe("a height kept on two bytes for the shader", () => {
    it("comes back within a thirty-second of a pixel, from the deepest hollow to the highest water", () => {
        for (const height of [-512, -256, -0.5, 0, 0.5, 173, 256, 319.25, 1535]) {
            const [high, low] = encodeHeight(height);
            expect(Number.isInteger(high) && high >= 0 && high <= 255).toBe(true);
            expect(Number.isInteger(low) && low >= 0 && low <= 255).toBe(true);
            expect(Math.abs(decodeHeight(high, low) - height)).toBeLessThanOrEqual(1 / 32);
        }
    });

    it("is blended as its bytes are: half-way between two cells, half-way between their heights", () => {
        for (const [a, b] of [
            [0, 256],
            [-256, 7.9],
            [127.9, 128.1],
        ]) {
            const [highA, lowA] = encodeHeight(a);
            const [highB, lowB] = encodeHeight(b);
            const blended = decodeHeight((highA + highB) / 2, (lowA + lowB) / 2);
            expect(Math.abs(blended - (a + b) / 2)).toBeLessThanOrEqual(1 / 16);
        }
    });
});

describe("the heights sent to the shaders", () => {
    it("are those of the cells of the area, as the map keeps them: not clipped at 255", () => {
        const terrain = withHeights(
            undefined,
            new Map([
                [cellKey(10, 10), -256],
                [cellKey(11, 10), 256],
                [cellKey(10, 11), 13],
            ]),
        );
        // 3 × 2 cells from the cell (10, 10).
        expect([...heightsOver(terrain, 10, 10, 3, 2)]).toEqual([-256, 256, 0, 13, 0, 0]);
        expect([...heightsOver(undefined, 10, 10, 2, 1)]).toEqual([0, 0]);
    });

    it("are written in their own picture, the ground beside the surface, each cell on two bytes", () => {
        const columns = 3;
        const rows = 2;
        const data = new Uint8ClampedArray(columns * 2 * rows * 4).fill(7);
        const ground = Float32Array.from([-256, 256, 0, 12.5, 0, 0]);
        const surface = Float32Array.from([-216, 256, 0, 12.5, 300.25, 0]);
        writeHeights(data, 0, ground, columns, rows);
        writeHeights(data, 1, surface, columns, rows);
        for (let cell = 0; cell < columns * rows; cell++) {
            const groundAt = heightTexel(0, cell, columns);
            const surfaceAt = heightTexel(1, cell, columns);
            expect(decodeHeight(data[groundAt], data[groundAt + 1])).toBeCloseTo(ground[cell], 1);
            expect(decodeHeight(data[surfaceAt], data[surfaceAt + 1])).toBeCloseTo(surface[cell], 1);
            // Opaque: a canvas keeps its colours premultiplied.
            expect(data[groundAt + 3]).toBe(255);
            expect(data[surfaceAt + 3]).toBe(255);
        }
        // The ground of the cell (1, 0) is the second pixel of the first line; its surface is three pixels further.
        expect(heightTexel(0, 1, columns)).toBe(4);
        expect(heightTexel(1, 1, columns)).toBe(16);
        expect(heightTexel(0, 3, columns)).toBe(24);
    });
});

describe("the point of the ground seen at a row of the screen, in 3/4", () => {
    it("is the point itself on flat ground, not stretched", () => {
        const seen = seenPoint(() => 0, 300.5, TERRAIN_CELL);
        expect(seen.y).toBeCloseTo(300.5, 0);
        expect(seen.stretch).toBeCloseTo(1, 5);
    });

    it("is the southernmost point drawn there: in a hollow, on a mount, on a slope, at the limits", () => {
        const reliefs: [string, TerrainData, number][] = [
            ["a hollow of 128 px", block(-128), 0],
            ["the deepest hollow", block(-256), 0],
            ["a mount of 128 px", block(128), 0],
            ["the highest mount", block(256), 0],
            ["a slope", slope(), 0],
            ["a hollow under 40 px of water", block(-128), 40],
            ["a hollow under more water than it is deep", block(-256), 319],
        ];
        for (const [name, terrain, water] of reliefs) {
            for (const x of [184, 200.5]) {
                // The water lies on the cells that are dug, straight between the centres of the cells as the ground
                // is (waterDepthAtPoint: what the avatars and the shaders read).
                const depthAt = (pointX: number, pointY: number) =>
                    heightAt(terrain, Math.floor(pointX / TERRAIN_CELL), Math.floor(pointY / TERRAIN_CELL)) < 0
                        ? water
                        : 0;
                const surfaceAt = (y: number) => heightAtPoint(terrain, x, y) + waterDepthAtPoint(depthAt, x, y);
                for (let screenY = 20.5; screenY < 520; screenY += 5) {
                    const seen = seenPoint(surfaceAt, screenY, TERRAIN_CELL);
                    expect(
                        Math.abs(seen.y - reference(surfaceAt, screenY)),
                        `${name}, x ${x}, row ${screenY}`,
                    ).toBeLessThanOrEqual(1);
                }
            }
        }
    });

    it("is where a click on the drawn ground leads, away from the faces", () => {
        const terrain = slope();
        const x = 184;
        for (let screenY = 60.5; screenY < 400; screenY += 3) {
            const seen = seenPoint((y) => heightAtPoint(terrain, x, y), screenY, TERRAIN_CELL);
            const clicked = groundPointAt(terrain, { x, y: screenY });
            expect(Math.abs(seen.y - clicked.y), `row ${screenY}`).toBeLessThanOrEqual(1.5);
            // And the ground found there is drawn at that row.
            expect(Math.abs(seen.y + shiftAt(terrain, x, seen.y) - screenY)).toBeLessThanOrEqual(1);
        }
    });

    it("tells a face: the ground that falls to the south is stretched on the screen", () => {
        // The south wall of a mount of 256 px: the ground falls 256 px over a cell, drawn over 128 + 16 px.
        const terrain = block(256);
        const surfaceAt = (y: number) => heightAtPoint(terrain, 184, y);
        // The top of the mount ends at y 344 (drawn at 216); its foot is at y 360.
        const onTheWall = seenPoint(surfaceAt, 290.5, TERRAIN_CELL);
        expect(onTheWall.y).toBeGreaterThan(344);
        expect(onTheWall.y).toBeLessThan(360);
        expect(onTheWall.stretch).toBeGreaterThan(1.5);
        const onTheTop = seenPoint(surfaceAt, 150.5, TERRAIN_CELL);
        expect(onTheTop.stretch).toBeCloseTo(1, 1);
    });
});
