import type {
    Ball,
    ColdMass,
    Downpour,
    Drain,
    FireConditions,
    FireThresholds,
    Hurricane,
    LifeFire,
    Tsunami,
    PrecipitationAir,
    WaterView,
    ZombieHorde,
} from "@workadventure/map-editor";
import type { HurricaneAirMessage, MeadowMessage, TerrainWaterMessage, TreeFireMessage } from "@workadventure/messages";
import type { VariablesRepositoryInterface } from "../../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "../GameRoom";
import type { RainTimelineService } from "../Services/RainTimelineService";
import type { ToldFire } from "./GroundProtocol";

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
    /** The masses of cold air the players hold (the cold snap of the catastrophes). None when absent. */
    colds?(): readonly ColdMass[];
    /** The hurricane crossing the map: its wind, its air and its rain take the place of those of the room. */
    hurricane?(): Hurricane | undefined;
    /** The tsunami coming in by the east edge of the map: the sea it holds at the coast. */
    tsunami?(): Tsunami | undefined;
    /** The horde of zombies crossing the map: it tramples the meadow and pulls its trees down where it walks. */
    zombies?(): ZombieHorde | undefined;
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
    /** The cold air lying on the map is dispelled (a player stops the cold snap): what it froze stays, and thaws. */
    calm(): void;
    /** A downpour soaks the ground of the meadow. */
    soak(downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap">): void;
    /** A patch of fire a player sets burns the grass of the meadow. */
    ignite(x: number, y: number, radiusTiles: number): void;

    /** The altitude the water holds a ball at (see WaterSimulation.ballLevelAt). */
    ballLevelAt(id: number, x: number, y: number): number;
    /**
     * The water as what lives in it reads it (the life of the room, its ice huts): its grid where it is computed on
     * this thread, a copy of it otherwise. Undefined on a map without water.
     */
    getGrid(): WaterView | undefined;
    /** A number that changes whenever the water does. */
    waterVersion(): number;
    /** The fire of the meadow and of its trees, for the animals that run from it. */
    lifeFire(): LifeFire | undefined;
    /** The same fire as tiles of the meadow on fire and trees on fire (a horde of zombies burns in it). */
    fireTiles(): ToldFire | undefined;
    /** The ice over the water of a tile (32 px), in mm: none before the meadow is made (the ice fishing shacks). */
    iceAt(tileX: number, tileY: number): number;
    /** Whether the meadow is made (the size of the map read): before, its ice is not known, not none. */
    hasMeadow(): boolean;
    /** Whether the meadow is still living the time the room missed. */
    catchingUp(): boolean;

    /** The whole states sent to a user who joins the room. */
    waterSnapshot(): TerrainWaterMessage | undefined;
    meadowSnapshot(): MeadowMessage | undefined;
    treeSnapshot(): TreeFireMessage | undefined;
    /** The wind of the air of the hurricane crossing the map, last told; undefined outside a hurricane. */
    airSnapshot(): HurricaneAirMessage | undefined;
}
