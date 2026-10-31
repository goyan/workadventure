import { TileBarriers } from "../../../../Utils/TileBarriers";
import { WALL_COLLISION_HALF } from "./MapLayerCatalog";
import { doorEdges } from "./MapLayerModel";
import { modelFromPlacedPrefabs } from "./MapLayerOperations";
import type { PlacedPrefabLike } from "./MapLayerOperations";

/**
 * The walls of the map layer, as barriers between tiles, for the pathfinder. The tiles are those of the feet of the
 * avatar, whose body reaches 16 px above them, and the barriers follow what the collisions of the catalog really block:
 * - A horizontal wall stands on the tile row of its line, with the floor under it that the avatar can reach from the
 *   north. Its collision is the foot of the wall: it separates its tile from the one south of it.
 * - The collision of a vertical wall begins 14 px under the top of its sprite and goes on for 32 px: the feet of the
 *   avatar are stopped on the row under the one where the wall is drawn, which is also the row of the wall it ends on.
 *   It separates the tile west of its line from the one east of it, on that row.
 */
export function wallBarriers(placedPrefabs: Iterable<PlacedPrefabLike>): TileBarriers {
    const barriers = new TileBarriers(WALL_COLLISION_HALF);
    const model = modelFromPlacedPrefabs(placedPrefabs);
    for (const wall of model.getWalls()) {
        // A door is always passable: it opens when something comes near.
        if (model.getDoorOn(wall.orientation, wall.x, wall.y)) {
            continue;
        }
        if (wall.orientation === "h") {
            barriers.addSouthBorder(wall.x, wall.y);
        } else {
            barriers.addWestBorder(wall.x, wall.y + 1);
        }
    }
    // A vertical door is wider than the way through it: the avatar stands lower than its sprite, so the end of the
    // doorway, under the last leaf, is closed by a collision of the catalog (see `Carte Portes`). The pathfinder only
    // goes through the first tile row of the door, which is also the middle of the way.
    for (const door of model.getDoors()) {
        if (door.orientation === "v") {
            const last = doorEdges(door)[1];
            barriers.addWestBorder(last.x, last.y + 1);
        }
    }
    return barriers;
}
