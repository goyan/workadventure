import type {
    Ball,
    Downpour,
    Drain,
    FireConditions,
    FireThresholds,
    LifeFire,
    PrecipitationAir,
    WaterGrid,
} from "@workadventure/map-editor";
import type { MeadowMessage, TerrainWaterMessage, TreeFireMessage } from "@workadventure/messages";
import type { VariablesRepositoryInterface } from "../../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "../GameRoom";
import type { RainTimelineService } from "../Services/RainTimelineService";

/**
 * What the ground of a room (the water of its relief and its meadow) reads of the room, asked each time it is needed:
 * the room, its weather, its avatars, its catastrophes and its animals.
 */
export interface RoomGroundInputs {
    room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">;
    rain: Pick<RainTimelineService, "slotsFor" | "history">;
    /** Where the ground is saved, so it survives a restart. Nothing is saved without it. */
    store?: { repository: VariablesRepositoryInterface; roomUrl: string };
    /** The size of the map in cells of the relief, once read. */
    mapSize(): { width: number; height: number } | undefined;
    /** Where the avatars standing on the ground are (map pixels): they hold the doors open. */
    walkers(): readonly { x: number; y: number }[];
    downpours(): readonly Downpour[];
    drains(): readonly Drain[];
    balls(): readonly Ball[];
    /** Where the animals that graze are (map pixels). */
    grazers(): readonly { x: number; y: number }[];
    /** The air the precipitation of the room falls through; undefined while it is not known. */
    air(): PrecipitationAir | undefined;
    /** The heat, the humidity and the wind the fire of the room goes by, and what makes them dangerous. */
    fire(): FireConditions;
    thresholds(): FireThresholds;
    /** The time of the room (ms since the epoch), a clock to time the steps (ms) and the luck of the fire: the tests set them. */
    now?: () => number;
    clock?: () => number;
    random?: () => number;
}

/**
 * The ground of a room as the room uses it: the water of its relief and its meadow behind one door, so that they can
 * be computed on the thread of the rooms or on another without the room knowing which.
 */
export interface RoomGround {
    /** Brings back the water saved before a restart, and starts it. */
    startWater(): Promise<void>;
    /** Brings back the meadow saved before a restart, and starts it. */
    startMeadow(): Promise<void>;
    stop(): void;
    /** The map of the room changed (or was just read): the water first, the meadow reads it. */
    mapChanged(): void;

    /** A comet lands at a point of the map (pixels): it takes the water of its crater, and breaks the ice on it. */
    strike(x: number, y: number, radiusTiles: number): void;
    /** A fireball lands: it boils the water of its crater away first, then burns the ground it left dry. */
    burn(x: number, y: number, radiusTiles: number, id: number): void;
    /** The ice breaks around a point of the map (under a player, as under a comet). */
    shatter(x: number, y: number, radiusTiles: number): void;
    /** A downpour soaks the ground of the meadow. */
    soak(downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap">): void;
    /** A patch of fire a player sets burns the grass of the meadow. */
    ignite(x: number, y: number, radiusTiles: number): void;

    /** The altitude the water holds a ball at (see WaterSimulation.ballLevelAt). */
    ballLevelAt(id: number, x: number, y: number): number;
    /** The grid of the water, for what lives in it. Undefined on a map without water. */
    getGrid(): WaterGrid | undefined;
    /** A number that changes whenever the water does. */
    waterVersion(): number;
    /** The fire of the meadow and of its trees, for the animals that run from it. */
    lifeFire(): LifeFire | undefined;

    /** The whole states sent to a user who joins the room. */
    waterSnapshot(): TerrainWaterMessage | undefined;
    meadowSnapshot(): MeadowMessage | undefined;
    treeSnapshot(): TreeFireMessage | undefined;
}
