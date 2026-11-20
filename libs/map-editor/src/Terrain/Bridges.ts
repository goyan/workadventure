import { TERRAIN_CELL, TILE_PX } from "../types";
import type { WAMFileFormat } from "../types";

/** The collection of the pieces of the bridges the "Map" tool lays: its name is a contract with the catalogs. */
export const BRIDGE_COLLECTION = "Carte Ponts";

/**
 * The tiles of the ground that carry a piece of a bridge, as "x,y" in tiles. What walks there walks dry, whatever
 * water runs under the deck.
 */
export function bridgeTilesOf(wam: Pick<WAMFileFormat, "entities"> | undefined): Set<string> {
    const tiles = new Set<string>();
    for (const entity of Object.values(wam?.entities ?? {})) {
        if (entity?.prefabRef?.collectionName !== BRIDGE_COLLECTION || (entity.elevation ?? 0) > 0) continue;
        tiles.add(`${Math.floor(entity.x / TILE_PX)},${Math.floor(entity.y / TILE_PX)}`);
    }
    return tiles;
}

/**
 * The water as what walks sees it: `depthAt` (pixels of water over a cell of the relief), and none over the cells of
 * a tile that carries a bridge. The water itself when the map has no bridge.
 */
export function dryOnBridges(
    depthAt: (cellX: number, cellY: number) => number,
    bridges: ReadonlySet<string>,
): (cellX: number, cellY: number) => number {
    if (bridges.size === 0) return depthAt;
    const cellsPerTile = TILE_PX / TERRAIN_CELL;
    return (cellX, cellY) =>
        bridges.has(`${Math.floor(cellX / cellsPerTile)},${Math.floor(cellY / cellsPerTile)}`)
            ? 0
            : depthAt(cellX, cellY);
}
