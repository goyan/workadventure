import { heightAt } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import type { RoomConnection } from "../../../../../src/front/Connection/RoomConnection";
import { UpdateTerrainFrontCommand } from "../../../../../src/front/Phaser/Game/MapEditor/Commands/Terrain/UpdateTerrainFrontCommand";

const emptyWam = (): WAMFileFormat => ({
    version: "2.1.0",
    mapUrl: "map.tmj",
    entities: {},
    areas: [],
    entityCollections: [],
});

describe("UpdateTerrainFrontCommand", () => {
    it("digs, then its undo command puts the ground back as it was", async () => {
        const wam = emptyWam();
        const first = new UpdateTerrainFrontCommand(wam, { cells: [{ x: 2, y: 2, height: -8 }] });
        await first.execute();
        const second = new UpdateTerrainFrontCommand(wam, { cells: [{ x: 2, y: 2, height: -40 }], maxDepthTiles: 4 });
        await second.execute();
        expect(heightAt(wam.terrain, 2, 2)).toBe(-40);
        await second.getUndoCommand().execute();
        expect(heightAt(wam.terrain, 2, 2)).toBe(-8);
        // Back to the default depth of a map that never set one.
        expect(wam.terrain?.maxDepthTiles).toBe(2);
        await first.getUndoCommand().execute();
        expect(heightAt(wam.terrain, 2, 2)).toBe(0);
    });

    it("sends its cells to the server under its own command id", async () => {
        const command = new UpdateTerrainFrontCommand(emptyWam(), { cells: [{ x: 2, y: 2, height: -8 }] }, "id-1");
        await command.execute();
        const emitModifyTerrain = vi.fn();
        command.emitEvent({ emitModifyTerrain } as unknown as RoomConnection);
        expect(emitModifyTerrain).toHaveBeenCalledWith("id-1", { cells: [{ x: 2, y: 2, height: -8 }] });
    });
});
