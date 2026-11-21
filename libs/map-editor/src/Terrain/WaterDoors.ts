import { TILE_PX } from "../types";
import type { WAMFileFormat } from "../types";
import { doorLeavesOf } from "./LandWalls";
import type { WaterWallSides } from "./WaterGrid";

/**
 * A door of the ground of a map, for the water of the relief: closed, it holds the water like the wall it stands
 * in; open, the water goes through. The server knows no animation: a door is open while an avatar stands in its
 * passage, as it is on the screens (play: DoorAnimator opens it for who crosses it).
 */
export interface WaterDoor {
    /** The sides of cells it closes (keys of cellKey), as the walls of the water are told. */
    east: string[];
    south: string[];
    /** Its passage, in map pixels: who stands there holds it open. */
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** How far on each side of its wall line the passage of a door reaches, in pixels: half a tile. */
const PASSAGE_REACH = TILE_PX / 2;

/**
 * The doors of the ground of a map: the leaves that touch on the same wall line make one door (a door has two
 * leaves, which open together).
 */
export function waterDoorsOf(wam: Pick<WAMFileFormat, "entities"> | undefined): WaterDoor[] {
    const leaves = doorLeavesOf(wam).sort(
        (a, b) => a.orientation.localeCompare(b.orientation) || a.line - b.line || a.along - b.along,
    );
    const doors: WaterDoor[] = [];
    let last: { orientation: string; line: number; along: number } | undefined;
    for (const leaf of leaves) {
        // The tile of the leaf, widened across its wall line: the doorway, and a step on each side of it.
        const rect =
            leaf.orientation === "h"
                ? {
                      left: leaf.along * TILE_PX,
                      right: (leaf.along + 1) * TILE_PX,
                      top: leaf.line * TILE_PX - PASSAGE_REACH,
                      bottom: (leaf.line + 1) * TILE_PX + PASSAGE_REACH,
                  }
                : {
                      left: leaf.line * TILE_PX - TILE_PX,
                      right: leaf.line * TILE_PX + TILE_PX,
                      top: leaf.along * TILE_PX,
                      bottom: (leaf.along + 1) * TILE_PX,
                  };
        const door = doors[doors.length - 1];
        if (
            door &&
            last &&
            last.orientation === leaf.orientation &&
            last.line === leaf.line &&
            leaf.along - last.along <= 1
        ) {
            door.east.push(...leaf.east);
            door.south.push(...leaf.south);
            door.left = Math.min(door.left, rect.left);
            door.top = Math.min(door.top, rect.top);
            door.right = Math.max(door.right, rect.right);
            door.bottom = Math.max(door.bottom, rect.bottom);
        } else {
            doors.push({ east: [...leaf.east], south: [...leaf.south], ...rect });
        }
        last = leaf;
    }
    return doors;
}

/** Whether someone at that point of the map (map pixels) stands in the passage of the door. */
export function holdsOpen(door: WaterDoor, walker: { x: number; y: number }): boolean {
    return walker.x >= door.left && walker.x <= door.right && walker.y >= door.top && walker.y <= door.bottom;
}

/** The sides of cells the closed doors hold the water at: those of the doors that are not `open`. */
export function closedDoorSides(doors: readonly WaterDoor[], open: (index: number) => boolean): WaterWallSides {
    const east = new Set<string>();
    const south = new Set<string>();
    doors.forEach((door, index) => {
        if (open(index)) return;
        for (const key of door.east) east.add(key);
        for (const key of door.south) south.add(key);
    });
    return { east, south };
}
