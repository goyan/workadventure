import { iceMmOfByte, snowCoverOf, snowMmOfByte, TILE_PX } from "@workadventure/map-editor";

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

/**
 * The colour of the grass gone dry: straw, drawn over the ground as much as its grass is dry. Cured grass is a pale,
 * greyish blond, far less saturated than a yellow ("straw" then "bleached" in the grassland curing guides of the CFA
 * of Victoria and of FESA, Western Australia), kept darker than the sand so that the two read apart. The middle of
 * the patches the ground shader draws, from bleached blond to dry khaki (see GroundSplat).
 */
export const STRAW_COLOR = 0xb4a16b;
export const STRAW_ALPHA = 0.92;
/**
 * A dry ground is seen dry, not only its meadows: bare ground where grass can grow yellows this much (of 255), and
 * thin grass this much already.
 */
const BARE_GROUND_STRAW = 200;
const THIN_GRASS_STRAW = 230;

/**
 * How much straw is drawn over a cell, from the cover of its grass and the dryness of its ground (0 to 255 each):
 * some on bare ground, most of what a full meadow gives from thin grass on.
 */
export function strawLevel(cover: number, dryness: number): number {
    if (dryness <= 0) return 0;
    const ground =
        cover <= 0
            ? BARE_GROUND_STRAW
            : THIN_GRASS_STRAW + ((255 - THIN_GRASS_STRAW) * (Math.min(255, cover) - 1)) / 254;
    return Math.round((ground * Math.min(255, dryness)) / 255);
}

/** How strongly the straw of a cell is drawn, from its level (0 to 255). */
export function strawAlpha(level: number): number {
    return STRAW_ALPHA * Math.min(1, Math.max(0, level / 255));
}

/** The ash a fire left on the ground, and the glow of a tile on fire (until the flames are drawn over it). */
export const ASH_COLOR = 0x17130f;
export const ASH_ALPHA = 0.8;
export const FIRE_GLOW_COLOR = 0xff7a1a;
export const FIRE_GLOW_ALPHA = 0.85;

/** How strongly the ash of a cell is drawn, from its level (0 to 255). */
export function ashAlpha(level: number): number {
    return ASH_ALPHA * Math.min(1, Math.max(0, level / 255));
}

/** How strongly the fire of a cell glows on the ground, from its level (0 to 255). */
export function fireGlowAlpha(level: number): number {
    return FIRE_GLOW_ALPHA * Math.min(1, Math.max(0, level / 255));
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
    private fire: Uint8Array = new Uint8Array(0);
    private ash: Uint8Array = new Uint8Array(0);
    /** The snow lying on each tile (snowByte); empty when none lies on the map. */
    private snow: Uint8Array = new Uint8Array(0);
    private meanSnow = 0;
    private peakSnow = 0;
    /** The ice over the water of each tile (iceByte); empty when no water of the map is frozen. */
    private ice: Uint8Array = new Uint8Array(0);
    private anyIce = false;
    private thickestIceMm = 0;
    private thickestSnowMm = 0;
    private anyMoisture = false;
    private anyFire = false;
    private any = false;
    private anyDry = false;
    private changes = 0;

    /** A state of the meadow, its bytes already unzipped. One that does not fit its size is left out. */
    public receive(state: {
        width: number;
        height: number;
        grass: Uint8Array;
        moisture: Uint8Array;
        /** Absent or empty from a server that does not dry the grass: all green. */
        dryness?: Uint8Array;
        /** The fire and the ash of each tile; absent or empty from a server that knows no fire. */
        fire?: Uint8Array;
        ash?: Uint8Array;
        /** The snow lying on each tile; absent or empty when none lies, or from a server that keeps none. */
        snow?: Uint8Array;
        /** The ice over the water of each tile; absent or empty when none is frozen, or from a server that keeps none. */
        ice?: Uint8Array;
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
        this.fire = state.fire?.length === tiles ? state.fire : new Uint8Array(tiles);
        this.ash = state.ash?.length === tiles ? state.ash : new Uint8Array(tiles);
        this.snow = state.snow?.length === tiles ? state.snow : new Uint8Array(0);
        this.ice = state.ice?.length === tiles ? state.ice : new Uint8Array(0);
        this.anyIce = this.ice.some((byte) => byte > 0);
        this.anyMoisture = state.moisture.some((byte) => byte > 0);
        let covered = 0;
        let peak = 0;
        let thickestSnow = 0;
        for (const byte of this.snow) {
            const cover = snowCoverOf(snowMmOfByte(byte));
            covered += cover;
            peak = Math.max(peak, cover);
            thickestSnow = Math.max(thickestSnow, byte);
        }
        this.meanSnow = tiles > 0 ? covered / tiles : 0;
        this.peakSnow = peak;
        this.thickestSnowMm = snowMmOfByte(thickestSnow);
        let thickestIce = 0;
        for (const byte of this.ice) thickestIce = Math.max(thickestIce, byte);
        this.thickestIceMm = iceMmOfByte(thickestIce);
        this.anyFire = this.fire.some((fire) => fire > 0);
        this.any = state.grass.some((cover) => cover > 0);
        // A ground gone dry, burning or burnt is drawn even where no grass is left.
        this.anyDry = this.anyFire || this.dryness.some((dryness) => dryness > 0) || this.ash.some((ash) => ash > 0);
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

    /** The fire of a tile, from 0 (none) to 255 (at its height). */
    public fireAt(tileX: number, tileY: number): number {
        return this.at(this.fire, tileX, tileY);
    }

    /** The ash a fire left on a tile, from 0 to 255. */
    public ashAt(tileX: number, tileY: number): number {
        return this.at(this.ash, tileX, tileY);
    }

    /** Whether any tile of the map is on fire. */
    public isBurning(): boolean {
        return this.anyFire;
    }

    /** The moisture of the soil at a point of the map (map pixels), from 0 (dry) to 1 (sodden). */
    public moistureAt(x: number, y: number): number {
        return this.at(this.moisture, Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) / 255;
    }

    /** The grass at a point of the map (map pixels), from 0 (bare) to 1 (a full meadow). */
    public coverAt(x: number, y: number): number {
        return this.grassAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) / 255;
    }

    /** The snow lying on a tile, in mm of water. */
    public snowAt(tileX: number, tileY: number): number {
        return this.snow.length === 0 ? 0 : snowMmOfByte(this.at(this.snow, tileX, tileY));
    }

    /** How much the snow whitens the ground at a point of the map (map pixels), 0 to 1. */
    public snowCoverAt(x: number, y: number): number {
        return snowCoverOf(this.snowAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)));
    }

    /** How much of the map the snow whitens, 0 to 1: the mean over its tiles. */
    public meanSnowCover(): number {
        return this.meanSnow;
    }

    /** The cover of the snowiest tile, 0 to 1. */
    public peakSnowCover(): number {
        return this.peakSnow;
    }

    /** The snow of the snowiest tile, in mm of water. */
    public peakSnowMm(): number {
        return this.thickestSnowMm;
    }

    /** The ice of the tile where it is the thickest, in mm. */
    public peakIceMm(): number {
        return this.thickestIceMm;
    }

    /** The ice over the water of a tile, as the server tells it (iceByte): 0 without ice. */
    /** The moisture of the soil of a tile, as the server keeps it: 0 (dry) to 255 (sodden). */
    public moistureByteAt(tileX: number, tileY: number): number {
        return this.at(this.moisture, tileX, tileY);
    }

    /** Whether the soil of any tile is moist. */
    public hasMoisture(): boolean {
        return this.anyMoisture;
    }

    public iceByteAt(tileX: number, tileY: number): number {
        return this.ice.length === 0 ? 0 : this.at(this.ice, tileX, tileY);
    }

    /** The ice over the water of a tile, in mm. */
    public iceAt(tileX: number, tileY: number): number {
        return iceMmOfByte(this.iceByteAt(tileX, tileY));
    }

    /** The ice over the water at a point of the map (map pixels), in mm. */
    public iceAtPoint(x: number, y: number): number {
        return this.iceAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
    }

    /** Whether any water of the map is frozen. */
    public hasIce(): boolean {
        return this.anyIce;
    }

    /** Whether any snow lies on the map. */
    public hasSnow(): boolean {
        return this.meanSnow > 0;
    }

    /** Whether any grass grows on the map, or any of its ground is dry: nothing to draw otherwise. */
    public hasGrass(): boolean {
        return this.any || this.anyDry;
    }

    /** Changes whenever a state is received. */
    public version(): number {
        return this.changes;
    }
}
