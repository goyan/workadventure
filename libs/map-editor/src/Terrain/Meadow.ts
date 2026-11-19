import { Season, TERRAIN_CELL, TILE_PX } from "../types";
import type { TerrainData, WAMFileFormat } from "../types";
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
/** No grass grows this high over the ground of the map, in pixels of altitude; it grows slower on the way up. */
export const GRASS_LINE_PX = 192;

/** How a soil holds the moisture and grows grass. A cell not painted is earth. */
const SOIL_LIFE: Record<SoilName, { holdSeconds: number; fertility: number }> = {
    earth: { holdSeconds: 600, fertility: 1 },
    meadow: { holdSeconds: 900, fertility: 1.5 },
    clay: { holdSeconds: 1800, fertility: 0.5 },
    sand: { holdSeconds: 120, fertility: 0 },
    rock: { holdSeconds: 0, fertility: 0 },
    gravel: { holdSeconds: 60, fertility: 0 },
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

/** What one step of the meadow reads of the world around it. */
export interface MeadowStepInput {
    seconds: number;
    rainMmPerHour: number;
    daylight: boolean;
    season: Season;
    /** The water lying on a tile, in pixels: the deepest of its cells. */
    waterAt: (tileX: number, tileY: number) => number;
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
    /** The luck of the fire, from 0 to 1 at each draw: whether it spreads, whether one starts. Math.random when absent. */
    random?: () => number;
}

/** The tiles a floor of the "Map" tool covers on the ground (a paved path, a terrace): nothing grows there. */
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
    /** What each tile on fire still has to burn (see fuelOf), from 0 to 1. */
    private readonly fuel: Float32Array;
    /** The water lying on each tile, as the last step read it. */
    private readonly water: Float32Array;
    /** For each tile: how long its soil holds its moisture (0: it holds none), how fertile it is, and its height. */
    private readonly hold: Float32Array;
    private readonly fertility: Float32Array;
    private readonly ground: Float32Array;
    private readonly outdoor: Uint8Array;

    constructor(
        size: { width: number; height: number },
        terrain: TerrainData | undefined,
        walls: WaterWallSides | undefined,
        paved?: ReadonlySet<string>,
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
        this.fuel = new Float32Array(tiles);
        this.water = new Float32Array(tiles);
        this.hold = new Float32Array(tiles);
        this.fertility = new Float32Array(tiles);
        this.ground = new Float32Array(tiles);
        this.outdoor = outdoorTiles(this.width, this.height, walls);
        for (let tileY = 0; tileY < this.height; tileY++) {
            for (let tileX = 0; tileX < this.width; tileX++) {
                const index = tileY * this.width + tileX;
                const cellX = tileX * CELLS_A_TILE;
                const cellY = tileY * CELLS_A_TILE;
                let height = 0;
                for (let y = 0; y < CELLS_A_TILE; y++) {
                    for (let x = 0; x < CELLS_A_TILE; x++) height += heightAt(terrain, cellX + x, cellY + y);
                }
                this.ground[index] = height / (CELLS_A_TILE * CELLS_A_TILE);
                const soil = SOIL_LIFE[soilName(soilAt(terrain, cellX, cellY)) ?? "earth"];
                this.hold[index] = soil.holdSeconds;
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

    /** One step: the soil gains and loses its moisture, which spreads; then the grass grows or dies. */
    public step(input: MeadowStepInput): void {
        const seconds = Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : 0;
        if (seconds === 0) return;
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
                    moisture[index] = Math.min(
                        1,
                        kept - kept * Math.min(1, (seconds * parching) / (hold[index] * holds)),
                    );
                }
            }
        }
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
                change += (MOISTURE_SPREAD / 4) * (moisture[other] - moisture[index]);
                const slope = Math.min(1, Math.abs(ground[other] - ground[index]) / TILE_PX);
                if (ground[other] > ground[index]) change += (MOISTURE_RUNOFF / 4) * slope * moisture[other];
                else if (ground[other] < ground[index]) change -= (MOISTURE_RUNOFF / 4) * slope * moisture[index];
            }
            next[index] = Math.min(1, Math.max(0, moisture[index] + change * Math.min(1, pace)));
        }
        moisture.set(next);
        const growth = seasonGrowth(input.season);
        for (let index = 0; index < grass.length; index++) {
            if (!outdoor[index]) continue;
            let cover = grass[index];
            if (fertility[index] <= 0 || water[index] >= DROWNING_WATER_PX) {
                cover -= seconds / DROWN_SECONDS;
            } else if (snowCover(ground[index], input.season) > 0) {
                // Under the snow of the heights the grass dies back, as fast as of thirst under a full cover.
                cover -= (seconds / thirstSeconds) * snowCover(ground[index], input.season);
            } else if (moisture[index] < DRY_MOISTURE) {
                cover -= seconds / thirstSeconds;
            } else if (
                input.daylight &&
                growth > 0 &&
                water[index] < SOAKED_WATER_PX &&
                moisture[index] >= GROWING_MOISTURE[0] &&
                moisture[index] <= GROWING_MOISTURE[1]
            ) {
                cover += (seconds / growSeconds) * fertility[index] * growth * altitudeGrowth(ground[index]);
            }
            grass[index] = Math.min(1, Math.max(0, cover));
        }
        this.burn(input, seconds);
        // The grass dries towards what the conditions and its soil make it: straw on a dry soil when it is hot, dry
        // and windy, green again on a wet soil or when the conditions ease.
        const share = 1 - Math.exp(-seconds / DRYING_SECONDS);
        for (let index = 0; index < dryness.length; index++) {
            // Every ground where grass can grow dries, bare or not; sand, rock and indoors have nothing to dry.
            // Burnt ground has nothing left to dry until its grass is back.
            if (fertility[index] <= 0 || !outdoor[index] || ash[index] >= FIRE_MAX_ASH) {
                dryness[index] = 0;
                continue;
            }
            const target = water[index] >= SOAKED_WATER_PX ? 0 : danger * (1 - moisture[index]);
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
    }

    /** The tiles on fire burn their grass, go out under water and rain, and set their neighbours on fire. */
    private burn(input: MeadowStepInput, seconds: number): void {
        const { width, height, moisture, grass, dryness, fire, ash, fuel, water } = this;
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
            if (water[index] >= SOAKED_WATER_PX || moisture[index] >= FIRE_MAX_MOISTURE) flame = 0;
            if (flame <= 0) {
                fire[index] = 0;
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
                continue;
            }
            fire[index] = Math.min(1, flame);
            if (fire[index] >= FIRE_SPREADS_FROM) spreading.push(index);
        }
        // The fire set at this step spreads at the next: it does not cross the map in one.
        for (const index of spreading) {
            const tileX = index % width;
            const tileY = (index - tileX) / width;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = tileX + dx;
                    const y = tileY + dy;
                    if (x < 0 || y < 0 || x >= width || y >= height) continue;
                    const other = y * width + x;
                    if (!this.burns(other)) continue;
                    const corner = dx !== 0 && dy !== 0;
                    const along = (dx * windX + dy * windY) / (corner ? Math.SQRT2 : 1);
                    // The wind holds the flanks and the back of a fire as much as it drives its head: a fire in
                    // the wind is long and narrow (four times as long as wide at 30 km/h, seven at 50).
                    const calm = 1 / (1 + speed / FLANK_WIND_KMH);
                    const head = Math.min(FIRE_WIND_BOUNDS[1], 1 + speed / FIRE_WIND_KMH);
                    // Without wind a fire has no back: it spreads alike all around.
                    const wind =
                        along >= 0
                            ? // Straight downwind far more than aslant: the head is narrow.
                              calm + (head - calm) * along ** 3
                            : calm * (1 + BACK_HOLD * (1 - calm) * along);
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
            const reach = Math.min(HEAD_MAX_TILES, Math.round(speed * HEAD_TILES_PER_KMH));
            for (let leap = 2; leap <= reach; leap++) {
                const x = tileX + Math.round(windX * leap);
                const y = tileY + Math.round(windY * leap);
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

    /** A map that turns its meadow off: bare and dry at once. */
    public clear(): void {
        this.grass.fill(0);
        this.moisture.fill(0);
        this.dryness.fill(0);
        this.fire.fill(0);
        this.ash.fill(0);
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

    /**
     * Reads a state written by a meadow of the same size. False (and nothing read) for any other. A state saved
     * before the grass could dry has no dryness: it is read green.
     */
    public read(grass: Uint8Array, moisture: Uint8Array, dryness?: Uint8Array, ash?: Uint8Array): boolean {
        if (grass.length !== this.grass.length || moisture.length !== this.moisture.length) return false;
        if (dryness && dryness.length !== this.dryness.length) return false;
        if (ash && ash.length !== this.ash.length) return false;
        for (let index = 0; index < grass.length; index++) {
            this.grass[index] = this.outdoor[index] ? grass[index] / 255 : 0;
            this.moisture[index] = this.outdoor[index] ? moisture[index] / 255 : 0;
            this.dryness[index] = this.outdoor[index] && dryness ? dryness[index] / 255 : 0;
            this.ash[index] = this.outdoor[index] && ash ? ash[index] / 255 : 0;
            this.fire[index] = 0;
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
