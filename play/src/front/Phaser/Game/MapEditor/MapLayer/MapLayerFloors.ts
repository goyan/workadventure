import { FACADE_FACE_HEIGHT, MAP_LAYER_FLOOR_FAMILIES, MAP_LAYER_TILE_SIZE, wallRise } from "./MapLayerCatalog";
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
export const MAP_LAYER_FLOOR_SLAB_COLLECTION = "Carte Paliers";

/** Heights of the walls that can carry a floor: under a wall of height 1 nobody could walk. */
export const FLOOR_WALL_HEIGHTS = [2, 3, 4] as const;
export type FloorWallHeight = (typeof FLOOR_WALL_HEIGHTS)[number];

/** Altitude of a floor laid on walls of this height: the top of their face, under their cap. */
export function floorElevation(height: FloorWallHeight): number {
    return FACADE_FACE_HEIGHT + wallRise(height satisfies WallHeight);
}

/** Direction a stair goes up towards ("o" is the west, as in the names of the catalogs). */
export const STAIR_DIRECTIONS = ["n", "e", "s", "o"] as const;
export type StairDirection = (typeof STAIR_DIRECTIONS)[number];
export type StairWidth = 1 | 2;

export interface StairShape {
    direction: StairDirection;
    /** In tiles, across the stair. */
    width: StairWidth;
    /** Height of the walls of the floor it goes up to. */
    height: FloorWallHeight;
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
    return `escalier-${stair.direction}-l${stair.width}-h${stair.height}${stair.open ? "-vide" : ""}`;
}

const SLAB_NAME = new RegExp(`^dalle-(${MAP_LAYER_FLOOR_FAMILIES.join("|")})$`);
const STAIR_NAME = /^escalier-(n|e|s|o)-l([12])-h([2-4])(-vide)?$/;

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
    const height = FLOOR_WALL_HEIGHTS.find((candidate) => String(candidate) === stair?.[3]);
    if (!stair || !direction || !height) return undefined;
    return { kind: "stair", direction, width: stair[2] === "2" ? 2 : 1, height, open: stair[4] !== undefined };
}

/**
 * Length of a stair on the ground, in tiles: one per tile of height. Going south, the avatar goes down the screen by
 * its run and up by its rise: one more tile keeps it going down.
 */
export function stairRun(direction: StairDirection, height: FloorWallHeight): number {
    return direction === "s" ? height + 1 : height;
}

/**
 * What a stair covers on the ground. `foot` is the tile of its first step: the southernmost of a stair going north, the
 * westernmost of one going east, and so on. A stair 2 tiles wide spreads from it to the east (north, south) or to the
 * south (east, west).
 */
export function stairGroundBox(stair: StairShape, foot: TilePoint): PixelBox {
    const size = MAP_LAYER_TILE_SIZE;
    const run = stairRun(stair.direction, stair.height) * size;
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
    const rise = floorElevation(stair.height);
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
    return Math.min(1, Math.max(0, progress)) * floorElevation(stair.height);
}
