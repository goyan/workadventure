import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { contourSegments } from "../../../../../src/front/Phaser/Game/Terrain/TerrainContours";

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
