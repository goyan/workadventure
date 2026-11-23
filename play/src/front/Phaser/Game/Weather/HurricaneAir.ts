import { hurricaneAirWindAt } from "@workadventure/map-editor";
import type { HurricaneAirMessage } from "@workadventure/messages";

/** The server tells the wind of the air of a hurricane twice a second (MAP_AIR_STEPS_PER_MESSAGE). */
export const HURRICANE_AIR_MESSAGE_MS = 500;
/**
 * Past this long without news of the air (ms), its wind is no longer taken: the server stopped simulating it (its air
 * failed), the formula of the hurricane takes over.
 */
export const HURRICANE_AIR_STALE_MS = 3000;

/**
 * The wind of the air of the hurricane crossing the map, as the server tells it (HurricaneAirMessage): the last two
 * fields told, the wind going from the one before to the last over the time between two (so that it does not jump
 * twice a second). Only for the hurricane it was told for; nothing once it is stale.
 */
export class HurricaneAirField {
    private previous: HurricaneAirMessage | undefined;
    private current: HurricaneAirMessage | undefined;
    /** When the last field came (ms of `clock`). */
    private receivedAt = 0;
    /** Changes with each field told: what draws from it knows when to draw again. */
    public version = 0;

    constructor(private readonly clock: () => number = () => performance.now()) {}

    public receive(message: HurricaneAirMessage): void {
        // A field of another hurricane is not mixed with this one.
        this.previous = this.current?.hurricaneId === message.hurricaneId ? this.current : undefined;
        this.current = message;
        this.receivedAt = this.clock();
        this.version++;
    }

    public clear(): void {
        this.previous = undefined;
        this.current = undefined;
        this.version++;
    }

    /**
     * The fields to draw from for the hurricane `hurricaneId` now, and how far from the one before to the last (0 to
     * 1); undefined when none was told for it, or long ago.
     */
    public fields(
        hurricaneId: number | undefined,
    ): { previous: HurricaneAirMessage; current: HurricaneAirMessage; share: number } | undefined {
        const current = this.current;
        if (!current || hurricaneId === undefined || current.hurricaneId !== hurricaneId) return undefined;
        const since = this.clock() - this.receivedAt;
        if (!(since < HURRICANE_AIR_STALE_MS)) return undefined;
        const previous = this.previous && sameGrid(this.previous, current) ? this.previous : current;
        return { previous, current, share: Math.min(1, Math.max(0, since / HURRICANE_AIR_MESSAGE_MS)) };
    }

    /** The wind at 10 m at a map point (m/s, east and north) under the hurricane `hurricaneId`; undefined: not known. */
    public windAt(hurricaneId: number | undefined, x: number, y: number): { east: number; north: number } | undefined {
        const fields = this.fields(hurricaneId);
        if (!fields) return undefined;
        const before = hurricaneAirWindAt(fields.previous, x, y);
        const after = hurricaneAirWindAt(fields.current, x, y);
        return {
            east: before.east + (after.east - before.east) * fields.share,
            north: before.north + (after.north - before.north) * fields.share,
        };
    }
}

function sameGrid(a: HurricaneAirMessage, b: HurricaneAirMessage): boolean {
    return a.columns === b.columns && a.rows === b.rows && a.cellPx === b.cellPx;
}

/** A wind (m/s, east and north) as the weather says it: km/h, and where it comes from (degrees, 0: north). */
export function windOfAir(wind: { east: number; north: number }): { windSpeed: number; windFrom: number } {
    const from = (Math.atan2(wind.east, wind.north) * 180) / Math.PI + 180;
    return { windSpeed: Math.hypot(wind.east, wind.north) * 3.6, windFrom: ((from % 360) + 360) % 360 };
}

/** The air of the hurricane of the room, as this player was last told it. */
export const roomHurricaneAir = new HurricaneAirField();
