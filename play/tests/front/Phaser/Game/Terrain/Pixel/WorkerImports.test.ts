import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TERRAIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../src/front/Phaser/Game/Terrain");

/** The files the worker that paints the blocks of the terrain starts from: everything they import is loaded in it. */
const WORKER_ENTRIES = [
    "Pixel/PixelNoise.ts",
    "Pixel/PixelPalette.ts",
    "Pixel/GroundPixel.ts",
    "Pixel/WaterPixel.ts",
    "Pixel/MaterialBorder.ts",
    "Pixel/ColumnPainter.ts",
    "Pixel/BlockWindow.ts",
    "Pixel/TerrainUnits.ts",
    "Pixel/BlockPainter.ts",
];

/** What a worker must not load: the map editor library (zod and every schema), Phaser, Svelte, the stores. */
const HEAVY = [/^@workadventure\/map-editor/, /^phaser$/, /^svelte/, /\/Stores\//];

/** The value imports of a source: `import type` and `export type` load nothing. */
function valueImports(source: string): { from: string; line: number }[] {
    const found: { from: string; line: number }[] = [];
    const statement = /^(import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"|^import\s+"([^"]+)"/gm;
    for (const match of source.matchAll(statement)) {
        found.push({ from: match[2] ?? match[3], line: source.slice(0, match.index).split("\n").length });
    }
    return found;
}

describe("the worker that paints the blocks of the terrain", () => {
    it("loads nothing heavy: neither the map editor library, nor Phaser, nor Svelte, nor a store", () => {
        const seen = new Set<string>();
        const heavy: string[] = [];
        const walk = (file: string): void => {
            if (seen.has(file)) return;
            seen.add(file);
            expect(existsSync(file), file).toBe(true);
            for (const { from, line } of valueImports(readFileSync(file, "utf8"))) {
                if (HEAVY.some((pattern) => pattern.test(from))) {
                    heavy.push(`${file.replace(TERRAIN, "Terrain")}:${line} imports "${from}"`);
                } else if (from.startsWith(".")) {
                    walk(resolve(dirname(file), `${from}.ts`));
                } else {
                    heavy.push(`${file.replace(TERRAIN, "Terrain")}:${line} imports the package "${from}"`);
                }
            }
        };
        for (const entry of WORKER_ENTRIES) walk(resolve(TERRAIN, entry));
        expect(heavy).toEqual([]);
        expect(seen.size).toBeGreaterThanOrEqual(WORKER_ENTRIES.length);
    });

    it("tells a value import from a type import", () => {
        const source = [
            'import { a } from "@workadventure/map-editor";',
            'import type { B } from "phaser";',
            'export { c } from "./Other";',
            "import {",
            "    d,",
            '} from "../Stores/Thing";',
        ].join("\n");
        expect(valueImports(source)).toEqual([
            { from: "@workadventure/map-editor", line: 1 },
            { from: "./Other", line: 3 },
            { from: "../Stores/Thing", line: 4 },
        ]);
    });
});
