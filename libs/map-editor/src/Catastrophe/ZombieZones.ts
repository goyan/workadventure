import { TILE_PX } from "../types";
import type { AreaData, WAMFileFormat } from "../types";
import { doorLeavesOf } from "../Terrain/LandWalls";
import type { DoorLeaf } from "../Terrain/LandWalls";

/**
 * The parts of a map a horde of zombies keeps out of: the personal areas (the desks of the players), and the areas
 * locked by those inside them, with the doors of each (a door of the "Map" tool that belongs to it, as the doors of a
 * locked area do for the padlocks: play, DoorAnimator.isDoorInZone). A desk is never entered, a locked door never
 * passed: the horde packs at its edge, before its closed doors, round the avatar who sits there.
 *
 * Read by the server only (the areas and their locks are its own), a tile (32 px) each, and told in the log of the
 * horde (ZombieLogEntry.forbidOn, forbidOff): every browser keeps the same zombies out of the same tiles at the same
 * step. Only the areas of the ground: those of a raised floor (`elevation`) are over the horde.
 */

/** A rectangle of the map, in pixels. */
interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Where the leaf of a door stands, on the ground (the tile row of its wall for a horizontal one, astride its line). */
function leafRect(leaf: DoorLeaf): Rect {
    if (leaf.orientation === "h") {
        return {
            left: leaf.along * TILE_PX,
            top: leaf.line * TILE_PX,
            right: (leaf.along + 1) * TILE_PX,
            bottom: (leaf.line + 1) * TILE_PX,
        };
    }
    return {
        left: leaf.line * TILE_PX - TILE_PX / 2,
        top: leaf.along * TILE_PX,
        right: leaf.line * TILE_PX + TILE_PX / 2,
        bottom: (leaf.along + 1) * TILE_PX,
    };
}

/**
 * Whether the leaf of a door belongs to an area: it overlaps it, or touches it across its wall, as the doors of a room
 * sit on the border of its area; a leaf that only touches it along its wall belongs to the next room on that line.
 * The rule of the padlocks (play, DoorAnimator.isDoorInZone), a leaf at a time.
 */
export function zombieLeafInArea(leaf: DoorLeaf, area: Pick<AreaData, "x" | "y" | "width" | "height">): boolean {
    const rect = leafRect(leaf);
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    const acrossX = rect.left < right && rect.right > area.x;
    const acrossY = rect.top < bottom && rect.bottom > area.y;
    const touchesX = rect.left <= right && rect.right >= area.x;
    const touchesY = rect.top <= bottom && rect.bottom >= area.y;
    return leaf.orientation === "h" ? acrossX && touchesY : touchesX && acrossY;
}

/** The tiles a leaf of a door closes: its own for a horizontal one, both sides of its line for a vertical one. */
function leafTiles(leaf: DoorLeaf): [number, number][] {
    return leaf.orientation === "h"
        ? [[leaf.along, leaf.line]]
        : [
              [leaf.line - 1, leaf.along],
              [leaf.line, leaf.along],
          ];
}

/**
 * The tiles of a map `tilesWide` x `tilesHigh` (row by row, in growing order) a horde keeps out of now: those of the
 * personal areas and of the areas `locked` tells locked (by the area and its lockable property), the tiles whose
 * middle is in the area, and the tiles of their doors.
 */
export function zombieForbiddenTilesOf(
    wam: Pick<WAMFileFormat, "areas" | "entities"> | undefined,
    locked: (areaId: string, propertyId: string) => boolean,
    tilesWide: number,
    tilesHigh: number,
): number[] {
    const tiles = new Set<number>();
    const add = (tileX: number, tileY: number): void => {
        if (tileX >= 0 && tileY >= 0 && tileX < tilesWide && tileY < tilesHigh) tiles.add(tileY * tilesWide + tileX);
    };
    let leaves: DoorLeaf[] | undefined;
    for (const area of wam?.areas ?? []) {
        if ((area.elevation ?? 0) > 0) continue;
        const kept = area.properties.some(
            (property) =>
                property.type === "personalAreaPropertyData" ||
                (property.type === "lockableAreaPropertyData" && locked(area.id, property.id)),
        );
        if (!kept || !(area.width > 0) || !(area.height > 0)) continue;
        const fromX = Math.max(0, Math.ceil(area.x / TILE_PX - 0.5));
        const toX = Math.min(tilesWide - 1, Math.floor((area.x + area.width) / TILE_PX - 0.5));
        const fromY = Math.max(0, Math.ceil(area.y / TILE_PX - 0.5));
        const toY = Math.min(tilesHigh - 1, Math.floor((area.y + area.height) / TILE_PX - 0.5));
        for (let tileY = fromY; tileY <= toY; tileY++) {
            for (let tileX = fromX; tileX <= toX; tileX++) {
                // Its middle strictly inside the area.
                const middleX = (tileX + 0.5) * TILE_PX;
                const middleY = (tileY + 0.5) * TILE_PX;
                if (
                    middleX > area.x &&
                    middleX < area.x + area.width &&
                    middleY > area.y &&
                    middleY < area.y + area.height
                )
                    add(tileX, tileY);
            }
        }
        leaves ??= doorLeavesOf(wam);
        for (const leaf of leaves) {
            if (!zombieLeafInArea(leaf, area)) continue;
            for (const [tileX, tileY] of leafTiles(leaf)) add(tileX, tileY);
        }
    }
    return [...tiles].sort((a, b) => a - b);
}
