import { TERRAIN_CELL, TILE_PX } from "../types";
import type { WAMFileFormat } from "../types";
import { cellKey } from "./TerrainGrid";
import type { WaterWallSides } from "./WaterGrid";

/**
 * The walls of the "Map" tool, read from the objects of the map for the water of the relief. The server knows
 * nothing of the catalogues nor of the editor: it reads the names of the pieces, as the front does to rebuild its
 * model of the walls (play: MapLayerCatalog.parseMapLayerPrefab, MapLayerOperations.modelFromPlacedPrefabs,
 * MapLayerBarriers.wallBarriers — a test of the front checks that both agree).
 *
 * - A horizontal wall (`facade-…`) or a window (`fenetre-…`) fills the tile row of its line; its foot, the south side
 *   of that tile, holds the water.
 * - A vertical wall (`mur-vertical-…`) holds it on the row under its first vertex, between the columns on each side
 *   of its line.
 * - A door is not a wall: the water goes through it, open or closed. The walls of a raised floor (collections
 *   `… Paliers`, or an object with an elevation) are not on the ground.
 */
const WALL_COLLECTION = "Carte Murs";
const WINDOW_COLLECTION = "Carte Fenêtres";
/** A wall is this thick, in pixels: its pieces are drawn half of it off the grid line. */
const WALL_THICKNESS = 12;
const WALL_HALF = WALL_THICKNESS / 2;
const HEIGHT = "(?:-h([2-4]))?";
const FACADE_NAME = new RegExp(`^(?:facade|fenetre)-[a-z]+-(mid|left|right|single)${HEIGHT}$`);
const VERTICAL_NAME = new RegExp(`^mur-vertical-[a-z]+${HEIGHT}$`);

/** The walls of a map for its water, with a signature that changes when they do. */
export interface WaterWalls extends WaterWallSides {
    signature: string;
}

export function waterWallsOf(wam: Pick<WAMFileFormat, "entities"> | undefined): WaterWalls {
    const east = new Set<string>();
    const south = new Set<string>();
    const cellsATile = TILE_PX / TERRAIN_CELL;
    for (const entity of Object.values(wam?.entities ?? {})) {
        const collection = entity?.prefabRef?.collectionName;
        if (collection !== WALL_COLLECTION && collection !== WINDOW_COLLECTION) continue;
        if ((entity.elevation ?? 0) > 0) continue;
        const prefix = `${collection}:`;
        const suffix = ":Default:Down";
        const id = entity.prefabRef.id;
        if (!id.startsWith(prefix) || !id.endsWith(suffix)) continue;
        const name = id.slice(prefix.length, id.length - suffix.length);
        const facade = FACADE_NAME.exec(name);
        if (facade) {
            // The sprite may start left of its column (an end piece), and is drawn higher for a high wall.
            const rise = TILE_PX * (Number(facade[2] ?? 1) - 1);
            const x = (entity.x + (facade[1] === "left" || facade[1] === "single" ? WALL_HALF : 0)) / TILE_PX;
            let y = (entity.y + rise) / TILE_PX;
            // Walls of height 1 drawn when the cap was centred on the line, half a wall higher.
            if (!Number.isInteger(y) && rise === 0) y = (entity.y + WALL_HALF) / TILE_PX;
            if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
            for (let cell = 0; cell < cellsATile; cell++) {
                south.add(cellKey(x * cellsATile + cell, y * cellsATile + cellsATile - 1));
            }
            continue;
        }
        const vertical = collection === WALL_COLLECTION ? VERTICAL_NAME.exec(name) : null;
        if (vertical) {
            const rise = TILE_PX * (Number(vertical[1] ?? 1) - 1);
            const x = (entity.x + WALL_HALF) / TILE_PX;
            let y = (entity.y + rise - WALL_THICKNESS) / TILE_PX;
            if (!Number.isInteger(y) && rise === 0) y = (entity.y - WALL_HALF) / TILE_PX;
            if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
            // The west side of the tile (x, y + 1): the east side of the last cell of the column before.
            for (let cell = 0; cell < cellsATile; cell++) {
                east.add(cellKey(x * cellsATile - 1, (y + 1) * cellsATile + cell));
            }
        }
    }
    const signature = `${[...east].sort().join(";")}|${[...south].sort().join(";")}`;
    return { east, south, signature };
}
