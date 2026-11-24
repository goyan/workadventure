import { Season, TERRAIN_CELL, TILE_PX } from "../types";
import type { PoolStyle, TerrainData, WAMFileFormat } from "../types";
import { coldShare } from "../Catastrophe/Cold";
import type { ColdMass } from "../Catastrophe/Cold";
import { soilFrost } from "../Weather/SoilFrost";
import {
    rainMeltMm,
    SNOW_FULL_MM,
    SNOW_MAX_MM,
    snowByte,
    snowMeltMmPerHour,
    snowMmOfByte,
    snowSublimationMmPerHour,
} from "./Snow";
import type { SnowWeather } from "./Snow";
import {
    ICE_EXACT_FROM_HOURS,
    ICE_GROWTH_TIMES,
    ICE_MAX_MM,
    ICE_SLIPS_MM,
    iceByte,
    iceAfterHours,
    iceCurrentShare,
    iceGrowthMmPerDay,
    iceMmOfByte,
    iceThawMmPerHour,
} from "./Ice";
import { poolStyleAt, poolStyleOf } from "./Pools";
import { PX_PER_MM } from "./WaterInputs";
import { snowCover } from "./SnowLine";
import { soilName } from "./Soils";
import type { SoilName } from "./Soils";
import { cellOf, heightAt, soilAt } from "./TerrainGrid";
import type { WaterWallSides } from "./WaterGrid";

/** Cells of the relief along the side of a tile: the meadow is kept by tile. */
const CELLS_A_TILE = TILE_PX / TERRAIN_CELL;
/** The meadow is stepped this often, in seconds. */
export const MEADOW_STEP_SECONDS = 2;

/** Water lying on a tile from which its soil is soaked, and from which its grass drowns, in pixels. */
export const SOAKED_WATER_PX = 0.5;
export const DROWNING_WATER_PX = 2;
/** The moisture grass grows between: drier it waits, wetter the soil is sodden. */
export const GROWING_MOISTURE: readonly [number, number] = [0.25, 0.9];
/** Under this moisture the grass dies of thirst. */
export const DRY_MOISTURE = 0.08;
/** Seconds of good conditions for bare ground to become a full meadow, and for grass to die of thirst or drown. */
export const GROW_SECONDS = 600;
export const THIRST_SECONDS = 1200;
export const DROWN_SECONDS = 60;
/**
 * A burnt tile is green again in this many seconds at most, whatever the hour, the season, the moisture and the
 * altitude: a game, not a forest. Its ash stays whole for a while (the embers die), then goes, and the grass comes
 * back with it wherever grass may grow. A map whose grass grows faster than that comes back as fast as it grows.
 */
export const AFTER_FIRE_SECONDS = 300;
/** The share of that time the ash of a tile that just went out stays whole. */
const SMOULDER_SHARE = 0.15;
/** At the highest danger, without rain, a soil loses its moisture this many times faster: the hot wind dries it out. */
const PARCHING = 20;
/** A tile on fire burns its full grass in this many seconds, and its fire is at its height after FIRE_RISE_SECONDS. */
export const BURN_SECONDS = 30;
const FIRE_RISE_SECONDS = 5;
/** The fire a tile starts with, and from where it sets its neighbours on fire. */
const FIRE_START = 0.2;
const FIRE_SPREADS_FROM = 0.5;
/**
 * The chance a burning tile sets a straw-dry neighbour on fire at each step, without wind: a tile burns several steps,
 * so a dry land is swept. Whatever the neighbour has to burn, as long as it has something.
 */
const FIRE_SPREAD_CHANCE = 0.35;
/** Green grass still takes this share of that chance; a neighbour in a corner this share of a neighbour on a side. */
const GREEN_SPREAD_SHARE = 0.05;
const CORNER_SPREAD_SHARE = 0.7;
/** The wind that doubles the chance downwind (km/h), and how far it may push or hold the fire. */
const FIRE_WIND_KMH = 30;
const FIRE_WIND_BOUNDS: readonly [number, number] = [0.1, 3];
/** The wind that halves the spread of the flanks of a fire (km/h), and how much more it holds its back. */
const FLANK_WIND_KMH = 10;
const BACK_HOLD = 0.8;
/**
 * What a tile has to burn, from 0 to 1: its grass, and on a ground gone dry the dead litter of a dry land (none
 * under the first dryness, DRY_GROUND_FUEL from the second on), whatever its grass. A full meadow burns BURN_SECONDS, a tile with less in proportion.
 */
const DRY_GROUND_BURNS: readonly [number, number] = [0.15, 0.5];
const DRY_GROUND_FUEL = 0.8;
/**
 * Under the wind the head of a grass fire runs at about 16 % of the wind speed, 20 km/h at most (Cheney et al. 1998,
 * Cruz et al. 2022), carried by embers landing ahead of the flames. A tile is about 1.1 m and a step 2 s: that is
 * this many tiles downwind at each step for each km/h of wind, HEAD_MAX_TILES at most. Embers go over what would
 * stop the flames.
 */
const HEAD_TILES_PER_KMH = 0.08;
const HEAD_MAX_TILES = 10;
/** What does not burn: too little to burn, a soil this wet, this much ash. */
const FIRE_MIN_FUEL = 0.05;
const FIRE_MAX_MOISTURE = 0.9;
const FIRE_MAX_ASH = 0.5;
/** A rain of this many mm an hour puts a fire at its height out in a second. */
const RAIN_QUENCH_MM = 100;
/** The snow (mm of water) a fire at its height melts a second, on its tile and on the eight around it. */
export const FIRE_THAW_MM_PER_SECOND = 15;
/** A fire starts by itself, at the highest danger, about once in this many seconds, on grass this dry. */
const SELF_START_SECONDS = 60;
const SELF_START_DRYNESS = 0.9;
const SELF_START_TRIES = 20;

/** The grass dries, or greens again, most of the way towards what the conditions make it in this many seconds. */
export const DRYING_SECONDS = 30;
/** An animal that grazes eats a full tile of grass in this many seconds. */
export const GRAZE_SECONDS = 120;
/** From this much grass under it, an animal that stands still is seen grazing. */
export const GRAZING_COVER = 0.15;
/** Moisture a soil gains a second under a rain of 1 mm an hour. */
export const RAIN_GAIN = 0.0005;
/** Share of the difference of moisture with its four neighbours a tile takes a step, and of its moisture that runs to a lower one. */
export const MOISTURE_SPREAD = 0.12;
export const MOISTURE_RUNOFF = 0.08;
/**
 * The soil next to open water drinks from it from below (the water table, capillary rise): a tile at 1, 2 and 3
 * tiles from water lying on the ground keeps at least this much moisture, whatever the air takes from its top.
 */
export const BANK_MOISTURE: readonly number[] = [0.8, 0.5, 0.17];
/** No grass grows this high over the ground of the map, in pixels of altitude; it grows slower on the way up. */
export const GRASS_LINE_PX = 192;

/**
 * How a soil holds the moisture and grows grass; how many tiles from open water its capillary fringe reaches
 * (BANK_MOISTURE): metres in a loam or a clay, a few decimetres in a sand or a gravel, so the tile at the water only;
 * and how much of the usual moisture it draws sideways from a wetter neighbour (MOISTURE_SPREAD), weak in their wide
 * pores for the same reason. A cell not painted is earth.
 */
const SOIL_LIFE: Record<SoilName, { holdSeconds: number; fertility: number; fringeTiles: number; wicking: number }> = {
    earth: { holdSeconds: 600, fertility: 1, fringeTiles: 3, wicking: 1 },
    meadow: { holdSeconds: 900, fertility: 1.5, fringeTiles: 3, wicking: 1 },
    clay: { holdSeconds: 1800, fertility: 0.5, fringeTiles: 3, wicking: 1 },
    sand: { holdSeconds: 120, fertility: 0, fringeTiles: 1, wicking: 0.15 },
    rock: { holdSeconds: 0, fertility: 0, fringeTiles: 0, wicking: 0 },
    gravel: { holdSeconds: 60, fertility: 0, fringeTiles: 1, wicking: 0.15 },
};

/** How fast grass grows in a season, as a share of its fastest: not at all in winter. */
export function seasonGrowth(season: Season): number {
    if (season === Season.Winter) return 0;
    return season === Season.Autumn ? 0.4 : 1;
}

/** How fast grass grows at an altitude, as a share of its fastest: all of it down to the ground, nothing at the grass line. */
export function altitudeGrowth(heightPx: number): number {
    return Math.min(1, Math.max(0, 1 - Math.max(0, heightPx) / GRASS_LINE_PX));
}

/**
 * How much the wind helps a fire towards a neighbour: `along` is how much the way to that neighbour follows the wind
 * (1 straight downwind, -1 straight against it), `speed` the wind in km/h. 1 without wind, all around: a fire has no
 * back then. The wind holds the flanks and the back as much as it drives the head.
 */
export function fireWindPush(along: number, speed: number): number {
    const calm = 1 / (1 + speed / FLANK_WIND_KMH);
    const head = Math.min(FIRE_WIND_BOUNDS[1], 1 + speed / FIRE_WIND_KMH);
    return along >= 0
        ? // Straight downwind far more than aslant: the head is narrow.
          calm + (head - calm) * along ** 3
        : calm * (1 + BACK_HOLD * (1 - calm) * along);
}

/** What one step of the meadow reads of the world around it. */
export interface MeadowStepInput {
    seconds: number;
    rainMmPerHour: number;
    daylight: boolean;
    season: Season;
    /** The water lying on a tile, in pixels: the deepest of its cells. */
    waterAt: (tileX: number, tileY: number) => number;
    /**
     * How fast the water runs over a tile, in metres a second (WaterGrid.tileSpeedAt): the ice takes less on running
     * water (iceCurrentShare). Still water when absent: a water without inertia keeps no speed.
     */
    currentAt?: (tileX: number, tileY: number) => number;
    /** What the map sets of its meadow; the usual paces when absent. */
    growSeconds?: number;
    thirstSeconds?: number;
    /** How many times longer than usual the soils hold their moisture. */
    moistureHold?: number;
    /** How ready the grass is to burn under the conditions of the room, from 0 to 1 (see fireDanger); 0 when absent. */
    fireDanger?: number;
    /** Where the wind comes from (degrees, 0 north, 90 east) and its speed (km/h): it pushes the fire. */
    windFrom?: number;
    windSpeed?: number;
    /**
     * The wind at a point of the map (pixels), where it differs from place to place (the air of a hurricane): it then
     * pushes each fire in place of windFrom and windSpeed. Absent: the one wind of the room everywhere.
     */
    windAt?: (x: number, y: number) => { speed: number; from: number } | undefined;
    /** The luck of the fire, from 0 to 1 at each draw: whether it spreads, whether one starts. Math.random when absent. */
    random?: () => number;
    /**
     * How frozen the top of the soil is, from 0 to 1 (see soilFrost): its water is ice, which neither dries, nor
     * spreads, nor runs down; its grass lies dormant, and nothing grows back after a fire. 0 when absent.
     */
    soilFrost?: number;
    /** The air over the snow (temperature, humidity, wind); absent while not known: the snow neither melts nor goes. */
    weather?: SnowWeather;
    /**
     * The masses of cold air lying on the map (the cold snap of the catastrophes): on the tiles they reach, the air
     * is theirs (coldAirAt) for the snow, the ice and the frost of the soil. None when absent: nothing is read.
     */
    cold?: readonly ColdMass[];
    /**
     * How many times faster than the real clock the snow falls, melts and goes, and the ice takes and thaws: the speed
     * of the water of the map (waterTimesOf), so that they never part; real time when absent.
     */
    snowTimes?: number;
    /** The snow that falls on every tile outdoors during this step, in mm of water; none when absent. */
    snowfallMm?: number;
}

/** What one step of the meadow gives back: the water of the snow that melted on each tile, in mm. */
export interface MeadowStepOutput {
    /** By tile, row by row. The same array at every step: read it before the next one. */
    meltedMm: Float32Array;
}

/**
 * The tiles a floor of the "Map" tool covers on the ground (a paved path, a terrace): nothing grows there.
 */
export function pavedTilesOf(wam: Pick<WAMFileFormat, "entities"> | undefined): Set<string> {
    const paved = new Set<string>();
    for (const entity of Object.values(wam?.entities ?? {})) {
        if (entity?.prefabRef?.collectionName !== "Carte Sols" || (entity.elevation ?? 0) > 0) continue;
        paved.add(`${Math.floor(entity.x / TILE_PX)},${Math.floor(entity.y / TILE_PX)}`);
    }
    return paved;
}

/**
 * The moisture of the soil and the grass of a map, tile by tile, kept by the server so that every player sees the
 * same meadow. The soil takes its moisture from the rain and from the water lying on it; the moisture spreads to the
 * neighbouring tiles and runs down the slopes, and each soil loses it at its own pace. Grass grows by itself on a
 * fertile soil that is moist without being under water, by day, in its season, slower with the altitude; it dies of
 * thirst on a dry soil, drowns under water and dies back under the snow of the heights (see SnowLine.ts). Outdoors only: what walls close has no meadow.
 */
export class Meadow {
    public readonly width: number;
    public readonly height: number;
    private readonly moisture: Float32Array;
    private readonly next: Float32Array;
    private readonly grass: Float32Array;
    /** How dry the ground of each tile and its grass are, from 0 (green) to 1 (straw, ready to burn). */
    private readonly dryness: Float32Array;
    /** The fire of each tile, from 0 (none) to 1 (at its height), and the ash a fire left, from 0 to 1. */
    private readonly fire: Float32Array;
    private readonly ash: Float32Array;
    /** The snow lying on each tile, in mm of water (see Snow.ts), and what melted of it at the last step. */
    private readonly snow: Float32Array;
    private readonly melted: Float32Array;
    /** The ice over the water of each tile, in mm (see Ice.ts), and whether any of it changed at the last step. */
    private readonly ice: Float32Array;
    private iceChanged = false;
    /**
     * The air of the tiles a mass of cold air reaches at this step (°C), not a number elsewhere, and those tiles:
     * neither exists on a map where no cold air ever lay.
     */
    private chilled: Float32Array | undefined;
    private chilledTiles: number[] = [];
    /** Whether any tile is chilled at this step: the snow and the ice then read the air tile by tile. */
    private chilling = false;
    /** The air of a chilled tile, written again for each: the humidity and the wind are those of the map. */
    private readonly chilledAir: SnowWeather = { temperature: 0, humidity: 50, windSpeed: 0 };
    /**
     * Whether a pool painted on a tile is heated. The water of a pool is the water of the relief (see poolBasins): it
     * freezes as a lake does, unless it is hot.
     */
    private readonly hotPool: Uint8Array;
    /** 1 on a tile any cell of which is painted as a pool: its water is held in a watertight basin. */
    private readonly poolTile: Uint8Array;
    /** How many tiles from open water the capillary fringe of the soil of each tile reaches (see SOIL_LIFE). */
    private readonly fringe: Uint8Array;
    /** How much each tile draws moisture sideways, against an earth (see SOIL_LIFE). */
    private readonly wicking: Float32Array;
    /** The snow the heat of a fire melts on each tile at the next step, in mm of water (see warm): spent there. */
    private readonly heat: Float32Array;
    /** Seconds the ash of a tile that went out still stays whole before it goes; not saved. */
    private readonly smoulder: Float32Array;
    /** What each tile on fire still has to burn (see fuelOf), from 0 to 1. */
    private readonly fuel: Float32Array;
    /** The water lying on each tile, as the last step read it. */
    private readonly water: Float32Array;
    /** For each tile: how long its soil holds its moisture (0: it holds none), how fertile it is, and its height. */
    private readonly hold: Float32Array;
    private readonly fertility: Float32Array;
    private readonly ground: Float32Array;
    private readonly outdoor: Uint8Array;
    /** For each tile, a step long: 1 on open water, 2 next to it… 0 out of its reach (see drinkFromBanks). */
    private readonly bankReach: Uint8Array;
    private readonly bankQueue: Int32Array;

    constructor(
        size: { width: number; height: number },
        terrain: TerrainData | undefined,
        walls: WaterWallSides | undefined,
        paved?: ReadonlySet<string>,
        /** The styles of the pools of the map (their hot water); the default one for each when absent. */
        pools?: readonly PoolStyle[],
    ) {
        this.width = Math.max(0, Math.floor(size.width));
        this.height = Math.max(0, Math.floor(size.height));
        const tiles = this.width * this.height;
        this.moisture = new Float32Array(tiles);
        this.next = new Float32Array(tiles);
        this.grass = new Float32Array(tiles);
        this.dryness = new Float32Array(tiles);
        this.fire = new Float32Array(tiles);
        this.ash = new Float32Array(tiles);
        this.snow = new Float32Array(tiles);
        this.melted = new Float32Array(tiles);
        this.heat = new Float32Array(tiles);
        this.ice = new Float32Array(tiles);
        this.hotPool = new Uint8Array(tiles);
        this.poolTile = new Uint8Array(tiles);
        this.fringe = new Uint8Array(tiles);
        this.wicking = new Float32Array(tiles);
        this.smoulder = new Float32Array(tiles);
        this.fuel = new Float32Array(tiles);
        this.water = new Float32Array(tiles);
        this.hold = new Float32Array(tiles);
        this.fertility = new Float32Array(tiles);
        this.ground = new Float32Array(tiles);
        this.outdoor = outdoorTiles(this.width, this.height, walls);
        this.bankReach = new Uint8Array(tiles);
        this.bankQueue = new Int32Array(tiles);
        for (let tileY = 0; tileY < this.height; tileY++) {
            for (let tileX = 0; tileX < this.width; tileX++) {
                const index = tileY * this.width + tileX;
                const cellX = tileX * CELLS_A_TILE;
                const cellY = tileY * CELLS_A_TILE;
                let height = 0;
                for (let y = 0; y < CELLS_A_TILE; y++) {
                    for (let x = 0; x < CELLS_A_TILE; x++) {
                        height += heightAt(terrain, cellX + x, cellY + y);
                        // A tile any cell of which is painted as a heated pool never freezes.
                        const style = poolStyleOf(soilAt(terrain, cellX + x, cellY + y));
                        if (style !== undefined) this.poolTile[index] = 1;
                        if (style !== undefined && poolStyleAt(pools, style).hot) this.hotPool[index] = 1;
                    }
                }
                this.ground[index] = height / (CELLS_A_TILE * CELLS_A_TILE);
                const soil = SOIL_LIFE[soilName(soilAt(terrain, cellX, cellY)) ?? "earth"];
                // A pool's basin is watertight: no moisture of a soil there, none spread to the ground around it.
                this.hold[index] = this.poolTile[index] ? 0 : soil.holdSeconds;
                this.fringe[index] = soil.fringeTiles;
                this.wicking[index] = soil.wicking;
                const grows = this.outdoor[index] === 1 && !paved?.has(`${tileX},${tileY}`);
                this.fertility[index] = grows ? soil.fertility : 0;
            }
        }
    }

    private indexOf(tileX: number, tileY: number): number | undefined {
        if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return undefined;
        return tileY * this.width + tileX;
    }

    /** The moisture of the soil of a tile, from 0 (dry) to 1 (sodden). */
    public moistureAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.moisture[index];
    }

    /** How much grass covers a tile, from 0 (bare) to 1 (a full meadow). */
    public grassAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.grass[index];
    }

    /** How dry the grass of a tile is, from 0 (green) to 1 (straw, ready to burn). */
    public drynessAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.dryness[index];
    }

    /** The fire of a tile, from 0 (none) to 1 (at its height). */
    public fireAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.fire[index];
    }

    /** The ash a fire left on a tile, from 0 to 1: it goes as the grass grows back. */
    public ashAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.ash[index];
    }

    /** The snow lying on a tile, in mm of water. */
    public snowAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.snow[index];
    }

    /** The ice over the water of a tile, in mm. */
    public iceAt(tileX: number, tileY: number): number {
        const index = this.indexOf(tileX, tileY);
        return index === undefined ? 0 : this.ice[index];
    }

    /** Whether any water of the meadow is frozen. */
    public icy(): boolean {
        for (let index = 0; index < this.ice.length; index++) if (this.ice[index] > 0) return true;
        return false;
    }

    /** Whether any ice thickened, thawed or went at the last step: the room is to be told. */
    public iceMoved(): boolean {
        return this.iceChanged;
    }

    /**
     * The ice of the tiles within `radius` tiles of a tile is broken at once (the impact of a comet): the water is
     * open again. Returns how much ice went, in mm over all the tiles.
     */
    public breakIce(tileX: number, tileY: number, radius: number): number {
        let broken = 0;
        this.forTilesAround(tileX, tileY, radius, (index) => {
            broken += this.ice[index];
            this.ice[index] = 0;
        });
        if (broken > 0) this.iceChanged = true;
        return broken;
    }

    /** Whether any snow lies on the meadow. */
    public snowy(): boolean {
        for (let index = 0; index < this.snow.length; index++) if (this.snow[index] > 0) return true;
        return false;
    }

    /** The tiles within `radius` tiles of a tile (every tile when `radius` is undefined), outdoors only. */
    private forTilesAround(
        tileX: number,
        tileY: number,
        radius: number | undefined,
        visit: (index: number) => void,
    ): void {
        const { width, height, outdoor } = this;
        if (radius !== undefined && !(Number.isFinite(tileX) && Number.isFinite(tileY) && Number.isFinite(radius))) {
            return;
        }
        const reach = radius === undefined ? 0 : Math.max(0, radius);
        const fromY = radius === undefined ? 0 : Math.max(0, Math.floor(tileY - reach));
        const toY = radius === undefined ? height - 1 : Math.min(height - 1, Math.ceil(tileY + reach));
        const fromX = radius === undefined ? 0 : Math.max(0, Math.floor(tileX - reach));
        const toX = radius === undefined ? width - 1 : Math.min(width - 1, Math.ceil(tileX + reach));
        for (let y = fromY; y <= toY; y++) {
            for (let x = fromX; x <= toX; x++) {
                if (radius !== undefined && (x - tileX) ** 2 + (y - tileY) ** 2 > reach * reach) continue;
                const index = y * width + x;
                if (outdoor[index]) visit(index);
            }
        }
    }

    /**
     * Snow falls on the tiles within `radius` tiles of a tile (on every tile when `radius` is undefined): `mm` of
     * water on each, outdoors only, no higher than SNOW_MAX_MM. Returns how much was laid, in mm over all the tiles.
     */
    public snowOn(tileX: number, tileY: number, radius: number | undefined, mm: number): number {
        if (!Number.isFinite(mm) || mm <= 0) return 0;
        let laid = 0;
        this.forTilesAround(tileX, tileY, radius, (index) => {
            const more = Math.min(mm, SNOW_MAX_MM - this.snow[index]);
            if (more <= 0) return;
            this.snow[index] += more;
            laid += more;
        });
        return laid;
    }

    /**
     * The heat of a fire is brought to the tiles within `radius` tiles of a tile: at the next step it melts up to
     * `mm` of the snow of each (mm of water), then of the ice under it, whatever the cold of the air, and leaves the
     * soil it dries as it was.
     */
    public warm(tileX: number, tileY: number, radius: number, mm: number): void {
        if (!Number.isFinite(mm) || mm <= 0) return;
        this.forTilesAround(tileX, tileY, radius, (index) => {
            this.heat[index] += mm;
        });
    }

    /**
     * The snow of the tiles within `radius` tiles of a tile melts at once, and the ice with it (the heat of a
     * fireball). Returns the water of the snow, in mm over all the tiles.
     */
    public melt(tileX: number, tileY: number, radius: number): number {
        let water = 0;
        this.forTilesAround(tileX, tileY, radius, (index) => {
            water += this.snow[index];
            this.snow[index] = 0;
            if (this.ice[index] > 0) this.iceChanged = true;
            this.ice[index] = 0;
        });
        return water;
    }

    /** Whether a tile is outdoors on a soil that grows grass: where a tree can burn. */
    public growsAt(tileX: number, tileY: number): boolean {
        const index = this.indexOf(tileX, tileY);
        return index !== undefined && this.outdoor[index] === 1 && this.fertility[index] > 0;
    }

    /** Whether a tile is too wet for a fire: water lying on it, a sodden soil, or a full cover of snow. */
    public soakedAt(tileX: number, tileY: number): boolean {
        const index = this.indexOf(tileX, tileY);
        return (
            index !== undefined &&
            (this.water[index] >= SOAKED_WATER_PX ||
                this.moisture[index] >= FIRE_MAX_MOISTURE ||
                // A full cover of snow smothers a fire as water does; a thin one is melted by it.
                this.snow[index] >= SNOW_FULL_MM)
        );
    }

    /** How many tiles are on fire. */
    public burning(): number {
        let count = 0;
        for (let index = 0; index < this.fire.length; index++) if (this.fire[index] > 0) count++;
        return count;
    }

    /** What a tile has to burn: its grass, or the litter of a dry ground where there is less grass than that. */
    private fuelOf(index: number): number {
        // The litter burns from a ground a little dry, and in full from a ground half dry: no sudden threshold.
        const [from, full] = DRY_GROUND_BURNS;
        const cured = Math.min(1, Math.max(0, (this.dryness[index] - from) / (full - from)));
        return Math.max(this.grass[index], DRY_GROUND_FUEL * cured);
    }

    /** Whether a tile can take fire: something to burn on a soil that grows grass, neither wet nor burnt nor burning. */
    private burns(index: number): boolean {
        return (
            this.outdoor[index] === 1 &&
            this.fertility[index] > 0 &&
            this.fire[index] === 0 &&
            this.snow[index] <= 0 &&
            this.fuelOf(index) >= FIRE_MIN_FUEL &&
            this.ash[index] < FIRE_MAX_ASH &&
            this.moisture[index] < FIRE_MAX_MOISTURE &&
            this.water[index] < SOAKED_WATER_PX
        );
    }

    /** Sets a tile on fire, with what it has to burn. */
    private light(index: number): void {
        this.fuel[index] = this.fuelOf(index);
        this.fire[index] = FIRE_START;
    }

    /**
     * A patch of fire: every tile within `radius` tiles of a tile that can take fire does. Returns how many did.
     * What happens next is the fire's own business: it dies on green or wet grass, it runs on straw.
     */
    public ignite(tileX: number, tileY: number, radius: number): number {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || !Number.isFinite(radius)) return 0;
        const reach = Math.max(0, radius);
        let lit = 0;
        for (
            let y = Math.max(0, Math.floor(tileY - reach));
            y <= Math.min(this.height - 1, Math.ceil(tileY + reach));
            y++
        ) {
            for (
                let x = Math.max(0, Math.floor(tileX - reach));
                x <= Math.min(this.width - 1, Math.ceil(tileX + reach));
                x++
            ) {
                if ((x - tileX) ** 2 + (y - tileY) ** 2 > reach * reach) continue;
                const index = y * this.width + x;
                if (!this.burns(index)) continue;
                this.light(index);
                lit++;
            }
        }
        return lit;
    }

    /**
     * The crater of a fireball: every tile within `radius` tiles whose soil grows grass and has no water lying on it
     * is dried at once, and takes fire whatever it was, green or sodden, unless it is burning or still in ash.
     * Returns how many took fire.
     */
    public scorch(tileX: number, tileY: number, radius: number): number {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || !Number.isFinite(radius)) return 0;
        const reach = Math.max(0, radius);
        let lit = 0;
        for (
            let y = Math.max(0, Math.floor(tileY - reach));
            y <= Math.min(this.height - 1, Math.ceil(tileY + reach));
            y++
        ) {
            for (
                let x = Math.max(0, Math.floor(tileX - reach));
                x <= Math.min(this.width - 1, Math.ceil(tileX + reach));
                x++
            ) {
                if ((x - tileX) ** 2 + (y - tileY) ** 2 > reach * reach) continue;
                const index = y * this.width + x;
                if (this.outdoor[index] !== 1 || this.fertility[index] <= 0) continue;
                if (this.water[index] >= SOAKED_WATER_PX) continue;
                this.moisture[index] = 0;
                this.dryness[index] = 1;
                if (!this.burns(index)) continue;
                this.light(index);
                lit++;
            }
        }
        return lit;
    }

    /** For the tests and a restored state: sets a tile. */
    public set(tileX: number, tileY: number, moisture: number, grass: number, dryness = 0): void {
        const index = this.indexOf(tileX, tileY);
        if (index === undefined) return;
        this.moisture[index] = Math.min(1, Math.max(0, moisture));
        this.grass[index] = Math.min(1, Math.max(0, grass));
        this.dryness[index] = Math.min(1, Math.max(0, dryness));
    }

    /**
     * A downpour soaks the soil of the tiles within `radius` tiles of a tile (of every tile when `radius` is
     * undefined): outdoors only, and only a soil that holds water. Returns whether anything changed.
     */
    public soak(tileX: number, tileY: number, radius: number | undefined): boolean {
        const { width, height, moisture, hold, outdoor } = this;
        const fromY = radius === undefined ? 0 : Math.max(0, Math.floor(tileY - radius));
        const toY = radius === undefined ? height - 1 : Math.min(height - 1, Math.ceil(tileY + radius));
        const fromX = radius === undefined ? 0 : Math.max(0, Math.floor(tileX - radius));
        const toX = radius === undefined ? width - 1 : Math.min(width - 1, Math.ceil(tileX + radius));
        let changed = false;
        for (let y = fromY; y <= toY; y++) {
            for (let x = fromX; x <= toX; x++) {
                if (radius !== undefined && (x - tileX) ** 2 + (y - tileY) ** 2 > radius * radius) continue;
                const index = y * width + x;
                if (!outdoor[index] || hold[index] <= 0 || moisture[index] >= 1) continue;
                moisture[index] = 1;
                changed = true;
            }
        }
        return changed;
    }

    /**
     * The soil along open water keeps the moisture it draws from it (BANK_MOISTURE), less the farther it is: the
     * tiles are reached from the water lying on the ground, side by side, outdoors.
     */
    private drinkFromBanks(): void {
        const { width, moisture, water, hold, outdoor, bankReach, bankQueue } = this;
        const reach = BANK_MOISTURE.length;
        bankReach.fill(0);
        let tail = 0;
        for (let index = 0; index < water.length; index++) {
            // The water of a pool is held in a watertight basin: it wets no ground around its coping.
            if (outdoor[index] && water[index] >= SOAKED_WATER_PX && this.poolTile[index] === 0) {
                bankReach[index] = 1;
                bankQueue[tail++] = index;
            }
        }
        // Breadth first: each tile is reached once, at its distance from the nearest water (1 on the water).
        for (let head = 0; head < tail; head++) {
            const index = bankQueue[head];
            const distance = bankReach[index];
            if (distance > reach) continue;
            const tileX = index % width;
            for (const other of [
                tileX < width - 1 ? index + 1 : -1,
                tileX > 0 ? index - 1 : -1,
                index + width,
                index - width,
            ]) {
                if (other < 0 || other >= moisture.length || bankReach[other] !== 0 || !outdoor[other]) continue;
                bankReach[other] = distance + 1;
                bankQueue[tail++] = other;
                if (hold[other] > 0 && distance <= this.fringe[other]) {
                    moisture[other] = Math.max(moisture[other], BANK_MOISTURE[distance - 1]);
                }
            }
        }
    }

    /**
     * One step: the soil gains and loses its moisture, which spreads; the snow falls, melts and goes; then the grass
     * grows or dies. Returns the water of the snow that melted, when some did.
     */
    public step(input: MeadowStepInput): MeadowStepOutput | undefined {
        const seconds = Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : 0;
        if (seconds === 0) return undefined;
        const rain = Number.isFinite(input.rainMmPerHour) && input.rainMmPerHour > 0 ? input.rainMmPerHour : 0;
        const set = (value: number | undefined, usual: number): number =>
            value !== undefined && Number.isFinite(value) && value > 0 ? value : usual;
        const growSeconds = set(input.growSeconds, GROW_SECONDS);
        const thirstSeconds = set(input.thirstSeconds, THIRST_SECONDS);
        const holds = set(input.moistureHold, 1);
        const danger =
            input.fireDanger !== undefined && Number.isFinite(input.fireDanger)
                ? Math.min(1, Math.max(0, input.fireDanger))
                : 0;
        // A hot, dry wind dries the soil itself, not under the rain.
        const parching = rain > 0 ? 1 : 1 + PARCHING * danger;
        const chilled = this.readCold(input);
        // What of the soil is not frozen: only that part of it changes. Frozen water stays where it is.
        const thaw =
            input.soilFrost !== undefined && Number.isFinite(input.soilFrost)
                ? 1 - Math.min(1, Math.max(0, input.soilFrost))
                : 1;
        const { width, height, moisture, next, grass, dryness, fire, ash, water, hold, ground, fertility, outdoor } =
            this;
        water.fill(0);
        for (let tileY = 0; tileY < height; tileY++) {
            for (let tileX = 0; tileX < width; tileX++) {
                const index = tileY * width + tileX;
                if (!outdoor[index]) continue;
                const lying = input.waterAt(tileX, tileY);
                water[index] = Number.isFinite(lying) && lying > 0 ? lying : 0;
                if (hold[index] <= 0) {
                    moisture[index] = 0;
                } else if (water[index] >= SOAKED_WATER_PX) {
                    moisture[index] = 1;
                } else {
                    const kept = moisture[index] + rain * seconds * RAIN_GAIN;
                    const thawed = chilled && chilled[index] === chilled[index] ? 1 - soilFrost(chilled[index]) : thaw;
                    moisture[index] = Math.min(
                        1,
                        kept - kept * Math.min(1, (seconds * parching * thawed) / (hold[index] * holds)),
                    );
                }
            }
        }
        const thawed = this.stepSnow(input, seconds, rain, true);
        this.stepIce(input, seconds);
        // The moisture spreads to the four neighbours, and runs from a higher tile to a lower one.
        const pace = seconds / MEADOW_STEP_SECONDS;
        const sides = [1, -1, width, -width];
        for (let index = 0; index < moisture.length; index++) {
            next[index] = moisture[index];
            if (!outdoor[index] || hold[index] <= 0 || water[index] >= SOAKED_WATER_PX) continue;
            const tileX = index % width;
            let change = 0;
            for (const side of sides) {
                const other = index + side;
                if (other < 0 || other >= moisture.length) continue;
                if ((side === 1 && tileX === width - 1) || (side === -1 && tileX === 0)) continue;
                if (!outdoor[other] || hold[other] <= 0) continue;
                const wicks = Math.min(this.wicking[index], this.wicking[other]);
                change += (MOISTURE_SPREAD / 4) * wicks * (moisture[other] - moisture[index]);
                const slope = Math.min(1, Math.abs(ground[other] - ground[index]) / TILE_PX);
                if (ground[other] > ground[index]) change += (MOISTURE_RUNOFF / 4) * slope * moisture[other];
                else if (ground[other] < ground[index]) change -= (MOISTURE_RUNOFF / 4) * slope * moisture[index];
            }
            const thawed = chilled && chilled[index] === chilled[index] ? 1 - soilFrost(chilled[index]) : thaw;
            next[index] = Math.min(1, Math.max(0, moisture[index] + change * Math.min(1, pace) * thawed));
        }
        moisture.set(next);
        this.drinkFromBanks();
        const growth = seasonGrowth(input.season);
        for (let index = 0; index < grass.length; index++) {
            if (!outdoor[index]) continue;
            let cover = grass[index];
            const thawed = chilled && chilled[index] === chilled[index] ? 1 - soilFrost(chilled[index]) : thaw;
            if (fertility[index] <= 0 || water[index] >= DROWNING_WATER_PX) {
                cover -= seconds / DROWN_SECONDS;
            } else if (snowCover(ground[index], input.season) > 0) {
                // Under the snow of the heights the grass dies back, as fast as of thirst under a full cover.
                cover -= (seconds / thirstSeconds) * snowCover(ground[index], input.season);
            } else if (this.snow[index] > 0) {
                // Under the snow that fell the grass lies dormant: it neither dies of thirst nor grows.
            } else if (moisture[index] < DRY_MOISTURE) {
                // The grass of a frozen soil lies dormant: it does not go thirsty for the water it cannot draw.
                cover -= (seconds * thawed) / thirstSeconds;
            } else if (
                input.daylight &&
                growth > 0 &&
                water[index] < SOAKED_WATER_PX &&
                moisture[index] >= GROWING_MOISTURE[0] &&
                moisture[index] <= GROWING_MOISTURE[1]
            ) {
                cover += ((seconds * thawed) / growSeconds) * fertility[index] * growth * altitudeGrowth(ground[index]);
            }
            grass[index] = Math.min(1, Math.max(0, cover));
        }
        this.burn(input, seconds, Math.min(growSeconds, AFTER_FIRE_SECONDS));
        // Nothing grows back on a frozen soil: the time after a fire runs again at the thaw.
        this.regrow(input, seconds * thaw, Math.min(growSeconds, AFTER_FIRE_SECONDS));
        // The grass dries towards what the conditions and its soil make it: straw on a dry soil when it is hot, dry
        // and windy, green again on a wet soil or when the conditions ease.
        // Dormant on a frozen soil, it neither cures nor greens.
        const share = 1 - Math.exp(-(seconds * thaw) / DRYING_SECONDS);
        for (let index = 0; index < dryness.length; index++) {
            // Every ground where grass can grow dries, bare or not; sand, rock and indoors have nothing to dry.
            // Burnt ground has nothing left to dry until its grass is back.
            if (fertility[index] <= 0 || !outdoor[index] || ash[index] >= FIRE_MAX_ASH) {
                dryness[index] = 0;
                continue;
            }
            // Living grass on a soil that still feeds it stays green: the air cures the grass the soil leaves
            // thirsty, fully where it dies of thirst.
            const thirst = Math.min(
                1,
                Math.max(0, (GROWING_MOISTURE[0] - moisture[index]) / (GROWING_MOISTURE[0] - DRY_MOISTURE)),
            );
            const target = water[index] >= SOAKED_WATER_PX ? 0 : danger * thirst;
            dryness[index] += (target - dryness[index]) * share;
        }
        // At the highest danger a fire starts by itself now and then, on grass gone to straw.
        const random = input.random ?? Math.random;
        if (danger >= 1 && dryness.length > 0 && random() < seconds / SELF_START_SECONDS) {
            for (let attempt = 0; attempt < SELF_START_TRIES; attempt++) {
                const index = Math.min(dryness.length - 1, Math.floor(random() * dryness.length));
                if (dryness[index] < SELF_START_DRYNESS || !this.burns(index)) continue;
                this.light(index);
                break;
            }
        }
        // The ash goes as the grass grows back over it.
        for (let index = 0; index < ash.length; index++) {
            if (ash[index] > 0 && fire[index] === 0) ash[index] = Math.min(ash[index], 1 - grass[index]);
        }
        return thawed ? { meltedMm: this.melted } : undefined;
    }

    /**
     * One step of the snow alone, on a map that turned its meadow off: it falls, melts and goes as in a full step,
     * and nothing else moves. Returns the water of the snow that melted, when some did.
     */
    public stepSnowAlone(input: MeadowStepInput): MeadowStepOutput | undefined {
        const seconds = Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : 0;
        if (seconds === 0) return undefined;
        const rain = Number.isFinite(input.rainMmPerHour) && input.rainMmPerHour > 0 ? input.rainMmPerHour : 0;
        const { width, height, water, outdoor } = this;
        this.readCold(input);
        water.fill(0);
        for (let tileY = 0; tileY < height; tileY++) {
            for (let tileX = 0; tileX < width; tileX++) {
                const index = tileY * width + tileX;
                if (!outdoor[index]) continue;
                const lying = input.waterAt(tileX, tileY);
                water[index] = Number.isFinite(lying) && lying > 0 ? lying : 0;
            }
        }
        const thawed = this.stepSnow(input, seconds, rain, false);
        this.stepIce(input, seconds);
        return thawed ? { meltedMm: this.melted } : undefined;
    }

    /**
     * The snow of one step: what falls is laid, then it melts by the heat of the air and under the rain, and a dry
     * wind takes some of it. On open water it melts at once, unless it freezes. With `wets`, what melts wets the soil under it as the
     * same rain would. True when any melted: its water is in `melted`.
     */
    /**
     * The masses of cold air of this step, read once: the air of each tile they reach (the air of the map brought
     * towards theirs, whole in their core and fading to their rim; the coldest where several meet). Returns those
     * airs, undefined when no tile is chilled: nothing is then read tile by tile. The air of the map counts as 0 °C
     * while it is not known.
     */
    private readCold(input: MeadowStepInput): Float32Array | undefined {
        if (this.chilled) {
            for (const index of this.chilledTiles) this.chilled[index] = Number.NaN;
            this.chilledTiles.length = 0;
        }
        this.chilling = false;
        const masses = input.cold;
        if (!masses || masses.length === 0) return undefined;
        const known = input.weather?.temperature;
        const base = known !== undefined && Number.isFinite(known) ? known : 0;
        const { width, height } = this;
        for (const mass of masses) {
            if (!Number.isFinite(mass.x) || !Number.isFinite(mass.y) || !(mass.radiusTiles > 0)) continue;
            if (!(mass.temperature < base)) continue;
            const middleX = mass.x / TILE_PX;
            const middleY = mass.y / TILE_PX;
            const fromY = Math.max(0, Math.floor(middleY - mass.radiusTiles));
            const toY = Math.min(height - 1, Math.floor(middleY + mass.radiusTiles));
            const fromX = Math.max(0, Math.floor(middleX - mass.radiusTiles));
            const toX = Math.min(width - 1, Math.floor(middleX + mass.radiusTiles));
            for (let tileY = fromY; tileY <= toY; tileY++) {
                for (let tileX = fromX; tileX <= toX; tileX++) {
                    const away = Math.hypot(tileX + 0.5 - middleX, tileY + 0.5 - middleY) / mass.radiusTiles;
                    const share = coldShare(away);
                    if (share <= 0) continue;
                    if (!this.chilled) this.chilled = new Float32Array(width * height).fill(Number.NaN);
                    const index = tileY * width + tileX;
                    const here = base + (mass.temperature - base) * share;
                    const before = this.chilled[index];
                    if (before !== before) this.chilledTiles.push(index);
                    else if (before <= here) continue;
                    this.chilled[index] = here;
                }
            }
        }
        this.chilling = this.chilledTiles.length > 0;
        if (this.chilling && input.weather) {
            this.chilledAir.humidity = input.weather.humidity;
            this.chilledAir.windSpeed = input.weather.windSpeed;
        } else {
            this.chilledAir.humidity = 50;
            this.chilledAir.windSpeed = 0;
        }
        return this.chilling ? this.chilled : undefined;
    }

    private stepSnow(input: MeadowStepInput, seconds: number, rain: number, wets: boolean): boolean {
        const { snow, melted, water, outdoor, moisture, hold, heat, fire, width, height, ice, hotPool } = this;
        // A tile on fire warms itself and the eight around it.
        const flame = FIRE_THAW_MM_PER_SECOND * seconds;
        for (let index = 0; index < fire.length; index++) {
            if (fire[index] <= 0) continue;
            const tileX = index % width;
            const tileY = (index - tileX) / width;
            for (let y = Math.max(0, tileY - 1); y <= Math.min(height - 1, tileY + 1); y++) {
                for (let x = Math.max(0, tileX - 1); x <= Math.min(width - 1, tileX + 1); x++) {
                    heat[y * width + x] += flame * fire[index];
                }
            }
        }
        const falling =
            input.snowfallMm !== undefined && Number.isFinite(input.snowfallMm) ? Math.max(0, input.snowfallMm) : 0;
        const times =
            input.snowTimes !== undefined && Number.isFinite(input.snowTimes) && input.snowTimes > 0
                ? input.snowTimes
                : 1;
        const hours = (seconds * times) / 3600;
        const weather = input.weather;
        const mapMelting = weather
            ? snowMeltMmPerHour(weather) * hours + rainMeltMm(rain * hours, weather.temperature)
            : 0;
        const going = weather ? snowSublimationMmPerHour(weather) * hours : 0;
        // When it freezes the water does not take the snow: it holds on it as on ice.
        const mapFreezing = weather !== undefined && Number.isFinite(weather.temperature) && weather.temperature <= 0;
        const chilled = this.chilling ? this.chilled : undefined;
        const chilledAir = this.chilledAir;
        melted.fill(0);
        let any = false;
        for (let index = 0; index < snow.length; index++) {
            if (!outdoor[index]) continue;
            let lying = Math.min(SNOW_MAX_MM, snow[index] + falling);
            if (lying <= 0) continue;
            let melting = mapMelting;
            let freezing = mapFreezing;
            // Under a mass of cold air the snow melts, or holds on the water, by the air of its tile.
            if (chilled && chilled[index] === chilled[index]) {
                chilledAir.temperature = chilled[index];
                melting = snowMeltMmPerHour(chilledAir) * hours + rainMeltMm(rain * hours, chilledAir.temperature);
                freezing = chilledAir.temperature <= 0;
            }
            // The heat of a fire first: it melts the snow whatever the air, and dries the soil it bares.
            const burnt = Math.min(lying, heat[index]);
            lying -= burnt;
            // What is left of the heat is for the ice under the snow (stepIce).
            heat[index] -= burnt;
            // Open water takes the snow as it falls, unless it freezes; elsewhere the heat melts it first, then the
            // wind takes its share.
            // The hot water of a pool melts the snow whatever the cold.
            const open =
                water[index] >= SOAKED_WATER_PX && (hotPool[index] === 1 || (!freezing && ice[index] < ICE_SLIPS_MM));
            const thaw = open ? lying : Math.min(lying, melting);
            lying -= thaw;
            lying = Math.max(0, lying - going);
            if (thaw + burnt > 0) {
                melted[index] = thaw + burnt;
                any = true;
                // RAIN_GAIN is by mm an hour and by second: a mm of water is 3600 of those.
                if (wets && hold[index] > 0) {
                    moisture[index] = Math.min(1, moisture[index] + thaw * 3600 * RAIN_GAIN);
                }
            }
            snow[index] = lying;
        }
        return any;
    }

    /**
     * The ice of one step, after the snow: on the water lying on a tile it thickens in the frost (slower under the
     * snow), thaws in a mild air and under what the snow left of the heat of a fire, and is never thicker than the
     * water under it. Where no water lies there is no ice. The heat of the fires is spent here.
     */
    private stepIce(input: MeadowStepInput, seconds: number): void {
        const { ice, snow, water, outdoor, heat, hotPool } = this;
        const times =
            input.snowTimes !== undefined && Number.isFinite(input.snowTimes) && input.snowTimes > 0
                ? input.snowTimes
                : 1;
        const hours = (seconds * times) / 3600;
        const mapWeather = input.weather;
        const mapThawing = mapWeather ? iceThawMmPerHour(mapWeather) * hours : 0;
        const chilled = this.chilling ? this.chilled : undefined;
        let changed = false;
        for (let index = 0; index < ice.length; index++) {
            if (!outdoor[index]) continue;
            const before = ice[index];
            let thick = before;
            // The water lying on the tile, a pool's as a lake's; the hot water of a heated pool takes no ice.
            const lying = hotPool[index] === 1 ? 0 : water[index];
            if (lying < SOAKED_WATER_PX) {
                thick = 0;
            } else {
                let weather = mapWeather;
                let thawing = mapThawing;
                // Under a mass of cold air the ice takes and thaws by the air of its tile.
                if (chilled && chilled[index] === chilled[index]) {
                    this.chilledAir.temperature = chilled[index];
                    weather = this.chilledAir;
                    thawing = iceThawMmPerHour(weather) * hours;
                }
                if (weather && hours > ICE_EXACT_FROM_HOURS) {
                    // A fast clock: the ice of those hours by the exact law, whatever their number.
                    const share = input.currentAt
                        ? iceCurrentShare(input.currentAt(index % this.width, Math.floor(index / this.width)))
                        : 1;
                    thick = iceAfterHours(thick, weather, snow[index], hours, share);
                } else if (weather) {
                    const growth = (iceGrowthMmPerDay(thick, weather, snow[index]) * hours * ICE_GROWTH_TIMES) / 24;
                    // On running water the cold makes frazil, not a sheet: less or no ice takes (iceCurrentShare).
                    const share =
                        growth > 0 && input.currentAt
                            ? iceCurrentShare(input.currentAt(index % this.width, Math.floor(index / this.width)))
                            : 1;
                    thick += share === 1 ? growth : growth * share;
                }
                thick = Math.max(0, thick - thawing - heat[index]);
                thick = Math.min(thick, lying / PX_PER_MM, ICE_MAX_MM);
            }
            if (thick !== before) {
                ice[index] = thick;
                changed = true;
            }
        }
        heat.fill(0);
        this.iceChanged = changed;
    }

    /**
     * After a fire, whatever the conditions: the ash of a tile that went out stays whole for a while, then goes in
     * the rest of `afterFire` seconds, and the grass comes back as it goes, up to a full meadow, wherever grass may
     * grow: neither under water nor under the snow of the heights. Its own rules take the grass back from there.
     */
    private regrow(input: MeadowStepInput, seconds: number, afterFire: number): void {
        const { grass, fire, ash, smoulder, water, ground, fertility, outdoor } = this;
        const fading = afterFire * (1 - SMOULDER_SHARE);
        for (let index = 0; index < ash.length; index++) {
            if (ash[index] <= 0 || fire[index] > 0) continue;
            let left = seconds;
            if (smoulder[index] > 0) {
                const waited = Math.min(smoulder[index], left);
                smoulder[index] -= waited;
                left -= waited;
            }
            ash[index] = Math.max(0, ash[index] - left / fading);
            if (
                outdoor[index] === 1 &&
                fertility[index] > 0 &&
                water[index] < DROWNING_WATER_PX &&
                snowCover(ground[index], input.season) <= 0 &&
                this.snow[index] <= 0
            ) {
                grass[index] = Math.max(grass[index], 1 - ash[index]);
            }
        }
    }

    /** The tiles on fire burn their grass, go out under water and rain, and set their neighbours on fire. */
    private burn(input: MeadowStepInput, seconds: number, afterFire: number): void {
        const { width, height, moisture, grass, dryness, fire, ash, smoulder, fuel, water, snow } = this;
        const rain = Number.isFinite(input.rainMmPerHour) && input.rainMmPerHour > 0 ? input.rainMmPerHour : 0;
        const random = input.random ?? Math.random;
        const speed =
            input.windSpeed !== undefined && Number.isFinite(input.windSpeed) ? Math.max(0, input.windSpeed) : 0;
        // Where the wind goes: a wind from the north blows south, down the map.
        const from =
            ((input.windFrom !== undefined && Number.isFinite(input.windFrom) ? input.windFrom : 0) * Math.PI) / 180;
        const windX = -Math.sin(from);
        const windY = Math.cos(from);
        const pace = Math.min(1, seconds / MEADOW_STEP_SECONDS);
        const spreading: number[] = [];
        for (let index = 0; index < fire.length; index++) {
            if (fire[index] === 0) continue;
            // Water lying on the tile or a sodden soil puts it out at once; a rain as hard as it falls.
            let flame = fire[index] + seconds / FIRE_RISE_SECONDS - (seconds * rain) / RAIN_QUENCH_MM;
            if (water[index] >= SOAKED_WATER_PX || moisture[index] >= FIRE_MAX_MOISTURE || snow[index] > 0) flame = 0;
            if (flame <= 0) {
                fire[index] = 0;
                smoulder[index] = afterFire * SMOULDER_SHARE;
                continue;
            }
            fuel[index] -= seconds / BURN_SECONDS;
            // The grass goes with what burns: none is left once its share is burnt.
            grass[index] = Math.max(0, Math.min(grass[index], fuel[index]));
            ash[index] = Math.min(1, ash[index] + seconds / BURN_SECONDS);
            if (fuel[index] <= 1e-6) {
                // Burnt through: nothing left but ash.
                grass[index] = 0;
                dryness[index] = 0;
                ash[index] = 1;
                fire[index] = 0;
                smoulder[index] = afterFire * SMOULDER_SHARE;
                continue;
            }
            fire[index] = Math.min(1, flame);
            if (fire[index] >= FIRE_SPREADS_FROM) spreading.push(index);
        }
        // The fire set at this step spreads at the next: it does not cross the map in one.
        for (const index of spreading) {
            const tileX = index % width;
            const tileY = (index - tileX) / width;
            // The wind where this fire burns, where it differs from place to place.
            const local = input.windAt?.((tileX + 0.5) * TILE_PX, (tileY + 0.5) * TILE_PX);
            const localFrom = local ? (local.from * Math.PI) / 180 : from;
            const pushX = local ? -Math.sin(localFrom) : windX;
            const pushY = local ? Math.cos(localFrom) : windY;
            const pushSpeed = local ? Math.max(0, local.speed) : speed;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = tileX + dx;
                    const y = tileY + dy;
                    if (x < 0 || y < 0 || x >= width || y >= height) continue;
                    const other = y * width + x;
                    if (!this.burns(other)) continue;
                    const corner = dx !== 0 && dy !== 0;
                    const along = (dx * pushX + dy * pushY) / (corner ? Math.SQRT2 : 1);
                    // The wind holds the flanks and the back of a fire as much as it drives its head: a fire in
                    // the wind is long and narrow (four times as long as wide at 30 km/h, seven at 50).
                    const wind = fireWindPush(along, pushSpeed);
                    const chance =
                        FIRE_SPREAD_CHANCE *
                        pace *
                        (GREEN_SPREAD_SHARE + (1 - GREEN_SPREAD_SHARE) * dryness[other]) *
                        wind *
                        (corner ? CORNER_SPREAD_SHARE : 1);
                    if (random() < chance) this.light(other);
                }
            }
            // Embers: as far downwind as the head of the fire runs at a step, a little less likely the further.
            const reach = Math.min(HEAD_MAX_TILES, Math.round(pushSpeed * HEAD_TILES_PER_KMH));
            for (let leap = 2; leap <= reach; leap++) {
                const x = tileX + Math.round(pushX * leap);
                const y = tileY + Math.round(pushY * leap);
                if (x < 0 || y < 0 || x >= width || y >= height) break;
                const other = y * width + x;
                if (!this.burns(other)) continue;
                const chance =
                    FIRE_SPREAD_CHANCE *
                    2 *
                    (1 - (0.5 * (leap - 1)) / reach) *
                    pace *
                    (GREEN_SPREAD_SHARE + (1 - GREEN_SPREAD_SHARE) * dryness[other]);
                if (random() < chance) this.light(other);
            }
        }
    }

    /**
     * An animal grazes for `seconds` at a point of the map (map pixels): it eats the grass of the tile under it.
     * What it ate, as a share of a full tile; nothing where there is no grass.
     */
    public graze(x: number, y: number, seconds: number): number {
        const index = this.indexOf(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
        if (index === undefined || !(seconds > 0) || !Number.isFinite(seconds)) return 0;
        const eaten = Math.min(this.grass[index], seconds / GRAZE_SECONDS);
        this.grass[index] -= eaten;
        return eaten;
    }

    /** A map that turns its meadow off: bare and dry at once. The snow is not of the meadow: it stays. */
    public clear(): void {
        this.grass.fill(0);
        this.moisture.fill(0);
        this.dryness.fill(0);
        this.fire.fill(0);
        this.ash.fill(0);
        this.smoulder.fill(0);
        this.fuel.fill(0);
    }

    /** The grass and the moisture of every tile, row by row, a byte each (0 to 255): told to the room and saved. */
    public writeGrass(): Uint8Array {
        return bytesOf(this.grass);
    }

    public writeMoisture(): Uint8Array {
        return bytesOf(this.moisture);
    }

    public writeDryness(): Uint8Array {
        return bytesOf(this.dryness);
    }

    /** The fire of every tile: told to the room, never saved (a room that restarts has no fire). */
    public writeFire(): Uint8Array {
        return bytesOf(this.fire);
    }

    public writeAsh(): Uint8Array {
        return bytesOf(this.ash);
    }

    /** The snow of every tile, a byte each (see snowByte): told to the room and saved. */
    public writeSnow(): Uint8Array {
        const bytes = new Uint8Array(this.snow.length);
        for (let index = 0; index < bytes.length; index++) bytes[index] = snowByte(this.snow[index]);
        return bytes;
    }

    /** The ice of every tile, a byte each (see iceByte): told to the room and saved. */
    public writeIce(): Uint8Array {
        const bytes = new Uint8Array(this.ice.length);
        for (let index = 0; index < bytes.length; index++) bytes[index] = iceByte(this.ice[index]);
        return bytes;
    }

    /**
     * Reads a state written by a meadow of the same size. False (and nothing read) for any other. A state saved
     * before the grass could dry has no dryness: it is read green; one saved before the snow or the ice has none.
     */
    public read(
        grass: Uint8Array,
        moisture: Uint8Array,
        dryness?: Uint8Array,
        ash?: Uint8Array,
        snow?: Uint8Array,
        ice?: Uint8Array,
    ): boolean {
        if (grass.length !== this.grass.length || moisture.length !== this.moisture.length) return false;
        if (snow && snow.length !== this.snow.length) return false;
        if (ice && ice.length !== this.ice.length) return false;
        if (dryness && dryness.length !== this.dryness.length) return false;
        if (ash && ash.length !== this.ash.length) return false;
        for (let index = 0; index < grass.length; index++) {
            this.grass[index] = this.outdoor[index] ? grass[index] / 255 : 0;
            this.moisture[index] = this.outdoor[index] ? moisture[index] / 255 : 0;
            this.dryness[index] = this.outdoor[index] && dryness ? dryness[index] / 255 : 0;
            this.ash[index] = this.outdoor[index] && ash ? ash[index] / 255 : 0;
            this.fire[index] = 0;
            this.snow[index] = this.outdoor[index] && snow ? snowMmOfByte(snow[index]) : 0;
            this.ice[index] = this.outdoor[index] && ice ? iceMmOfByte(ice[index]) : 0;
        }
        return true;
    }

    /** Takes the grass and the moisture of the meadow this one replaces (the map was edited), tile for tile. */
    public takeFrom(previous: Meadow): void {
        for (let tileY = 0; tileY < Math.min(this.height, previous.height); tileY++) {
            for (let tileX = 0; tileX < Math.min(this.width, previous.width); tileX++) {
                const index = tileY * this.width + tileX;
                if (!this.outdoor[index]) continue;
                this.moisture[index] = previous.moistureAt(tileX, tileY);
                this.grass[index] = previous.grassAt(tileX, tileY);
                this.dryness[index] = previous.drynessAt(tileX, tileY);
                this.fire[index] = previous.fireAt(tileX, tileY);
                this.fuel[index] = this.fire[index] > 0 ? Math.max(this.fuelOf(index), FIRE_MIN_FUEL) : 0;
                this.ash[index] = previous.ashAt(tileX, tileY);
                this.smoulder[index] = previous.smoulder[tileY * previous.width + tileX];
                this.snow[index] = previous.snowAt(tileX, tileY);
                this.ice[index] = previous.iceAt(tileX, tileY);
            }
        }
    }
}

function bytesOf(values: Float32Array): Uint8Array {
    const bytes = new Uint8Array(values.length);
    for (let index = 0; index < values.length; index++) bytes[index] = Math.round(values[index] * 255);
    return bytes;
}

/**
 * The tiles of a map that are outdoors: those whose cells are all reached from the edge of the map without crossing
 * a wall of the "Map" tool (doors closed). What walls close is indoors.
 */
function outdoorTiles(width: number, height: number, walls: WaterWallSides | undefined): Uint8Array {
    const outdoor = new Uint8Array(width * height);
    if (!walls || (walls.east.size === 0 && walls.south.size === 0)) return outdoor.fill(1);
    const columns = width * CELLS_A_TILE;
    const rows = height * CELLS_A_TILE;
    const closed = new Uint8Array(columns * rows);
    for (const [sides, bit] of [
        [walls.east, 1],
        [walls.south, 2],
    ] as const) {
        for (const key of sides) {
            const { x, y } = cellOf(key);
            if (x >= 0 && y >= 0 && x < columns && y < rows) closed[y * columns + x] |= bit;
        }
    }
    const reached = new Uint8Array(columns * rows);
    const queue = new Int32Array(columns * rows);
    let tail = 0;
    const visit = (index: number): void => {
        if (reached[index]) return;
        reached[index] = 1;
        queue[tail++] = index;
    };
    for (let x = 0; x < columns; x++) {
        visit(x);
        visit((rows - 1) * columns + x);
    }
    for (let y = 0; y < rows; y++) {
        visit(y * columns);
        visit(y * columns + columns - 1);
    }
    for (let head = 0; head < tail; head++) {
        const index = queue[head];
        const x = index % columns;
        const y = (index - x) / columns;
        if (x + 1 < columns && !(closed[index] & 1)) visit(index + 1);
        if (x > 0 && !(closed[index - 1] & 1)) visit(index - 1);
        if (y + 1 < rows && !(closed[index] & 2)) visit(index + columns);
        if (y > 0 && !(closed[index - columns] & 2)) visit(index - columns);
    }
    for (let tileY = 0; tileY < height; tileY++) {
        for (let tileX = 0; tileX < width; tileX++) {
            let all = 1;
            for (let y = 0; y < CELLS_A_TILE; y++) {
                for (let x = 0; x < CELLS_A_TILE; x++) {
                    if (!reached[(tileY * CELLS_A_TILE + y) * columns + tileX * CELLS_A_TILE + x]) all = 0;
                }
            }
            outdoor[tileY * width + tileX] = all;
        }
    }
    return outdoor;
}
