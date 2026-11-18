import type { WaterGrid } from "../Terrain/WaterGrid";
import { TERRAIN_CELL } from "../types";
import type { Animal } from "./Animal";
import { canSwimAcross, DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "./WaterBodies";
import type { WaterBodies } from "./WaterBodies";

/** An animal whose cell holds too little water dies after this long without finding some. */
export const DRY_DEATH_MS = 5000;
/** How far an animal looks for its next random target, in cells. */
export const WANDER_REACH_CELLS = 6;
/** A wandering animal swims between this share of the fastest speed and the fastest. */
const SLOWEST_SHARE = 0.4;

export const minDepthOf = (animal: Animal): number => (animal.kind === "dolphin" ? DOLPHIN_DEPTH_PX : FISH_DEPTH_PX);
export const cellAt = (pixel: number): number => Math.floor(pixel / TERRAIN_CELL);
const middleOf = (cell: number): number => cell * TERRAIN_CELL + TERRAIN_CELL / 2;

/**
 * Moves an animal for `dtMs` towards its target; it is given a new random one, in its body of water, when it has
 * none, reached it or cannot go on. It never enters a cell with too little water nor crosses a wall, so it stays in
 * its body of water. In a cell that dried up it flees to the deepest neighbour; false when it died there.
 */
export function swim(
    animal: Animal,
    bodies: WaterBodies,
    grid: WaterGrid,
    maxSpeedPxPerS: number,
    dtMs: number,
    now: number,
    random: () => number,
): boolean {
    const minDepth = minDepthOf(animal);
    const cellX = cellAt(animal.x);
    const cellY = cellAt(animal.y);
    if (!bodies.swimmable(cellX, cellY, minDepth)) {
        animal.dryAt ??= now;
        if (now - animal.dryAt >= DRY_DEATH_MS) return false;
        let best: { x: number; y: number; depth: number } | undefined;
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const depth = grid.depthAt(cellX + dx, cellY + dy);
            if (depth < minDepth || !canSwimAcross(grid, cellX, cellY, dx, dy)) continue;
            if (!best || depth > best.depth) best = { x: cellX + dx, y: cellY + dy, depth };
        }
        animal.targetX = animal.targetY = undefined;
        if (!best) return true;
        // Stranded, it only has to reach the middle of the wet cell next to it.
        advance(animal, middleOf(best.x), middleOf(best.y), (maxSpeedPxPerS * dtMs) / 1000, () => true);
        return true;
    }
    animal.dryAt = undefined;
    const reached =
        animal.targetX !== undefined &&
        animal.targetY !== undefined &&
        Math.hypot(animal.targetX - animal.x, animal.targetY - animal.y) < 1;
    if (animal.targetX === undefined || animal.targetY === undefined || reached) {
        const cell = bodies.randomCell(
            bodies.bodyAt(cellX, cellY),
            { cellX, cellY },
            WANDER_REACH_CELLS,
            minDepth,
            random,
        );
        if (!cell) return true;
        // Anywhere in the cell but its very edge.
        animal.targetX = (cell.cellX + 0.2 + 0.6 * random()) * TERRAIN_CELL;
        animal.targetY = (cell.cellY + 0.2 + 0.6 * random()) * TERRAIN_CELL;
        animal.speed = maxSpeedPxPerS * (SLOWEST_SHARE + (1 - SLOWEST_SHARE) * random());
    }
    const speed = Math.max(0, animal.speed ?? maxSpeedPxPerS);
    const open = (fromX: number, fromY: number, dx: number, dy: number): boolean =>
        canSwimAcross(grid, fromX, fromY, dx, dy) && bodies.swimmable(fromX + dx, fromY + dy, minDepth);
    const arrived = advance(animal, animal.targetX, animal.targetY, (speed * dtMs) / 1000, (fromX, fromY, toX, toY) => {
        const dx = toX - fromX;
        const dy = toY - fromY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
        if (dx === 0 || dy === 0) return open(fromX, fromY, dx, dy);
        // A corner: by one of the two cells beside it.
        return (
            (open(fromX, fromY, dx, 0) && open(fromX + dx, fromY, 0, dy)) ||
            (open(fromX, fromY, 0, dy) && open(fromX, fromY + dy, dx, 0))
        );
    });
    // Stopped on its way: another target next time.
    if (!arrived) animal.targetX = animal.targetY = undefined;
    return true;
}

/**
 * Goes towards a point by sub-steps of half a cell at most, so that no cell is jumped over; `mayEnter` tells whether
 * the next cell can be entered from the current one. False when it was stopped before the end of its move.
 */
function advance(
    animal: Animal,
    toX: number,
    toY: number,
    distance: number,
    mayEnter: (fromX: number, fromY: number, toCellX: number, toCellY: number) => boolean,
): boolean {
    let remaining = distance;
    while (remaining > 0) {
        const left = Math.hypot(toX - animal.x, toY - animal.y);
        if (left < 1e-6) return true;
        const length = Math.min(remaining, left, TERRAIN_CELL / 2);
        const x = animal.x + ((toX - animal.x) / left) * length;
        const y = animal.y + ((toY - animal.y) / left) * length;
        const fromX = cellAt(animal.x);
        const fromY = cellAt(animal.y);
        if ((cellAt(x) !== fromX || cellAt(y) !== fromY) && !mayEnter(fromX, fromY, cellAt(x), cellAt(y))) return false;
        animal.x = x;
        animal.y = y;
        remaining -= length;
    }
    return true;
}
