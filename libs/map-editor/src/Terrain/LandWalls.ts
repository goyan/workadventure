import { TERRAIN_CELL, TILE_PX } from "../types";
import type { WAMFileFormat } from "../types";
import { cellKey } from "./TerrainGrid";
import { waterWallsOf } from "./WaterWalls";
import type { WaterWalls } from "./WaterWalls";

/**
 * The walls of the "Map" tool for what walks on the land of the map: those the water reads (waterWallsOf), with
 * the doors closed. A door stands on two wall segments, a leaf on each; as for the walls, the server reads the
 * names and the places of the pieces (play: MapLayerCatalog, a test of the front checks that both agree).
 *
 * - A leaf of a horizontal door (`porte-h-…-g`, `-d`) fills the tile row of its line, like a facade.
 * - A leaf of a vertical door (`porte-v-…-haut`, `-bas`) is two tiles wide, centred on its line, and stands like a
 *   vertical wall.
 */
const DOOR_COLLECTION = "Carte Portes";
const WALL_THICKNESS = 12;
const DOOR_NAME = /^porte-(h|v)-[a-z]+-(?:g|d|haut|bas)(?:-vitree)?(?:-h([2-4]))?(?:-b?\d)?$/;

export function landWallsOf(wam: Pick<WAMFileFormat, "entities"> | undefined): WaterWalls {
    const walls = waterWallsOf(wam);
    const east = new Set(walls.east);
    const south = new Set(walls.south);
    const cellsATile = TILE_PX / TERRAIN_CELL;
    for (const entity of Object.values(wam?.entities ?? {})) {
        if (entity?.prefabRef?.collectionName !== DOOR_COLLECTION) continue;
        if ((entity.elevation ?? 0) > 0) continue;
        const prefix = `${DOOR_COLLECTION}:`;
        const suffix = ":Default:Down";
        const id = entity.prefabRef.id;
        if (!id.startsWith(prefix) || !id.endsWith(suffix)) continue;
        const door = DOOR_NAME.exec(id.slice(prefix.length, id.length - suffix.length));
        if (!door) continue;
        const rise = TILE_PX * (Number(door[2] ?? 1) - 1);
        if (door[1] === "h") {
            const x = entity.x / TILE_PX;
            const y = (entity.y + rise) / TILE_PX;
            if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
            for (let cell = 0; cell < cellsATile; cell++) {
                south.add(cellKey(x * cellsATile + cell, y * cellsATile + cellsATile - 1));
            }
        } else {
            const x = (entity.x + TILE_PX) / TILE_PX;
            const y = (entity.y + rise - WALL_THICKNESS) / TILE_PX;
            if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
            for (let cell = 0; cell < cellsATile; cell++) {
                east.add(cellKey(x * cellsATile - 1, (y + 1) * cellsATile + cell));
            }
        }
    }
    const signature = `${[...east].sort().join(";")}|${[...south].sort().join(";")}`;
    return { east, south, signature };
}
