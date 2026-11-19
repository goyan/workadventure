import { TILE_PX } from "@workadventure/map-editor";

/** The colour of the grass, and how much of the ground a full meadow covers. */
export const GRASS_COLOR = 0x4c9a2a;
export const GRASS_ALPHA = 0.75;

/** How strongly the grass of a tile is drawn, from its cover (0 to 255). */
export function grassAlpha(level: number): number {
    return GRASS_ALPHA * Math.min(1, Math.max(0, level / 255));
}

/**
 * The cover of a cell of the relief drawn for a tile of this cover (0 to 255): the same grass, a little thinner
 * here and thicker there, always alike for a cell, so a meadow is not a flat colour.
 */
export function mottledCover(cover: number, cellX: number, cellY: number): number {
    if (cover <= 0) return 0;
    let hash = (Math.imul(cellX, 0x9e3779b1) ^ Math.imul(cellY, 0x85ebca6b)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0;
    const share = 0.7 + 0.3 * ((hash >>> 8) / 0xffffff);
    return Math.max(1, Math.round(cover * share));
}

/** The colour of the grass gone dry: straw, drawn over the green as much as the grass is dry. */
export const STRAW_COLOR = 0xd9c257;
export const STRAW_ALPHA = 0.85;

/** How much straw is drawn over the grass of a cell, from its cover and its dryness (0 to 255 each). */
export function strawLevel(cover: number, dryness: number): number {
    return Math.round((Math.max(0, cover) * Math.max(0, dryness)) / 255);
}

/** How strongly the straw of a cell is drawn, from its level (0 to 255). */
export function strawAlpha(level: number): number {
    return STRAW_ALPHA * Math.min(1, Math.max(0, level / 255));
}

/**
 * The meadow of the map as the server last told it: the grass and the moisture of the soil of each tile. The server
 * alone computes it; the browser only draws it.
 */
export class MeadowState {
    private width = 0;
    private height = 0;
    private grass: Uint8Array = new Uint8Array(0);
    private moisture: Uint8Array = new Uint8Array(0);
    private dryness: Uint8Array = new Uint8Array(0);
    private any = false;
    private changes = 0;

    /** A state of the meadow, its bytes already unzipped. One that does not fit its size is left out. */
    public receive(state: {
        width: number;
        height: number;
        grass: Uint8Array;
        moisture: Uint8Array;
        /** Absent or empty from a server that does not dry the grass: all green. */
        dryness?: Uint8Array;
    }): void {
        const tiles = state.width * state.height;
        if (!Number.isInteger(tiles) || tiles < 0 || state.grass.length !== tiles || state.moisture.length !== tiles) {
            return;
        }
        this.width = state.width;
        this.height = state.height;
        this.grass = state.grass;
        this.moisture = state.moisture;
        this.dryness = state.dryness?.length === tiles ? state.dryness : new Uint8Array(tiles);
        this.any = state.grass.some((cover) => cover > 0);
        this.changes++;
    }

    private at(values: Uint8Array, tileX: number, tileY: number): number {
        if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return 0;
        return values[tileY * this.width + tileX];
    }

    /** The grass of a tile, from 0 (bare) to 255 (a full meadow). */
    public grassAt(tileX: number, tileY: number): number {
        return this.at(this.grass, tileX, tileY);
    }

    /** How dry the grass of a tile is, from 0 (green) to 255 (straw, ready to burn). */
    public drynessAt(tileX: number, tileY: number): number {
        return this.at(this.dryness, tileX, tileY);
    }

    /** The moisture of the soil at a point of the map (map pixels), from 0 (dry) to 1 (sodden). */
    public moistureAt(x: number, y: number): number {
        return this.at(this.moisture, Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) / 255;
    }

    /** The grass at a point of the map (map pixels), from 0 (bare) to 1 (a full meadow). */
    public coverAt(x: number, y: number): number {
        return this.grassAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) / 255;
    }

    /** Whether any grass grows on the map: nothing to draw otherwise. */
    public hasGrass(): boolean {
        return this.any;
    }

    /** Changes whenever a state is received. */
    public version(): number {
        return this.changes;
    }
}
