import { gunzipSync, gzipSync } from "node:zlib";
import { MeadowSimulation } from "@workadventure/map-editor";
import type { WaterGrid } from "@workadventure/map-editor";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

export type { ReplayedWeather } from "@workadventure/map-editor";

/**
 * The meadow of a room as the server keeps it (MeadowSimulation), so that every player sees the same meadow: told to
 * the room gzipped, and saved, so it survives a restart (and a room left empty lives the time it missed).
 */
export class MeadowManager extends MeadowSimulation {
    constructor(
        room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        rain: Pick<RainTimelineService, "slotsFor">,
        /** The water of the relief: the soil under it is soaked, and its grass drowns. */
        water: () => Pick<WaterGrid, "depthAt"> | undefined,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly clockNow: () => number = Date.now,
        /** The size of the map in cells of the relief, once read. */
        mapSize: () => { width: number; height: number } | undefined = () => undefined,
        /** Where the animals that graze are, in map pixels (the antelopes of the life of the land): they eat the grass under them. */
        grazers: () => readonly { x: number; y: number }[] = () => [],
        /**
         * The conditions of the room for its fire: how ready the grass is to burn (0 to 1), which dries it, and the
         * wind that pushes the flames.
         */
        fireWeather: () => { danger: number; windFrom: number; windSpeed: number } = () => ({
            danger: 0,
            windFrom: 0,
            windSpeed: 0,
        }),
        /** The luck of the fire: whether it spreads, whether one starts by itself. */
        random: () => number = Math.random,
    ) {
        super(room, rain, water, gzipSync, clockNow, mapSize, grazers, fireWeather, random);
    }

    /** The ice over the water of a tile (32 px), in mm: none before the meadow is made (the ice fishing shacks). */
    public iceAt(tileX: number, tileY: number): number {
        return this.current()?.iceAt(tileX, tileY) ?? 0;
    }

    /** Whether the meadow is made (the size of the map read): before, its ice is not known, not none. */
    public hasMeadow(): boolean {
        return this.current() !== undefined;
    }

    /** Brings back the meadow saved before a restart. A store that does not answer must not keep the room closed. */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.grass || !fields.moisture || !fields.size) return;
            const [width, height] = fields.size.split("x").map(Number);
            if (!Number.isInteger(width) || !Number.isInteger(height)) return;
            this.saved = {
                width,
                height,
                grass: new Uint8Array(gunzipSync(Buffer.from(fields.grass, "base64"))),
                moisture: new Uint8Array(gunzipSync(Buffer.from(fields.moisture, "base64"))),
                // Absent from a meadow saved before its grass could dry.
                ...(fields.dryness
                    ? { dryness: new Uint8Array(gunzipSync(Buffer.from(fields.dryness, "base64"))) }
                    : {}),
                // Absent from a meadow saved before it could burn.
                ...(fields.ash ? { ash: new Uint8Array(gunzipSync(Buffer.from(fields.ash, "base64"))) } : {}),
                // Absent from a meadow saved before the snow could lie on it, or without any.
                ...(fields.snow ? { snow: new Uint8Array(gunzipSync(Buffer.from(fields.snow, "base64"))) } : {}),
                // Absent from a meadow saved before its water could freeze.
                ...(fields.ice ? { ice: new Uint8Array(gunzipSync(Buffer.from(fields.ice, "base64"))) } : {}),
            };
            // Absent from a meadow saved before it knew when: it does not catch up.
            const at = Number(fields.at);
            this.savedAt = Number.isFinite(at) && at > 0 ? at : undefined;
            // Absent from a meadow saved before its trees could burn.
            if (fields.trees) {
                this.savedTrees = JSON.parse(gunzipSync(Buffer.from(fields.trees, "base64")).toString("utf8"));
            }
        } catch (error) {
            console.error("Could not restore the meadow of the map", error);
        }
    }

    protected save(): void {
        const meadow = this.current();
        if (!this.store || !meadow || !this.changedSinceSave) return;
        this.changedSinceSave = false;
        const fields: [string, string][] = [
            ["grass", Buffer.from(gzipSync(meadow.writeGrass())).toString("base64")],
            ["moisture", Buffer.from(gzipSync(meadow.writeMoisture())).toString("base64")],
            ["dryness", Buffer.from(gzipSync(meadow.writeDryness())).toString("base64")],
            ["ash", Buffer.from(gzipSync(meadow.writeAsh())).toString("base64")],
            ["snow", Buffer.from(gzipSync(meadow.writeSnow())).toString("base64")],
            ["ice", Buffer.from(gzipSync(meadow.writeIce())).toString("base64")],
            ["trees", Buffer.from(gzipSync(JSON.stringify(this.writeTrees()))).toString("base64")],
            ["size", `${meadow.width}x${meadow.height}`],
            // When it is true: the time reached while it catches up, else now.
            ["at", String(this.catchUp ? this.catchUp.at : this.clockNow())],
        ];
        for (const [field, value] of fields) {
            this.store.repository
                .saveVariable(this.hashKey(), field, value)
                .catch((error) => console.error("Could not save the meadow of the map", error));
        }
    }

    private hashKey(): string {
        return `meadow:${this.store?.roomUrl ?? ""}`;
    }
}
