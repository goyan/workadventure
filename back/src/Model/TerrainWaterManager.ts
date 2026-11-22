import { gunzipSync, gzipSync } from "node:zlib";
import { WaterGrid, WaterSimulation } from "@workadventure/map-editor";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

const SavedBounds = z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(0).max(4096),
    height: z.number().int().min(0).max(4096),
});

/**
 * The water of the relief of a room as the server keeps it (WaterSimulation), so that every player sees the same
 * water: told to the room gzipped, and saved, so it survives a restart.
 */
export class TerrainWaterManager extends WaterSimulation {
    constructor(
        room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        rain: Pick<RainTimelineService, "slotsFor">,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        now: () => number = Date.now,
        /** The size of the map in cells of the relief, once read: the water stays inside the map. */
        mapSize: () => { width: number; height: number } | undefined = () => undefined,
        /** A clock in ms, to time the steps. */
        clock: () => number = () => performance.now(),
    ) {
        super(room, rain, gzipSync, now, mapSize, clock);
    }

    /**
     * Brings back the water saved before a restart. A store that does not answer, or water that cannot be read, must
     * not keep the room closed: the map is then dry.
     */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.grid || !fields.bounds) return;
            const bounds = SavedBounds.parse(JSON.parse(fields.bounds));
            const grid = new WaterGrid(undefined, bounds);
            if (grid.readDepths(new Uint8Array(gunzipSync(Buffer.from(fields.grid, "base64"))))) this.saved = grid;
        } catch (error) {
            console.error("Could not restore the water of the relief of the map", error);
        }
    }

    protected save(): void {
        const grid = this.getGrid();
        if (!this.store || !grid || !this.changedSinceSave) return;
        this.changedSinceSave = false;
        const fields: [string, string][] = [
            // All the water, what a ball holds under itself included.
            ["grid", Buffer.from(gzipSync(grid.writeDepths(true))).toString("base64")],
            ["bounds", JSON.stringify(grid.bounds)],
        ];
        for (const [field, value] of fields) {
            this.store.repository
                .saveVariable(this.hashKey(), field, value)
                .catch((error) => console.error("Could not save the water of the relief of the map", error));
        }
    }

    private hashKey(): string {
        return `terrain-water:${this.store?.roomUrl ?? ""}`;
    }
}
