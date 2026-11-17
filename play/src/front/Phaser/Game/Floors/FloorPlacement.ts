import { FloorModel } from "../MapEditor/MapLayer/FloorModel";
import type { PlacedFloorPiece } from "../MapEditor/MapLayer/FloorModel";
import { levelUnderPoint } from "../MapEditor/MapLayer/FloorOperations";

/** Where the editor places the objects: on the floor drawn under them, or on a level chosen in the panel (0: the ground). */
export type PlacementLevel = "auto" | number;

/**
 * Altitude an object gets where its image is placed. With `auto`, the one of the highest raised floor drawn under its
 * foot (the middle of the bottom of its image), 0 where there is none. With a level, that level whatever is drawn
 * there: the ground to furnish the room under a floor, a floor that another one hides.
 */
export function placementElevation(
    placed: Iterable<PlacedFloorPiece>,
    image: { x: number; y: number; width: number; height: number },
    level: PlacementLevel,
): number {
    if (level !== "auto") return level;
    return levelUnderPoint(FloorModel.fromPlaced(placed), image.x + image.width / 2, image.y + image.height - 1);
}
