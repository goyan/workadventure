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
/** The grass dries, or greens again, most of the way towards what the conditions make it in this many seconds. */
export const DRYING_SECONDS = 90;
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
        const { width, height, moisture, next, grass, dryness, hold, ground, fertility, outdoor } = this;
        const water = new Float32Array(moisture.length);
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
        // The grass dries towards what the conditions and its soil make it: straw on a dry soil when it is hot, dry
        // and windy, green again on a wet soil or when the conditions ease.
        const share = 1 - Math.exp(-seconds / DRYING_SECONDS);
        for (let index = 0; index < dryness.length; index++) {
            // Every ground where grass can grow dries, bare or not; sand, rock and indoors have nothing to dry.
            if (fertility[index] <= 0 || !outdoor[index]) {
                dryness[index] = 0;
                continue;
            }
            const target = water[index] >= SOAKED_WATER_PX ? 0 : danger * (1 - moisture[index]);
            dryness[index] += (target - dryness[index]) * share;
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

    /**
     * Reads a state written by a meadow of the same size. False (and nothing read) for any other. A state saved
     * before the grass could dry has no dryness: it is read green.
     */
    public read(grass: Uint8Array, moisture: Uint8Array, dryness?: Uint8Array): boolean {
        if (grass.length !== this.grass.length || moisture.length !== this.moisture.length) return false;
        if (dryness && dryness.length !== this.dryness.length) return false;
        for (let index = 0; index < grass.length; index++) {
            this.grass[index] = this.outdoor[index] ? grass[index] / 255 : 0;
            this.moisture[index] = this.outdoor[index] ? moisture[index] / 255 : 0;
            this.dryness[index] = this.outdoor[index] && dryness ? dryness[index] / 255 : 0;
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
