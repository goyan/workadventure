import { cellKey, withHeights, withSoils } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { ContourCache, contourSegments } from "@wa/front/Phaser/Game/Terrain/TerrainContours";
import type { ContourSegment } from "@wa/front/Phaser/Game/Terrain/TerrainContours";

const terrainOf = (cells: [number, number, number][]) =>
    withHeights(undefined, new Map(cells.map(([x, y, height]) => [cellKey(x, y), height])));

describe("contourSegments", () => {
    it("draws nothing on level ground, nor around a hollow shallower than a step", () => {
        expect(contourSegments(undefined, 8, 32)).toEqual([]);
        expect(contourSegments(terrainOf([[3, 2, -7]]), 8, 32)).toEqual([]);
    });

    it("draws a line around a cell a step deeper than its neighbours, along the edges of the cell", () => {
        const segments = contourSegments(terrainOf([[3, 2, -8]]), 8, 32);
        expect(segments).toHaveLength(4);
        expect(segments).toContainEqual({ x1: 48, y1: 32, x2: 64, y2: 32, major: false }); // north
        expect(segments).toContainEqual({ x1: 48, y1: 48, x2: 64, y2: 48, major: false }); // south
        expect(segments).toContainEqual({ x1: 48, y1: 32, x2: 48, y2: 48, major: false }); // west
        expect(segments).toContainEqual({ x1: 64, y1: 32, x2: 64, y2: 48, major: false }); // east
    });

    it("draws nothing between two cells of the same step", () => {
        const segments = contourSegments(
            terrainOf([
                [3, 2, -8],
                [4, 2, -12],
            ]),
            8,
            32,
        );
        expect(segments).toHaveLength(6);
        expect(segments).not.toContainEqual({ x1: 64, y1: 32, x2: 64, y2: 48, major: false });
    });

    it("marks the lines that cross a major level", () => {
        const segments = contourSegments(terrainOf([[3, 2, -32]]), 8, 32);
        expect(segments).toHaveLength(4);
        expect(segments.every((segment) => segment.major)).toBe(true);
    });

    it("draws a mount like a hollow of the same size", () => {
        expect(contourSegments(terrainOf([[3, 2, 7]]), 8, 32)).toEqual([]);
        const segments = contourSegments(terrainOf([[3, 2, 8]]), 8, 32);
        expect(segments).toHaveLength(4);
        expect(segments).toContainEqual({ x1: 48, y1: 32, x2: 64, y2: 32, major: false });
        expect(contourSegments(terrainOf([[3, 2, 32]]), 8, 32).every((segment) => segment.major)).toBe(true);
        // A cliff between a hollow and a mount is one line, drawn once.
        expect(
            contourSegments(
                terrainOf([
                    [3, 2, -8],
                    [4, 2, 8],
                ]),
                8,
                32,
            ),
        ).toHaveLength(7);
    });
});

const key = (segment: ContourSegment): string =>
    `${segment.x1},${segment.y1},${segment.x2},${segment.y2},${segment.major ? "major" : "minor"}`;
const sorted = (segments: readonly ContourSegment[]): string[] => segments.map(key).sort();
const cached = (cache: ContourCache): string[] =>
    [...cache.chunkKeys()].flatMap((chunk) => cache.segmentsOf(chunk).map(key)).sort();

describe("contourSegments at the edges of the chunks", () => {
    it("draws the four sides of a cell in the corner of a chunk, whichever chunks are around it", () => {
        // The relief is kept by chunks of 16 × 16 cells: 15 is the last cell of a chunk, 16 the first of the next.
        for (const [x, y] of [
            [15, 15],
            [16, 16],
            [16, 15],
            [15, 16],
        ]) {
            const segments = contourSegments(terrainOf([[x, y, -8]]), 8, 32);
            expect(sorted(segments)).toEqual(
                sorted([
                    { x1: x * 16, y1: y * 16, x2: x * 16 + 16, y2: y * 16, major: false },
                    { x1: x * 16, y1: y * 16 + 16, x2: x * 16 + 16, y2: y * 16 + 16, major: false },
                    { x1: x * 16, y1: y * 16, x2: x * 16, y2: y * 16 + 16, major: false },
                    { x1: x * 16 + 16, y1: y * 16, x2: x * 16 + 16, y2: y * 16 + 16, major: false },
                ]),
            );
        }
    });

    it("draws a line between two chunks once", () => {
        const segments = contourSegments(
            terrainOf([
                [15, 3, -8],
                [16, 3, -40],
            ]),
            8,
            32,
        );
        expect(segments.filter((segment) => segment.x1 === 256 && segment.x2 === 256)).toEqual([
            { x1: 256, y1: 48, x2: 256, y2: 64, major: true },
        ]);
        expect(segments).toHaveLength(7);
    });
});

describe("ContourCache", () => {
    it("holds the lines of the whole relief at first", () => {
        const terrain = terrainOf([
            [3, 2, -8],
            [40, 30, -40],
            [16, 15, 12],
        ]);
        const cache = new ContourCache(8, 32);
        cache.update(terrain);
        expect(cached(cache)).toEqual(sorted(contourSegments(terrain, 8, 32)));
    });

    it("works out again only the chunks a stroke changed and their neighbours, and holds the lines of the relief after it", () => {
        // A lake over many chunks, then a channel dug at the corner of four of them.
        const lake: [number, number, number][] = [];
        for (let x = 0; x < 96; x++) for (let y = 0; y < 64; y++) lake.push([x, y, -((x * 7 + y * 3) % 50)]);
        let terrain = terrainOf(lake);
        const cache = new ContourCache(8, 32);
        cache.update(terrain);
        const chunksBefore = cache.computedChunks();
        terrain = withHeights(
            terrain,
            new Map([
                [cellKey(47, 31), -120],
                [cellKey(48, 32), -120],
            ]),
        );
        const redrawn = cache.update(terrain);
        // The chunks of the two cells (2,1) and (3,2), and those around each.
        expect(cache.computedChunks() - chunksBefore).toBeLessThanOrEqual(10);
        expect(redrawn).toContain("2,1");
        expect(redrawn).toContain("3,2");
        expect(cached(cache)).toEqual(sorted(contourSegments(terrain, 8, 32)));
    });

    it("forgets the lines of a chunk filled in again, and those it drew along its neighbours", () => {
        const dug = terrainOf([
            [16, 16, -8],
            [17, 16, -8],
        ]);
        const cache = new ContourCache(8, 32);
        cache.update(dug);
        const filled = withHeights(
            dug,
            new Map([
                [cellKey(16, 16), 0],
                [cellKey(17, 16), 0],
            ]),
        );
        cache.update(filled);
        expect(cached(cache)).toEqual([]);
        expect([...cache.chunkKeys()]).toEqual([]);
    });

    it("does nothing when only the soils changed, and follows an undo and a relief replaced whole", () => {
        const first = terrainOf([[5, 5, -16]]);
        const cache = new ContourCache(8, 32);
        cache.update(first);
        const computed = cache.computedChunks();
        const painted = withSoils(first, new Map([[cellKey(5, 5), 1]]));
        expect(cache.update(painted).size).toBe(0);
        expect(cache.computedChunks()).toBe(computed);

        const deeper = withHeights(painted, new Map([[cellKey(5, 6), -40]]));
        cache.update(deeper);
        expect(cached(cache)).toEqual(sorted(contourSegments(deeper, 8, 32)));
        // Undone: the cell is set back as it was.
        const undone = withHeights(deeper, new Map([[cellKey(5, 6), 0]]));
        cache.update(undone);
        expect(cached(cache)).toEqual(sorted(contourSegments(first, 8, 32)));

        // The map loaded again, or edited by someone else: another relief, every chunk another array.
        const other = terrainOf([
            [80, 80, 24],
            [5, 5, -16],
        ]);
        cache.update(other);
        expect(cached(cache)).toEqual(sorted(contourSegments(other, 8, 32)));
        cache.update(undefined);
        expect(cached(cache)).toEqual([]);
    });
});
