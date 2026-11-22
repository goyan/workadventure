import { describe, expect, it, vi } from "vitest";
import { poolSoilCode, TERRAIN_CELL, TERRAIN_CHUNK } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { iceAt } from "@wa/front/Phaser/Game/Weather/Frost";
import { iceUnderfoot } from "@wa/front/Phaser/Game/Ice/FrozenWater";
import { IceBreaks } from "@wa/front/Phaser/Game/Ice/IceBreaks";
import type * as FrostModule from "@wa/front/Phaser/Game/Weather/Frost";

// A player who follows a place of their own, at -5 °C.
vi.mock("@wa/front/Phaser/Game/Weather/GroundSource", () => ({ meadowHoldsSnow: () => false }));
vi.mock("@wa/front/Phaser/Game/Weather/Frost", async (importOriginal) => {
    const original = await importOriginal<typeof FrostModule>();
    return { ...original, waterCycleNow: () => ({ frost: 0, ice: original.iceAt(-5), wet: 0, snowMm: 0 }) };
});

const centre = (cell: number): number => (cell + 0.5) * TERRAIN_CELL;

/** A map whose cell (1, 1) is a pool, the rest a lake: water 48 px deep everywhere. */
function sceneWith(hot: boolean, breaks = new IceBreaks()) {
    const codes = new Array<number>(TERRAIN_CHUNK * TERRAIN_CHUNK).fill(0);
    codes[TERRAIN_CHUNK + 1] = poolSoilCode(0);
    const terrain = { soil: { "0,0": codes } } as unknown as TerrainData;
    const wam = {
        terrain,
        settings: { pools: [{ water: "#22c3c9", coping: "#e9e3d3", depthPx: 48, hot, ladders: 2 }] },
    };
    return {
        time: { now: 0 },
        getTerrainWater: () => ({ depthAt: () => 48 }),
        getOutdoorGrid: () => ({ isOutdoorAt: () => true }),
        getGameMap: () => ({ getWamFile: () => ({ getWam: () => wam }) }),
        getIceBreaks: () => breaks,
    } as unknown as Parameters<typeof iceUnderfoot>[0];
}

describe("iceUnderfoot, for a player who follows their own place", () => {
    it("freezes a pool from its surface (thin ice at -5 °C), while the deep water of a lake stays open", () => {
        expect(iceAt(-5)).toBeGreaterThan(0);
        const scene = sceneWith(false);
        expect(iceUnderfoot(scene, { x: centre(1), y: centre(1) })).toBe("thin");
        expect(iceUnderfoot(scene, { x: centre(3), y: centre(3) })).toBe("none");
    });

    it("never freezes a heated pool, and lets one swim in a hole once the ice gave way", () => {
        expect(iceUnderfoot(sceneWith(true), { x: centre(1), y: centre(1) })).toBe("none");
        const breaks = new IceBreaks();
        breaks.addHole(centre(1), centre(1), 0);
        expect(iceUnderfoot(sceneWith(false, breaks), { x: centre(1), y: centre(1) })).toBe("none");
    });
});
