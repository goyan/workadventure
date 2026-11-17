import { FloorModel } from "../MapEditor/MapLayer/FloorModel";
import type { PlacedFloorPiece } from "../MapEditor/MapLayer/FloorModel";
import { levelUnderPoint } from "../MapEditor/MapLayer/FloorOperations";

/**
 * Altitude an object gets where its image is placed: the one of the highest raised floor drawn under its foot (the
 * middle of the bottom of its image), 0 where there is none. `onGround` leaves it on the ground whatever is drawn
 * there: the way to furnish the room under a floor.
 */
export function placementElevation(
    placed: Iterable<PlacedFloorPiece>,
    image: { x: number; y: number; width: number; height: number },
    onGround: boolean,
): number {
    if (onGround) return 0;
    return levelUnderPoint(FloorModel.fromPlaced(placed), image.x + image.width / 2, image.y + image.height - 1);
}
