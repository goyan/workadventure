import {
    FACADE_FACE_HEIGHT,
    MAP_LAYER_FLOOR_FAMILIES,
    MAP_LAYER_FLOOR_SLAB_COLLECTION,
    MAP_LAYER_TILE_SIZE,
    wallRise,
} from "./MapLayerCatalog";
import type { FloorFamily, WallHeight } from "./MapLayerCatalog";

/**
 * Raised floors of the map layer: slabs laid on the top of the walls, and the stairs that go up to them.
 *
 * Everything standing on a raised floor carries its altitude (`EntityData.elevation`, in pixels above the ground) and
 * is drawn that much further north than the place it stands on. A place is always told on the ground here; the image
 * of what stands there is `elevation` pixels higher on the screen.
 *
 * Like the other pieces of the map layer, the names are a contract with the private catalogs: never rename one once a
 * catalog has been published.
 */
export { MAP_LAYER_FLOOR_SLAB_COLLECTION };

/** Heights of the walls that can carry a floor: under a wall of height 1 nobody could walk. */
export const FLOOR_WALL_HEIGHTS = [2, 3, 4] as const;
export type FloorWallHeight = (typeof FLOOR_WALL_HEIGHTS)[number];

/** Altitude of a floor laid on walls of this height: the top of their face, under their cap. */
export function floorElevation(height: FloorWallHeight): number {
    return FACADE_FACE_HEIGHT + wallRise(height satisfies WallHeight);
}

/**
 * How much a stair goes up, in pixels: from the ground to the top of walls of 2, 3 or 4 tiles (52, 84, 116), or
 * between two such tops, 1 or 2 tiles apart (32, 64). The names of the catalogs tell it `h2`..`h4` and `m1`, `m2`.
 */
export const STAIR_RISES = [32, 52, 64, 84, 116] as const;
export type StairRise = (typeof STAIR_RISES)[number];
const STAIR_RISE_NAMES: Record<StairRise, string> = { 32: "m1", 52: "h2", 64: "m2", 84: "h3", 116: "h4" };

/** Direction a stair goes up towards ("o" is the west, as in the names of the catalogs). */
export const STAIR_DIRECTIONS = ["n", "e", "s", "o"] as const;
export type StairDirection = (typeof STAIR_DIRECTIONS)[number];
export type StairWidth = 1 | 2;

export interface StairShape {
    direction: StairDirection;
    /** In tiles, across the stair. */
    width: StairWidth;
    /** How much it goes up, in pixels. */
    rise: StairRise;
    /** Whether its side is open (only its stringer is drawn, the ground shows under it) instead of full. */
    open: boolean;
}

export type FloorPiece = { kind: "slab"; family: FloorFamily } | ({ kind: "stair" } & StairShape);

export interface TilePoint {
    x: number;
    y: number;
}
export interface PixelBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function slabPrefabName(family: FloorFamily): string {
    return `dalle-${family}`;
}

export function stairPrefabName(stair: StairShape): string {
    return `escalier-${stair.direction}-l${stair.width}-${STAIR_RISE_NAMES[stair.rise]}${stair.open ? "-vide" : ""}`;
}

const SLAB_NAME = new RegExp(`^dalle-(${MAP_LAYER_FLOOR_FAMILIES.join("|")})$`);
const STAIR_NAME = /^escalier-(n|e|s|o)-l([12])-(h[2-4]|m[12])(-vide)?$/;

/** Reads the meaning of a placed prefab. Returns undefined for anything that is not a slab or a stair. */
export function parseFloorPiece(collectionName: string, prefabId: string): FloorPiece | undefined {
    const prefix = `${MAP_LAYER_FLOOR_SLAB_COLLECTION}:`;
    const suffix = ":Default:Down";
    if (
        collectionName !== MAP_LAYER_FLOOR_SLAB_COLLECTION ||
        !prefabId.startsWith(prefix) ||
        !prefabId.endsWith(suffix)
    ) {
        return undefined;
    }
    const name = prefabId.slice(prefix.length, -suffix.length);
    const family = MAP_LAYER_FLOOR_FAMILIES.find((candidate) => candidate === SLAB_NAME.exec(name)?.[1]);
    if (family) return { kind: "slab", family };
    const stair = STAIR_NAME.exec(name);
    const direction = STAIR_DIRECTIONS.find((candidate) => candidate === stair?.[1]);
    const rise = STAIR_RISES.find((candidate) => STAIR_RISE_NAMES[candidate] === stair?.[3]);
    if (!stair || !direction || !rise) return undefined;
    return { kind: "stair", direction, width: stair[2] === "2" ? 2 : 1, rise, open: stair[4] !== undefined };
}

/**
 * Length of a stair on the ground, in tiles: one per tile it goes up (rounded up). Going south, the avatar goes down the screen by
 * its run and up by its rise: one more tile keeps it going down.
 */
export function stairRun(direction: StairDirection, rise: StairRise): number {
    const tiles = Math.ceil(rise / MAP_LAYER_TILE_SIZE);
    return direction === "s" ? tiles + 1 : tiles;
}

/**
 * What a stair covers on the ground. `foot` is the tile of its first step: the southernmost of a stair going north, the
 * westernmost of one going east, and so on. A stair 2 tiles wide spreads from it to the east (north, south) or to the
 * south (east, west).
 */
export function stairGroundBox(stair: StairShape, foot: TilePoint): PixelBox {
    const size = MAP_LAYER_TILE_SIZE;
    const run = stairRun(stair.direction, stair.rise) * size;
    const across = stair.width * size;
    switch (stair.direction) {
        case "n":
            return { x: foot.x * size, y: (foot.y + 1) * size - run, width: across, height: run };
        case "s":
            return { x: foot.x * size, y: foot.y * size, width: across, height: run };
        case "e":
            return { x: foot.x * size, y: foot.y * size, width: run, height: across };
        case "o":
            return { x: (foot.x + 1) * size - run, y: foot.y * size, width: run, height: across };
    }
}

/**
 * What a stair covers on the screen: going north it is longer than its run by its rise, going south shorter; going
 * east or west, the box around its slanted band.
 */
export function stairScreenBox(stair: StairShape, foot: TilePoint): PixelBox {
    const ground = stairGroundBox(stair, foot);
    const rise = stair.rise;
    if (stair.direction === "s") return { ...ground, height: ground.height - rise };
    return { ...ground, y: ground.y - rise, height: ground.height + rise };
}

/** Altitude of the stair above a point of the ground: 0 at its foot, the altitude of its floor at its top. */
export function stairElevationAt(stair: StairShape, foot: TilePoint, ground: { x: number; y: number }): number {
    const box = stairGroundBox(stair, foot);
    let progress: number;
    switch (stair.direction) {
        case "n":
            progress = (box.y + box.height - ground.y) / box.height;
            break;
        case "s":
            progress = (ground.y - box.y) / box.height;
            break;
        case "e":
            progress = (ground.x - box.x) / box.width;
            break;
        case "o":
            progress = (box.x + box.width - ground.x) / box.width;
            break;
    }
    return Math.min(1, Math.max(0, progress)) * stair.rise;
}

/** Size of the image of a piece: a slab is a tile with its thickness under it, a stair what it shows on the screen. */
export const SLAB_THICKNESS = 8;
export function floorPieceSize(piece: FloorPiece): { width: number; height: number } {
    if (piece.kind === "slab") return { width: MAP_LAYER_TILE_SIZE, height: MAP_LAYER_TILE_SIZE + SLAB_THICKNESS };
    const box = stairScreenBox(piece, { x: 0, y: 0 });
    return { width: box.width, height: box.height };
}

/** The heights of walls, one over the other, whose tops add up to an altitude; undefined when none do (3 at most). */
function wallHeightsReaching(elevation: number, terms: number, from = 0): FloorWallHeight[] | undefined {
    for (let i = from; i < FLOOR_WALL_HEIGHTS.length; i++) {
        const height = FLOOR_WALL_HEIGHTS[i];
        const rest = elevation - floorElevation(height);
        if (rest === 0 && terms === 1) return [height];
        if (rest > 0 && terms > 1) {
            const above = wallHeightsReaching(rest, terms - 1, i);
            if (above) return [height, ...above];
        }
    }
    return undefined;
}

/**
 * A floor told by the height, in tiles, of the walls that carry it: "2", "3" or "4" on walls standing on the ground
 * (52, 84, 116 px), "2+3" on walls of 3 tiles standing on a floor of walls of 2, and so on. Any other altitude is told
 * in tiles ("5", "3.5").
 */
export function floorLevelTiles(elevation: number): string {
    for (const terms of [1, 2, 3]) {
        const heights = wallHeightsReaching(elevation, terms);
        if (heights) return heights.join("+");
    }
    const tiles = (elevation - floorElevation(2)) / MAP_LAYER_TILE_SIZE + 2;
    return Number.isInteger(tiles) ? String(tiles) : tiles.toFixed(1);
}
