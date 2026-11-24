import type { WaterView } from "../Terrain/WaterView";
import { TERRAIN_CELL } from "../types";
import type { Animal } from "./Animal";
import { SPECIES } from "./Species";
import type { Places } from "./WaterBodies";

/** An animal whose cell holds too little water dies after this long without finding some. */
export const DRY_DEATH_MS = 5000;
/** How far an animal looks for its next random target, in cells. */
export const WANDER_REACH_CELLS = 6;
/** A wandering animal swims between this share of the fastest speed and the fastest. */
const SLOWEST_SHARE = 0.4;

export const minDepthOf = (animal: Animal): number => SPECIES[animal.kind].minDepthPx;
/** The level of an animal in its places: the least water it swims in, or on land the water it does not go into. */
export const levelOf = (animal: Animal): number => {
    const species = SPECIES[animal.kind];
    return species.habitat === "land" ? (species.maxDepthPx ?? 0) : species.minDepthPx;
};
export const cellAt = (pixel: number): number => Math.floor(pixel / TERRAIN_CELL);
const middleOf = (cell: number): number => cell * TERRAIN_CELL + TERRAIN_CELL / 2;

/** How many cells a search for a way round looks at, at most: about 45 cells around the animal. */
export const ROUTE_MAX_CELLS = 8000;
/** An animal that found no way round does not look for one again before this long. */
export const ROUTE_RETRY_MS = 4000;
/** A way round is kept while what it led to stays within this many cells of where it was. */
const ROUTE_GOAL_DRIFT_CELLS = 2;

/** The way round an animal follows, point by point (map pixels), to the cell its target was in when it was found. */
interface Route {
    points: { x: number; y: number }[];
    at: number;
    goalCellX: number;
    goalCellY: number;
}
// Kept beside the animals, never saved nor sent: a way is found again after a restart.
const routes = new WeakMap<Animal, Route>();
const noRouteUntil = new WeakMap<Animal, number>();

type MayEnter = (fromX: number, fromY: number, toCellX: number, toCellY: number) => boolean;

/** Whether one goes straight from a point to another without being stopped. */
function sees(from: { x: number; y: number }, to: { x: number; y: number }, mayEnter: MayEnter): boolean {
    const walker = { x: from.x, y: from.y };
    return advance(walker, to.x, to.y, Math.hypot(to.x - from.x, to.y - from.y) + 1, mayEnter);
}

const ROUTE_STEPS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
] as const;

/**
 * A way from where an animal stands to a point it cannot go straight to: round the water it does not enter, by a
 * bridge when there is one. The cells are searched outwards from the animal (ROUTE_MAX_CELLS at most), then the way
 * is straightened: only its turns are kept. Undefined when the point is in another place, too far, or closed off.
 */
function findRoute(
    animal: Animal,
    toX: number,
    toY: number,
    bodies: Places,
    level: number,
    mayEnter: MayEnter,
): Route | undefined {
    const startX = cellAt(animal.x);
    const startY = cellAt(animal.y);
    const goalX = cellAt(toX);
    const goalY = cellAt(toY);
    const body = bodies.bodyAt(startX, startY);
    if (body === 0 || bodies.bodyAt(goalX, goalY) !== body || !bodies.passable(goalX, goalY, level)) return undefined;
    // The cells seen, each with the one it was reached from. Keys hold both coordinates of a cell.
    const keyOf = (cellX: number, cellY: number): number => (cellY + 32768) * 65536 + cellX + 32768;
    const from = new Map<number, number>();
    const start = keyOf(startX, startY);
    const goal = keyOf(goalX, goalY);
    from.set(start, start);
    const queue = [start];
    for (let head = 0; head < queue.length && !from.has(goal) && from.size < ROUTE_MAX_CELLS; head++) {
        const key = queue[head];
        const cellX = (key % 65536) - 32768;
        const cellY = Math.floor(key / 65536) - 32768;
        for (const [dx, dy] of ROUTE_STEPS) {
            const next = keyOf(cellX + dx, cellY + dy);
            if (from.has(next) || !mayEnter(cellX, cellY, cellX + dx, cellY + dy)) continue;
            from.set(next, key);
            queue.push(next);
        }
    }
    if (!from.has(goal)) return undefined;
    // From the goal back to the start, then the other way: the middles of the cells, the point itself at the end.
    const cells: { x: number; y: number }[] = [{ x: toX, y: toY }];
    for (let key = from.get(goal) ?? start; key !== start; key = from.get(key) ?? start) {
        cells.push({ x: middleOf((key % 65536) - 32768), y: middleOf(Math.floor(key / 65536) - 32768) });
    }
    cells.reverse();
    // Straightened: from each point kept, the furthest one seen in a straight line is the next.
    const points: { x: number; y: number }[] = [];
    let anchor: { x: number; y: number } = animal;
    for (let index = 0; index < cells.length; ) {
        let reach = index;
        while (reach + 1 < cells.length && sees(anchor, cells[reach + 1], mayEnter)) reach++;
        points.push(cells[reach]);
        anchor = cells[reach];
        index = reach + 1;
    }
    return { points, at: 0, goalCellX: goalX, goalCellY: goalY };
}

/**
 * Moves an animal for `dtMs` towards its target; it is given a new random one, in its body of water, when it has
 * none, reached it or cannot go on. It never enters a cell with too little water nor crosses a wall, so it stays in
 * its body of water. In a cell that dried up it flees to the deepest neighbour; false when it died there.
 *
 * Stopped on its straight way, it looks for a way round (`findRoute`: a land animal goes by a bridge) and follows
 * it; its target is only dropped when there is none.
 */
export function swim(
    animal: Animal,
    bodies: Places,
    _grid: WaterView | undefined,
    maxSpeedPxPerS: number,
    dtMs: number,
    now: number,
    random: () => number,
): boolean {
    const minDepth = levelOf(animal);
    const cellX = cellAt(animal.x);
    const cellY = cellAt(animal.y);
    if (!bodies.passable(cellX, cellY, minDepth)) {
        animal.dryAt ??= now;
        if (now - animal.dryAt >= DRY_DEATH_MS) return false;
        let best: { x: number; y: number; depth: number } | undefined;
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            if (!bodies.passable(cellX + dx, cellY + dy, minDepth) || !bodies.canCross(cellX, cellY, dx, dy)) continue;
            const depth = bodies.comfortAt(cellX + dx, cellY + dy);
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
        bodies.canCross(fromX, fromY, dx, dy) && bodies.passable(fromX + dx, fromY + dy, minDepth);
    const mayEnter: MayEnter = (fromX, fromY, toX, toY) => {
        const dx = toX - fromX;
        const dy = toY - fromY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
        if (dx === 0 || dy === 0) return open(fromX, fromY, dx, dy);
        // A corner: by one of the two cells beside it.
        return (
            (open(fromX, fromY, dx, 0) && open(fromX + dx, fromY, 0, dy)) ||
            (open(fromX, fromY, 0, dy) && open(fromX, fromY + dy, dx, 0))
        );
    };
    let distance = (speed * dtMs) / 1000;
    // The way round it follows, as long as its target stays about where the way leads.
    let route = routes.get(animal);
    if (
        route &&
        (Math.abs(route.goalCellX - cellAt(animal.targetX)) > ROUTE_GOAL_DRIFT_CELLS ||
            Math.abs(route.goalCellY - cellAt(animal.targetY)) > ROUTE_GOAL_DRIFT_CELLS)
    ) {
        routes.delete(animal);
        route = undefined;
    }
    while (route && distance > 0) {
        const point = route.points[route.at];
        const before = Math.hypot(point.x - animal.x, point.y - animal.y);
        if (!advance(animal, point.x, point.y, distance, mayEnter)) {
            // The water moved, a door closed: the way is no longer one.
            routes.delete(animal);
            animal.targetX = animal.targetY = undefined;
            return true;
        }
        distance -= Math.min(distance, before);
        if (Math.hypot(point.x - animal.x, point.y - animal.y) >= 1) return true;
        route.at++;
        if (route.at >= route.points.length) {
            // At the end of the way: straight to its target from here.
            routes.delete(animal);
            route = undefined;
        }
    }
    if (distance <= 0) return true;
    if (advance(animal, animal.targetX, animal.targetY, distance, mayEnter)) return true;
    // Stopped on its straight way: round by another one when there is one, else another target next time.
    const found =
        (noRouteUntil.get(animal) ?? 0) > now
            ? undefined
            : findRoute(animal, animal.targetX, animal.targetY, bodies, minDepth, mayEnter);
    if (found) {
        routes.set(animal, found);
        return true;
    }
    noRouteUntil.set(animal, now + ROUTE_RETRY_MS);
    animal.targetX = animal.targetY = undefined;
    return true;
}

/**
 * Goes towards a point by sub-steps of half a cell at most, so that no cell is jumped over; `mayEnter` tells whether
 * the next cell can be entered from the current one. False when it was stopped before the end of its move.
 */
function advance(
    animal: { x: number; y: number },
    toX: number,
    toY: number,
    distance: number,
    mayEnter: MayEnter,
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
