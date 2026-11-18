import { cellKey, cellOf, heightAt, MAX_STROKE_CELLS, strokeChanges, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import { brushSettingsOf, commitStroke } from "../../../../../src/front/Phaser/Game/Terrain/TerrainStroke";

const brush = { mode: "dig" as const, diameterTiles: 4, forcePx: undefined };
const everywhere = (): boolean => true;
const point = { x: 200, y: 200 };

describe("brushSettingsOf", () => {
    it("gives an automatic force of an eighth of the diameter, and the chosen one otherwise", () => {
        expect(brushSettingsOf(brush, 2)).toEqual({ mode: "dig", diameterTiles: 4, forcePx: 16, maxDepthTiles: 2 });
        expect(brushSettingsOf({ ...brush, diameterTiles: 12 }, 2).forcePx).toBe(48);
        expect(brushSettingsOf({ ...brush, forcePx: 5 }, 3)).toMatchObject({ forcePx: 5, maxDepthTiles: 3 });
    });
});

describe("commitStroke", () => {
    it("sends one command for a click, with the cells the brush changes there", async () => {
        const send = vi.fn((_changes: ReadonlyMap<string, number>) => Promise.resolve());
        await commitStroke([point], brushSettingsOf(brush, 2), undefined, everywhere, send);
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0]).toEqual(strokeChanges(undefined, [point], brushSettingsOf(brush, 2), everywhere));
    });

    it("sends one command for a whole drag, not one for each point", async () => {
        const send = vi.fn((_changes: ReadonlyMap<string, number>) => Promise.resolve());
        const path = Array.from({ length: 30 }, (_, index) => ({ x: 200 + index * 6, y: 200 }));
        await commitStroke(path, brushSettingsOf(brush, 2), undefined, everywhere, send);
        expect(send).toHaveBeenCalledOnce();
        const changes = send.mock.calls[0][0];
        // Dug once along the path: the depth of one pass, not thirty.
        expect(changes.get(cellKey(12, 12))).toBe(-16);
        expect(changes.get(cellKey(20, 12))).toBe(-16);
    });

    it("sends nothing for a cancelled gesture, a stroke indoors or a fill of flat ground", async () => {
        const send = vi.fn((_changes: ReadonlyMap<string, number>) => Promise.resolve());
        await commitStroke([], brushSettingsOf(brush, 2), undefined, everywhere, send);
        await commitStroke([point], brushSettingsOf(brush, 2), undefined, () => false, send);
        await commitStroke([point], brushSettingsOf({ ...brush, mode: "fill" }, 2), undefined, everywhere, send);
        expect(send).not.toHaveBeenCalled();
    });

    it("digs only the cells that may be dug", async () => {
        const send = vi.fn((_changes: ReadonlyMap<string, number>) => Promise.resolve());
        await commitStroke([point], brushSettingsOf(brush, 2), undefined, (x) => x >= 12, send);
        const changes = send.mock.calls[0][0];
        expect([...changes.keys()].every((key) => cellOf(key).x >= 12)).toBe(true);
    });

    // A drag across the whole map is sent in several commands, none of them too large, and covers the whole path.
    it("sends a huge drag in several bounded commands, one after the other", async () => {
        const order: number[] = [];
        let terrain: TerrainData | undefined;
        const send = vi.fn(async (changes: ReadonlyMap<string, number>) => {
            order.push(changes.size);
            await Promise.resolve();
            terrain = withHeights(terrain, changes);
        });
        const path = [
            { x: 0, y: 0 },
            { x: 20000, y: 0 },
        ];
        await commitStroke(path, brushSettingsOf({ ...brush, diameterTiles: 12 }, 2), undefined, everywhere, send);
        expect(send.mock.calls.length).toBeGreaterThan(1);
        for (const size of order) expect(size).toBeLessThanOrEqual(MAX_STROKE_CELLS);
        for (let cell = 0; cell <= 1250; cell += 25) expect(heightAt(terrain, cell, 0)).toBe(-48);
    });
});
