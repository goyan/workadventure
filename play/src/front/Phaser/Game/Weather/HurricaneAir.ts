import { hurricaneAirWindAt } from "@workadventure/map-editor";
import type { HurricaneAirMessage } from "@workadventure/messages";
import type { SeaAir } from "../Terrain/WindSeaShader";

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
    /** The picture of the last two fields for the sea, made again when a field is told. */
    private picture: { version: number; step: number; pixels: Uint8ClampedArray<ArrayBuffer> } | undefined;

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

    /**
     * The wind of the air as the sea reads it (SeaAir): the field before and the last side by side, in bytes of a step
     * that holds both. Undefined when none is known for the hurricane `hurricaneId`.
     */
    public seaAir(hurricaneId: number | undefined): SeaAir | undefined {
        const fields = this.fields(hurricaneId);
        if (!fields) return undefined;
        const { previous, current, share } = fields;
        const { columns, rows, cellPx } = current;
        if (this.picture?.version !== this.version) {
            const step = Math.max(previous.step, current.step);
            const pixels = new Uint8ClampedArray(columns * 2 * rows * 4);
            const write = (message: HurricaneAirMessage, offset: number): void => {
                const east = new Int8Array(message.east.buffer, message.east.byteOffset, message.east.byteLength);
                const north = new Int8Array(message.north.buffer, message.north.byteOffset, message.north.byteLength);
                const scale = message.step / step;
                for (let row = 0; row < rows; row++) {
                    for (let column = 0; column < columns; column++) {
                        const at = row * columns + column;
                        const texel = (row * columns * 2 + column + offset) * 4;
                        pixels[texel] = 128 + Math.round(east[at] * scale);
                        pixels[texel + 1] = 128 + Math.round(north[at] * scale);
                        pixels[texel + 2] = 128;
                        // Opaque: a canvas keeps its colours premultiplied.
                        pixels[texel + 3] = 255;
                    }
                }
            };
            write(previous, 0);
            write(current, columns);
            this.picture = { version: this.version, step, pixels };
        }
        const picture = this.picture;
        return { version: picture.version, columns, rows, cellPx, step: picture.step, share, pixels: picture.pixels };
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
