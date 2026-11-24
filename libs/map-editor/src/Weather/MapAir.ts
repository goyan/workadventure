import type { HurricaneAirMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import type { Hurricane } from "../Catastrophe/Hurricane";
import { blendedWind, hurricaneHere } from "../Catastrophe/Hurricane";
import { AIR_CELL_PX, AIR_ROUGHNESS_M, AIR_STEP_S, AIR_SURFACE_RATIO, AirSimulation } from "./AirSimulation";

/** The wind of the air is told to the room twice a second: every fifth step of the water (ten a second). */
export const MAP_AIR_STEPS_PER_MESSAGE = 5;
/** A step of the air is a step of the water: 0.1 s, ten a second. */
export const MAP_AIR_STEP_MS = AIR_STEP_S * 1000;
/**
 * The most steps of its air a hurricane the widget speeds up lives in a step of the room: 5, where the widget goes
 * up to 10. Measured on a Mac at ×10: 2.9 ms a step with 10 (some 17 ms on the server, six times slower, in the
 * thread of the water), 1.5 ms with 5; the same strongest wind and radius, the eye of the air 0.16 radius behind that
 * of the formula after 5 s instead of 0.12. A step of 0.2 s every other step, as cheap, moved the strongest wind in
 * from 0.90 to 0.65 radius: not kept.
 */
export const MAP_AIR_MOST_TIMES = 5;

/**
 * A cell of the air drags as a forest where a quarter of its tiles hold a tree (a choice: 4 of the 16 tiles of a cell
 * of 4 × 4 tiles), as the sea where half of its cells of the relief hold water deep enough for a fish, as land
 * elsewhere.
 */
export const MAP_AIR_FOREST_SHARE = 0.25;
export const MAP_AIR_SEA_SHARE = 0.5;

/** The wind of the room as its conditions say it: at 10 m, km/h, and where it comes from (degrees, 0: north). */
export interface RoomWind {
    windSpeed: number;
    windFrom: number;
}

/** What the air of a map reads of its room and of its ground, asked at each of its steps. */
export interface MapAirSetup {
    room: { sendSubMessageToRoom(subMessage: SubToPusherRoomMessage): void };
    /** The hurricane crossing the map: the air lives while there is one. */
    hurricane(): Hurricane | undefined;
    /** The time of the room, ms since the epoch. */
    now(): number;
    /** The wind of the room outside the hurricane (its conditions): the large scale wind the hurricane blows in. */
    roomWind(): RoomWind;
    /** The size of the map in pixels, once read. */
    mapSize(): { width: number; height: number } | undefined;
    /**
     * The surface of the map as it is when a hurricane starts (asked once for it): its roughness length (m) at a point
     * (pixels), or the sea.
     */
    surface(): (x: number, y: number) => number | "sea";
    /** The most steps of its air a sped up hurricane lives in a step: MAP_AIR_MOST_TIMES by default. */
    mostTimes?: number;
}

/** The wind of the room in the slab (m/s, towards the east and the north): that at 10 m over AIR_SURFACE_RATIO. */
export function slabWindOf(wind: RoomWind): { east: number; north: number } {
    const speed = wind.windSpeed / 3.6 / AIR_SURFACE_RATIO;
    const from = (wind.windFrom * Math.PI) / 180;
    // It blows towards the opposite of where it comes from.
    return { east: -speed * Math.sin(from), north: -speed * Math.cos(from) };
}

/**
 * The wind of a hurricane as it is sent: the wind at 10 m at the points of a grid over the map, a signed byte a
 * component. The whole field each time (it changes everywhere as the eye moves).
 */
export function hurricaneAirMessageOf(
    air: Pick<AirSimulation, "surfaceWindAt">,
    size: { width: number; height: number },
    hurricaneId: number,
    seq: number,
    epoch: number,
): HurricaneAirMessage {
    const columns = Math.floor(size.width / AIR_CELL_PX) + 1;
    const rows = Math.floor(size.height / AIR_CELL_PX) + 1;
    const east = new Float32Array(columns * rows);
    const north = new Float32Array(columns * rows);
    let strongest = 0;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const wind = air.surfaceWindAt(column * AIR_CELL_PX, row * AIR_CELL_PX);
            const at = row * columns + column;
            east[at] = wind.east;
            north[at] = wind.north;
            strongest = Math.max(strongest, Math.abs(wind.east), Math.abs(wind.north));
        }
    }
    // The finest step that holds the strongest component; never 0 (a calm field is 0 everywhere at any step).
    const step = Math.max(strongest / 127, 0.01);
    const quantised = (field: Float32Array): Uint8Array => {
        const bytes = new Int8Array(field.length);
        for (let at = 0; at < field.length; at++)
            bytes[at] = Math.max(-127, Math.min(127, Math.round(field[at] / step)));
        return new Uint8Array(bytes.buffer);
    };
    return {
        hurricaneId,
        seq,
        cellPx: AIR_CELL_PX,
        columns,
        rows,
        step,
        east: quantised(east),
        north: quantised(north),
        epoch,
    };
}

/** The wind a browser reads of a message (m/s at 10 m, towards the east and the north), bilinear between its points. */
export function hurricaneAirWindAt(
    message: HurricaneAirMessage,
    x: number,
    y: number,
): { east: number; north: number } {
    const { columns, rows, cellPx, step } = message;
    const east = new Int8Array(message.east.buffer, message.east.byteOffset, message.east.byteLength);
    const north = new Int8Array(message.north.buffer, message.north.byteOffset, message.north.byteLength);
    const gx = Math.max(0, Math.min(columns - 1, x / cellPx));
    const gy = Math.max(0, Math.min(rows - 1, y / cellPx));
    const x0 = Math.min(columns - 2, Math.floor(gx));
    const y0 = Math.min(rows - 2, Math.floor(gy));
    const fx = gx - x0;
    const fy = gy - y0;
    const at = (field: Int8Array): number => {
        const a = y0 * columns + x0;
        const top = field[a] * (1 - fx) + field[a + 1] * fx;
        const bottom = field[a + columns] * (1 - fx) + field[a + columns + 1] * fx;
        return (top * (1 - fy) + bottom * fy) * step;
    };
    return { east: at(east), north: at(north) };
}

/**
 * The air of a map while a hurricane crosses it: an AirSimulation made when the hurricane starts (its surface read
 * from the map then), stepped with the water, its wind at 10 m told to the room twice a second, dropped when the
 * hurricane ends. Outside a hurricane nothing is computed and nothing is sent: the browsers have the wind of the
 * formula. Should the air fail, it is dropped for that hurricane and the browsers go on with the formula.
 */
export class MapAir {
    private air: AirSimulation | undefined;
    /** The hurricane the air is that of, and whether its air failed. */
    private forId: number | undefined;
    private failedFor: number | undefined;
    private steps = 0;
    private seq = 0;
    private last: HurricaneAirMessage | undefined;

    constructor(private readonly setup: MapAirSetup) {}

    /**
     * One step of the water (100 ms of the room). A hurricane the widget speeds up lives `times` steps of its air in
     * it (MAP_AIR_MOST_TIMES at most): its eye goes `times` as fast, and its air must turn as fast to keep up with it.
     */
    public step(): void {
        const hurricane = this.setup.hurricane();
        if (!hurricane) {
            this.drop();
            return;
        }
        if (this.failedFor === hurricane.id) return;
        try {
            this.live(hurricane);
        } catch (error) {
            console.error("The air of the hurricane stopped on an error: the formula of its wind takes over", error);
            this.failedFor = hurricane.id;
            this.drop();
        }
    }

    /** The last wind told to the room, for a player who joins; undefined outside a hurricane. */
    public snapshot(): HurricaneAirMessage | undefined {
        return this.last;
    }

    /** The wind at 10 m at a point of the map (m/s), while the air lives; undefined otherwise (take the formula). */
    public windAt(x: number, y: number): { east: number; north: number } | undefined {
        return this.air?.surfaceWindAt(x, y);
    }

    private live(hurricane: Hurricane): void {
        const now = this.setup.now();
        const roomWind = this.setup.roomWind();
        const room = slabWindOf(roomWind);
        if (!this.air || this.forId !== hurricane.id) {
            const size = this.setup.mapSize();
            if (!size) return;
            const air = new AirSimulation({ ...size, roughness: this.setup.surface() });
            // From the formula of the wind (at 10 m) brought to the slab, mixed into the room's as the storm is grown
            // (its share), the room's wind where it does not blow.
            air.fill((x, y) => {
                const here = hurricaneHere(hurricane, now, x, y);
                if (!here) return room;
                const wind = blendedWind(roomWind, here, here.share);
                const speed = wind.windSpeed / 3.6 / AIR_SURFACE_RATIO;
                const to = ((wind.windFrom + 180) * Math.PI) / 180;
                return { east: speed * Math.sin(to), north: speed * Math.cos(to) };
            });
            this.air = air;
            this.forId = hurricane.id;
            this.steps = 0;
        }
        const air = this.air;
        const most = this.setup.mostTimes ?? MAP_AIR_MOST_TIMES;
        const times = Math.max(1, Math.min(most, Math.round(hurricane.times ?? 1)));
        for (let sub = 1; sub <= times; sub++) {
            const epoch = now - MAP_AIR_STEP_MS + (sub * MAP_AIR_STEP_MS) / times;
            air.step({ hurricane, epoch, room }, AIR_STEP_S);
        }
        if (this.steps++ % MAP_AIR_STEPS_PER_MESSAGE !== 0) return;
        const size = this.setup.mapSize();
        if (!size) return;
        this.last = hurricaneAirMessageOf(air, size, hurricane.id, this.seq++, now);
        this.setup.room.sendSubMessageToRoom({
            message: { $case: "hurricaneAirMessage", hurricaneAirMessage: this.last },
        });
    }

    private drop(): void {
        this.air = undefined;
        this.forId = undefined;
        this.last = undefined;
    }
}

/**
 * The surface of a map under the air, from its water and its trees: the roughness of each point (pixels), counted over
 * the cell of the air around it. Past the edges of the map, that of its nearest edge.
 */
export function mapSurfaceOf(
    size: { width: number; height: number },
    depthAt: (cellX: number, cellY: number) => number,
    trees: readonly { x: number; y: number }[],
    seaDepthPx: number,
    reliefCellPx: number,
    tilePx: number,
): (x: number, y: number) => number | "sea" {
    const treesByTile = new Set(trees.map((tree) => `${Math.floor(tree.x / tilePx)},${Math.floor(tree.y / tilePx)}`));
    const half = AIR_CELL_PX / 2;
    return (atX, atY) => {
        const x = Math.max(half, Math.min(size.width - half, atX));
        const y = Math.max(half, Math.min(size.height - half, atY));
        let tiles = 0;
        let wooded = 0;
        for (let ty = Math.floor((y - half) / tilePx); ty < Math.floor((y + half) / tilePx); ty++) {
            for (let tx = Math.floor((x - half) / tilePx); tx < Math.floor((x + half) / tilePx); tx++) {
                tiles++;
                if (treesByTile.has(`${tx},${ty}`)) wooded++;
            }
        }
        if (tiles > 0 && wooded / tiles >= MAP_AIR_FOREST_SHARE) return AIR_ROUGHNESS_M.forest;
        let cells = 0;
        let wet = 0;
        for (let cy = Math.floor((y - half) / reliefCellPx); cy < Math.floor((y + half) / reliefCellPx); cy++) {
            for (let cx = Math.floor((x - half) / reliefCellPx); cx < Math.floor((x + half) / reliefCellPx); cx++) {
                cells++;
                if (depthAt(cx, cy) >= seaDepthPx) wet++;
            }
        }
        return cells > 0 && wet / cells >= MAP_AIR_SEA_SHARE ? "sea" : AIR_ROUGHNESS_M.land;
    };
}
