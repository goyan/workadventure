import { describe, expect, it } from "vitest";
import { MAX_TERRAIN_COMMAND_CELLS, UpdateTerrainCommand } from "../src/Commands/Terrain/UpdateTerrainCommand";
import { UpdateWAMSettingCommand } from "../src/Commands/WAM/UpdateWAMSettingCommand";
import { MAX_STROKE_CELLS } from "../src/Terrain/TerrainBrush";
import { heightAt, soilAt } from "../src/Terrain/TerrainGrid";
import type { WAMFileFormat } from "../src/types";

const emptyWam = (): WAMFileFormat => ({
    version: "2.1.0",
    mapUrl: "map.tmj",
    entities: {},
    areas: [],
    entityCollections: [],
});

describe("UpdateTerrainCommand", () => {
    it("applies the heights of the cells and says what they were", async () => {
        const wam = emptyWam();
        const command = new UpdateTerrainCommand(wam, { cells: [{ x: 3, y: 4, height: -24 }] });
        await command.execute();
        expect(heightAt(wam.terrain, 3, 4)).toBe(-24);
        expect(command.previous()).toEqual({
            cells: [{ x: 3, y: 4, height: 0 }],
            maxDepthTiles: undefined,
            soils: [],
        });
        // What it was, applied again, gives the flat map back.
        await new UpdateTerrainCommand(wam, command.previous()).execute();
        expect(wam.terrain?.chunks).toEqual({});
    });

    it("sets the maximum depth of the map, and gives the former one back", async () => {
        const wam = emptyWam();
        const command = new UpdateTerrainCommand(wam, { cells: [], maxDepthTiles: 5 });
        await command.execute();
        expect(wam.terrain?.maxDepthTiles).toBe(5);
        // A map that never set one had the default depth.
        expect(command.previous().maxDepthTiles).toBe(2);
        const again = new UpdateTerrainCommand(wam, { cells: [], maxDepthTiles: 3 });
        await again.execute();
        expect(again.previous().maxDepthTiles).toBe(5);
    });

    it("clamps heights and the maximum depth", async () => {
        const wam = emptyWam();
        await new UpdateTerrainCommand(wam, { cells: [{ x: 0, y: 0, height: -9999 }], maxDepthTiles: 99 }).execute();
        expect(heightAt(wam.terrain, 0, 0)).toBe(-256);
        expect(wam.terrain?.maxDepthTiles).toBe(8);
        await new UpdateTerrainCommand(wam, { cells: [{ x: 1, y: 0, height: 9999 }], maxDepthTiles: 0 }).execute();
        expect(heightAt(wam.terrain, 1, 0)).toBe(256);
        expect(wam.terrain?.maxDepthTiles).toBe(1);
    });

    // A command from a modified client must neither grow without bound nor write a broken relief.
    it("refuses a command over the bound and cells far outside any map", async () => {
        expect(MAX_TERRAIN_COMMAND_CELLS).toBe(MAX_STROKE_CELLS);
        const tooMany = Array.from({ length: MAX_TERRAIN_COMMAND_CELLS + 1 }, (_, index) => ({
            x: index,
            y: 0,
            height: -1,
        }));
        const wam = emptyWam();
        await expect(new UpdateTerrainCommand(wam, { cells: tooMany }).execute()).rejects.toThrow();
        expect(wam.terrain).toBeUndefined();
        await expect(
            new UpdateTerrainCommand(wam, { cells: [{ x: 99_999_999, y: 0, height: -1 }] }).execute(),
        ).rejects.toThrow();
        expect(wam.terrain).toBeUndefined();
    });

    it("stores the water settings through the settings command, within their bounds", async () => {
        const wam = emptyWam();
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWaterSettingMessage",
                updateWaterSettingMessage: { runoff: 500, evaporation: -1, speed: 99999, absorption: 500, current: 9 },
            },
        }).execute();
        expect(wam.settings?.water).toEqual({ runoff: 100, evaporation: 0, speed: 1000, absorption: 100, current: 2 });
        await new UpdateWAMSettingCommand(wam, {
            message: {
                $case: "updateWaterSettingMessage",
                updateWaterSettingMessage: { runoff: 4, evaporation: 0.5, speed: 1, absorption: 2 },
            },
        }).execute();
        expect(wam.settings?.water).toEqual({ runoff: 4, evaporation: 0.5, speed: 1, absorption: 2, current: 2 });
        // An older client sends no speed: the one of the map is kept.
        await new UpdateWAMSettingCommand(wam, {
            message: { $case: "updateWaterSettingMessage", updateWaterSettingMessage: { runoff: 4, evaporation: 0.5 } },
        }).execute();
        expect(wam.settings?.water).toMatchObject({ speed: 1, absorption: 2, current: 2 });
    });
});

describe("UpdateTerrainCommand, soils", () => {
    it("paints soils, and gives back what undoes it", async () => {
        const wam = emptyWam();
        await new UpdateTerrainCommand(wam, { cells: [], soils: [{ x: 1, y: 2, soil: 5 }] }).execute();
        expect(soilAt(wam.terrain, 1, 2)).toBe(5);
        const second = new UpdateTerrainCommand(wam, {
            cells: [{ x: 1, y: 2, height: -8 }],
            soils: [{ x: 1, y: 2, soil: 3 }],
        });
        await second.execute();
        expect(soilAt(wam.terrain, 1, 2)).toBe(3);
        expect(second.previous().soils).toEqual([{ x: 1, y: 2, soil: 5 }]);
        await new UpdateTerrainCommand(wam, second.previous()).execute();
        expect(soilAt(wam.terrain, 1, 2)).toBe(5);
        expect(heightAt(wam.terrain, 1, 2)).toBe(0);
    });

    it("refuses a command with too many cells, heights and soils together", async () => {
        const soils = Array.from({ length: MAX_TERRAIN_COMMAND_CELLS }, (_, index) => ({ x: index, y: 0, soil: 1 }));
        await expect(
            new UpdateTerrainCommand(emptyWam(), { cells: [{ x: 0, y: 1, height: -8 }], soils }).execute(),
        ).rejects.toThrow();
    });
});
