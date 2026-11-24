import type {
    Ball,
    ColdMass,
    Downpour,
    Drain,
    FireConditions,
    FireThresholds,
    Hurricane,
    MapPlace,
    PrecipitationAir,
    RealWeatherSlot,
    Tsunami,
    WAMFileFormat,
    WaterGridBounds,
    WaterSnapshotBuffers,
} from "@workadventure/map-editor";
import type { MeadowMessage, SubToPusherRoomMessage, TreeFireMessage } from "@workadventure/messages";
import type { GroundTimingsBatch } from "./GroundTimings";

/**
 * What the ground of a room reads of its room, as it is sent to the thread that computes it: the same things as
 * RoomGroundInputs, by value. Sent again whenever one of them changed.
 */
export interface GroundRoomState {
    mapSize: { width: number; height: number } | undefined;
    walkers: readonly { x: number; y: number }[];
    downpours: readonly Downpour[];
    drains: readonly Drain[];
    balls: readonly Ball[];
    /** The masses of cold air the players hold; absent while there is none. */
    colds?: readonly ColdMass[];
    /** The hurricane crossing the map; absent while there is none. Its weather is computed from it at each step. */
    hurricane?: Hurricane;
    /** The tsunami coming in; absent while there is none. The sea it holds is computed from it at each step. */
    tsunami?: Tsunami;
    grazers: readonly { x: number; y: number }[];
    air: PrecipitationAir | undefined;
    fire: FireConditions;
    thresholds: FireThresholds;
    /** The real weather at the place of the map, quarter hour by quarter hour, once known. */
    slots: RealWeatherSlot[] | undefined;
    /** The time of the room, where the thread must not read its own clock (a ground driven by hand). */
    now?: number;
}

/** The state of the water the room was last told, unzipped: what a player who joins is sent, zipped then. */
export interface ToldWater {
    x: number;
    y: number;
    width: number;
    height: number;
    seq: number;
    bytes: Uint8Array;
}

/** The fire of the meadow as the animals see it, by value: the tiles whose grass burns and the trees on fire. */
export interface ToldFire {
    width: number;
    height: number;
    burning: Uint8Array;
    trees: { x: number; y: number }[];
}

/** What the thread of the rooms asks of the thread that computes the ground of a room. `room` names the room there. */
export type GroundCommand =
    | {
          kind: "open";
          room: number;
          roomUrl: string;
          wam: WAMFileFormat | undefined;
          state: GroundRoomState;
          /** Driven by hand: no timer, the clock and the luck of the room given (the tests that compare step by step). */
          manual?: { seed: number };
      }
    | { kind: "startWater"; room: number; stored: Record<string, string> }
    | { kind: "startMeadow"; room: number; stored: Record<string, string> }
    | { kind: "state"; room: number; state: GroundRoomState }
    | {
          kind: "wam";
          room: number;
          wam: WAMFileFormat | undefined;
          /**
           * The relief and the pools of the map are the same objects as when the map was last sent: the relief is then
           * left out, and the ground keeps its own. The water and the meadow know an edit of the relief by its
           * object; a copy of the same relief must not look like another one (the water would lose its flows).
           */
          same: { terrain: boolean; pools: boolean };
          state: GroundRoomState;
      }
    | { kind: "strike" | "shatter" | "ignite"; room: number; x: number; y: number; radiusTiles: number }
    | { kind: "burn"; room: number; x: number; y: number; radiusTiles: number; id: number }
    | { kind: "soak"; room: number; downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap"> }
    | { kind: "ballAt"; room: number; id: number; x: number; y: number }
    | { kind: "calm"; room: number }
    | { kind: "history"; room: number; request: number; slots: RealWeatherSlot[] | undefined }
    | { kind: "step"; room: number; reply: number; water: number; meadow: number; state: GroundRoomState }
    | { kind: "close"; room: number };

/** What the thread that computes the ground of a room tells the thread of the rooms. */
export type GroundTold =
    | { kind: "told"; room: number; message: SubToPusherRoomMessage; water?: ToldWater }
    | { kind: "grid"; room: number; grid: { bounds: WaterGridBounds; buffers: WaterSnapshotBuffers } | undefined }
    | {
          kind: "meadow";
          room: number;
          snapshot: MeadowMessage | undefined;
          trees: TreeFireMessage | undefined;
          fire: ToldFire | undefined;
          /** The ice of each tile (mm) once the meadow is made, and whether it still lives the time the room missed. */
          ice: { width: number; height: number; mm?: Float32Array } | undefined;
          catchingUp: boolean;
      }
    | { kind: "save"; room: number; key: string; field: string; value: string }
    | { kind: "history"; room: number; request: number; place: MapPlace | undefined; since: number }
    | { kind: "started"; room: number; part: "water" | "meadow" }
    | { kind: "stepped"; room: number; reply: number }
    | { kind: "closed"; room: number }
    | { kind: "error"; room: number; message: string }
    /** A thread of the bands of the water of this thread was left out (no room: said to who started the thread). */
    | { kind: "band"; room: 0; reason: string; remaining: number }
    /**
     * How the passes of the waters of this thread were shared since it started, told each time a room closes: the
     * slices of rows it computed itself, and those the threads of its bands computed.
     */
    | { kind: "slices"; room: 0; here: number; others: number }
    /** How long the steps of this thread took since it last told (no room: for the metrics of the server). */
    | { kind: "timings"; room: 0; batch: GroundTimingsBatch };

/** Where the commands of a room go and where what it is told comes from: a thread, or the same thread in a test. */
export interface GroundPort {
    post(command: GroundCommand): void;
    /** What the ground of `room` tells, and what happens when the thread that computes it is lost. */
    listen(room: number, told: (told: GroundTold) => void, lost: () => void): void;
    forget(room: number): void;
}

/** A luck that gives the same numbers from the same seed: the luck of a ground driven by hand. */
export function luckOf(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}
