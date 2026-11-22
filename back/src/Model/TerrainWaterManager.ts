import { constants as zlibConstants, gunzipSync, gzipSync } from "node:zlib";
import { WaterGrid, WaterSimulation } from "@workadventure/map-editor";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

/**
 * The states told to the room are zipped by runs of the same byte only (the RLE strategy of zlib), not by looking
 * for repeated strings: they are differences with the state before, mostly runs of zeros and of a few values. The
 * server has one thread; measured on the states of a real map, it zips them three to five times faster than the
 * usual way, into 4 to 9 % fewer bytes (6 % more for a whole state, told every half minute and to who comes in).
 * The browsers unzip it as any gzip.
 */
const toldZip = (bytes: Uint8Array): Uint8Array => gzipSync(bytes, { strategy: zlibConstants.Z_RLE });

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
        // The state last told can also be asked as it is, unzipped (lastTold): the zip steps aside meanwhile.
        const asIs = { on: false };
        super(room, rain, (bytes) => (asIs.on ? bytes : toldZip(bytes)), now, mapSize, clock);
        this.asIs = asIs;
    }

    private readonly asIs: { on: boolean };
    /** Called after each step of the water: what follows it from elsewhere (the ground computed on another thread). */
    public stepped: () => void = () => undefined;

    public override step(): void {
        super.step();
        this.stepped();
    }

    /**
     * The whole state the room was last told, unzipped, with its number and its bounds: what a snapshot zips for a
     * player who joins. Undefined on a map without water, or while the room was told nothing. The bytes are those the
     * water keeps: copied by who holds on to them.
     */
    public lastTold():
        | { x: number; y: number; width: number; height: number; seq: number; bytes: Uint8Array }
        | undefined {
        this.asIs.on = true;
        try {
            const told = this.snapshot();
            return (
                told && {
                    x: told.x,
                    y: told.y,
                    width: told.width,
                    height: told.height,
                    seq: told.seq,
                    bytes: told.depths,
                }
            );
        } finally {
            this.asIs.on = false;
        }
    }

    /** A whole state for a player who joins, from a state told (lastTold): zipped as the water zips its own. */
    public static snapshotOf(told: {
        x: number;
        y: number;
        width: number;
        height: number;
        seq: number;
        bytes: Uint8Array;
    }) {
        return {
            x: told.x,
            y: told.y,
            width: told.width,
            height: told.height,
            seq: told.seq,
            full: true,
            depths: toldZip(told.bytes),
        };
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
