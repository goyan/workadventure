import { cellKey } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";

/**
 * A grid whose water is drawn row by row, a character a cell: "." dry, "s" shallow (8 px, fish only), "d" deep
 * (20 px), "t" too thin for a fish (7 px). `eastWalls` lists the cells ("x,y") whose east side is a wall.
 */
export function gridOf(rows: string[], eastWalls: [number, number][] = []): WaterGrid {
    const width = rows[0].length;
    const grid = new WaterGrid(undefined, { x: 0, y: 0, width, height: rows.length }, undefined, {
        east: new Set(eastWalls.map(([x, y]) => cellKey(x, y))),
        south: new Set(),
    });
    const depths: Record<string, number> = { ".": 0, s: 8, d: 20, t: 7 };
    const bytes = new Uint8Array(width * rows.length * 2);
    rows.forEach((row, y) =>
        [...row].forEach((char, x) => {
            const eighths = (depths[char] ?? 0) * 8;
            bytes[(y * width + x) * 2] = eighths & 255;
            bytes[(y * width + x) * 2 + 1] = eighths >> 8;
        }),
    );
    grid.readDepths(bytes);
    return grid;
}

/** A random source that replays the given values, then goes on with a fixed sequence. */
export function scripted(values: number[] = []): () => number {
    let seed = 12345;
    let index = 0;
    return () => {
        if (index < values.length) return values[index++];
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x80000000;
    };
}
