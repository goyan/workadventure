import { TERRAIN_CELL, TILE_PX } from "../types";
import type { WAMFileFormat } from "../types";
import { cellMaskOf } from "./CellMask";
import { cellOf } from "./TerrainGrid";

/**
 * A bridge is a raised floor one walks up to from the ground: the slabs of the "Map" tool (`Carte Paliers`) reached
 * by a stair or a ramp standing on the ground. What walks on the land crosses the water on it.
 *
 * The server reads the names and the places of the pieces (play: MapLayerFloors, a test of the front checks that
 * both agree). A piece is placed where its image is drawn: its altitude further north than the ground it covers.
 */
export const RAISED_FLOOR_COLLECTION = "Carte Paliers";

const SLAB_NAME = /^dalle-/;
const STAIR_NAME = /^(?:escalier|rampe)-(n|e|s|o)-l([12])-(h[1-4]|m[12])(-v2)?(?:-vide)?$/;
const RISES: Record<string, number> = { h1: 20, m1: 32, h2: 52, m2: 64, h3: 84, h4: 116 };

interface GroundStair {
    direction: "n" | "e" | "s" | "o";
    rise: number;
    /** What it covers on the ground, in map pixels. */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Bridges {
    /** The tiles of the ground under the decks and their stairs, as "x,y" in tiles. */
    tiles: Set<string>;
    /** How high over the ground one walks above a point of the ground (map pixels): 0 off the bridges. */
    elevationAt(x: number, y: number): number;
}

function pieceName(entity: { prefabRef?: { collectionName: string; id: string } }): string | undefined {
    const ref = entity.prefabRef;
    const prefix = `${RAISED_FLOOR_COLLECTION}:`;
    const suffix = ":Default:Down";
    if (ref?.collectionName !== RAISED_FLOOR_COLLECTION || !ref.id.startsWith(prefix) || !ref.id.endsWith(suffix)) {
        return undefined;
    }
    return ref.id.slice(prefix.length, ref.id.length - suffix.length);
}

/** A stair standing on the ground, from where its image is drawn. */
function groundStair(name: string, x: number, y: number): GroundStair | undefined {
    const match = STAIR_NAME.exec(name);
    const rise = match ? RISES[match[3]] : undefined;
    if (!match || rise === undefined) return undefined;
    const direction = match[1] as GroundStair["direction"];
    const tiles = Math.ceil(rise / TILE_PX);
    const run = (match[4] && direction !== "s" ? 1 : direction === "s" ? tiles + 1 : tiles) * TILE_PX;
    const across = Number(match[2]) * TILE_PX;
    const upright = direction === "n" || direction === "s";
    // Going south the image is shorter than the run; otherwise it starts the rise further north than the ground.
    const groundY = direction === "s" ? y : y + rise;
    if (x % TILE_PX !== 0 || groundY % TILE_PX !== 0) return undefined;
    return { direction, rise, x, y: groundY, width: upright ? across : run, height: upright ? run : across };
}

function tilesOf(box: { x: number; y: number; width: number; height: number }): { x: number; y: number }[] {
    const tiles = [];
    for (let x = box.x / TILE_PX; x < (box.x + box.width) / TILE_PX; x++) {
        for (let y = box.y / TILE_PX; y < (box.y + box.height) / TILE_PX; y++) tiles.push({ x, y });
    }
    return tiles;
}

/** The tiles one steps onto at the top of a stair: just beyond its top end, across its width. */
function arrivalTiles(stair: GroundStair): { x: number; y: number }[] {
    const left = stair.x / TILE_PX;
    const top = stair.y / TILE_PX;
    const columns = stair.width / TILE_PX;
    const rows = stair.height / TILE_PX;
    const tiles = [];
    if (stair.direction === "n" || stair.direction === "s") {
        const y = stair.direction === "n" ? top - 1 : top + rows;
        for (let x = left; x < left + columns; x++) tiles.push({ x, y });
    } else {
        const x = stair.direction === "e" ? left + columns : left - 1;
        for (let y = top; y < top + rows; y++) tiles.push({ x, y });
    }
    return tiles;
}

function stairElevationAt(stair: GroundStair, x: number, y: number): number {
    const progress =
        stair.direction === "n"
            ? (stair.y + stair.height - y) / stair.height
            : stair.direction === "s"
              ? (y - stair.y) / stair.height
              : stair.direction === "e"
                ? (x - stair.x) / stair.width
                : (stair.x + stair.width - x) / stair.width;
    return Math.min(1, Math.max(0, progress)) * stair.rise;
}

const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
] as const;

/**
 * The bridges of a map: the stairs and ramps standing on the ground, and the slabs of the floor each one reaches,
 * as far as they touch each other. A floor no stair of the ground reaches is no bridge (a roof, an upper storey).
 */
export function bridgesOf(wam: Pick<WAMFileFormat, "entities"> | undefined): Bridges {
    const slabs = new Map<number, Set<string>>();
    const stairs: GroundStair[] = [];
    for (const entity of Object.values(wam?.entities ?? {})) {
        const name = entity ? pieceName(entity) : undefined;
        if (!entity || name === undefined) continue;
        const elevation = entity.elevation ?? 0;
        if (SLAB_NAME.test(name)) {
            const x = entity.x / TILE_PX;
            const y = (entity.y + elevation) / TILE_PX;
            if (elevation <= 0 || !Number.isInteger(x) || !Number.isInteger(y)) continue;
            let level = slabs.get(elevation);
            if (!level) slabs.set(elevation, (level = new Set()));
            level.add(`${x},${y}`);
        } else if (elevation === 0) {
            const stair = groundStair(name, entity.x, entity.y);
            if (stair) stairs.push(stair);
        }
    }
    const decks = new Map<string, number>();
    const tiles = new Set<string>();
    const used: GroundStair[] = [];
    for (const stair of stairs) {
        const level = slabs.get(stair.rise);
        const queue = arrivalTiles(stair).filter((tile) => level?.has(`${tile.x},${tile.y}`));
        if (!level || queue.length === 0) continue;
        used.push(stair);
        for (const tile of tilesOf(stair)) tiles.add(`${tile.x},${tile.y}`);
        while (queue.length > 0) {
            const tile = queue.pop();
            if (!tile) break;
            const key = `${tile.x},${tile.y}`;
            if (decks.has(key) || !level.has(key)) continue;
            decks.set(key, stair.rise);
            tiles.add(key);
            for (const [dx, dy] of SIDES) queue.push({ x: tile.x + dx, y: tile.y + dy });
        }
    }
    return {
        tiles,
        elevationAt: (x, y) => {
            const deck = decks.get(`${Math.floor(x / TILE_PX)},${Math.floor(y / TILE_PX)}`);
            if (deck !== undefined) return deck;
            for (const stair of used) {
                if (x >= stair.x && x < stair.x + stair.width && y >= stair.y && y < stair.y + stair.height) {
                    return stairElevationAt(stair, x, y);
                }
            }
            return 0;
        },
    };
}

/** The tiles of the ground under the bridges of a map (see bridgesOf), as "x,y" in tiles. */
export function bridgeTilesOf(wam: Pick<WAMFileFormat, "entities"> | undefined): Set<string> {
    return bridgesOf(wam).tiles;
}

/**
 * The water as what walks sees it: `depthAt` (pixels of water over a cell of the relief), and none over the cells of
 * a tile under a bridge. The water itself when the map has no bridge.
 */
export function dryOnBridges(
    depthAt: (cellX: number, cellY: number) => number,
    bridges: ReadonlySet<string>,
): (cellX: number, cellY: number) => number {
    if (bridges.size === 0) return depthAt;
    const cellsPerTile = TILE_PX / TERRAIN_CELL;
    // Asked for every cell of the map each time the land is read: a mask of the tiles, not a key of text a cell.
    const underBridge = cellMaskOf([...bridges].map((key) => cellOf(key)));
    return (cellX, cellY) =>
        underBridge(Math.floor(cellX / cellsPerTile), Math.floor(cellY / cellsPerTile)) ? 0 : depthAt(cellX, cellY);
}
