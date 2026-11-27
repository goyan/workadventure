import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";
import type { FloorModel, PlacedStair } from "./FloorModel";
import { floorCellAt, levelUnderPoint } from "./FloorOperations";
import { stairRun } from "./MapLayerFloors";
import type { TilePoint } from "./MapLayerFloors";

const TILE = MAP_LAYER_TILE_SIZE;
/** A walk is looked for among that many tiles at most: beyond, there is no path. */
const MAX_VISITED = 60_000;

/** A tile of a floor (0: the ground). */
export interface FloorNode {
    level: number;
    x: number;
    y: number;
}

/** A step of a walk through the floors: the tile stepped onto, and the stair taken to get there, if any. */
export interface FloorRouteStep {
    node: FloorNode;
    stair?: { stair: PlacedStair; up: boolean };
}

export interface FloorRouteInput {
    model: FloorModel;
    /** Whether one can stand on a tile of a floor (0: the ground); the tiles under a stair of the floor never are. */
    standable: (level: number, x: number, y: number) => boolean;
    /** Whether something stands between two neighbouring tiles of a floor: a wall of that floor. */
    blocked?: (level: number, from: TilePoint, to: TilePoint) => boolean;
    start: FloorNode;
    end: FloorNode;
}

export interface FloorPathInput {
    model: FloorModel;
    /** Whether a tile of the ground can be walked on (false outside the map). */
    groundWalkable: (x: number, y: number) => boolean;
    /**
     * Whether something stands between two neighbouring tiles of a floor (0: the ground): a wall of that floor. A
     * door does not count, it opens when the avatar comes near.
     */
    blocked?: (level: number, from: TilePoint, to: TilePoint) => boolean;
    /** Where the avatar is on the screen, and the floor it stands on (0: the ground). */
    from: { x: number; y: number; elevation: number };
    /**
     * The point of the screen to walk to, and the floor it is on (0: the ground). Without `level`: the highest floor
     * drawn there, the ground elsewhere.
     */
    to: { x: number; y: number; level?: number };
}

/** The tile before the first step of a stair, on the floor it starts from, and the one after its last step. */
export function stairEnds(stair: PlacedStair): { bottom: TilePoint; top: TilePoint } {
    const run = stairRun(stair.shape.direction, stair.shape.rise, stair.shape.short);
    const { x, y } = stair.foot;
    switch (stair.shape.direction) {
        case "n":
            return { bottom: { x, y: y + 1 }, top: { x, y: y - run } };
        case "s":
            return { bottom: { x, y: y - 1 }, top: { x, y: y + run } };
        case "e":
            return { bottom: { x: x - 1, y }, top: { x: x + run, y } };
        case "o":
            return { bottom: { x: x + 1, y }, top: { x: x - run, y } };
    }
}

const keyOf = (node: FloorNode): string => `${node.level}:${node.x}:${node.y}`;

/** Where the walk crosses the two ends of a stair, on the ground: first its foot, then its head. */
export function stairEdges(stair: PlacedStair): { foot: { x: number; y: number }; head: { x: number; y: number } } {
    const box = stair.ground;
    const laneX = stair.foot.x * TILE + TILE / 2;
    const laneY = stair.foot.y * TILE + TILE / 2;
    switch (stair.shape.direction) {
        case "n":
            return { foot: { x: laneX, y: box.y + box.height }, head: { x: laneX, y: box.y } };
        case "s":
            return { foot: { x: laneX, y: box.y }, head: { x: laneX, y: box.y + box.height } };
        case "e":
            return { foot: { x: box.x, y: laneY }, head: { x: box.x + box.width, y: laneY } };
        case "o":
            return { foot: { x: box.x + box.width, y: laneY }, head: { x: box.x, y: laneY } };
    }
}

/**
 * The tiles to walk through from a tile of a floor to another one, tile by tile on a floor and by the stairs between
 * them: the steps after `start`, the last one onto `end` (none when both are the same tile). Undefined when there is
 * no way, or when one cannot stand on `end`. The same input always gives the same walk.
 */
export function floorRoute(input: FloorRouteInput): FloorRouteStep[] | undefined {
    const { model, start, end } = input;
    const stairs = model.getStairs();
    const onStairOf = (level: number, x: number, y: number): boolean =>
        stairs.some(
            (stair) =>
                stair.base === level &&
                x * TILE >= stair.ground.x &&
                x * TILE < stair.ground.x + stair.ground.width &&
                y * TILE >= stair.ground.y &&
                y * TILE < stair.ground.y + stair.ground.height,
        );
    const walkable = (node: FloorNode): boolean =>
        input.standable(node.level, node.x, node.y) && !onStairOf(node.level, node.x, node.y);
    if (!walkable(end)) return undefined;

    // Breadth-first: every step costs the same, a stair as one step.
    const cameFrom = new Map<string, { node: FloorNode; step: FloorRouteStep }>();
    const visited = new Set<string>([keyOf(start)]);
    const queue: FloorNode[] = [start];
    const endKey = keyOf(end);
    let found = keyOf(start) === endKey;
    for (let head = 0; head < queue.length && !found && visited.size < MAX_VISITED; head++) {
        const node = queue[head];
        const next: FloorRouteStep[] = [
            { node: { ...node, x: node.x + 1 } },
            { node: { ...node, x: node.x - 1 } },
            { node: { ...node, y: node.y + 1 } },
            { node: { ...node, y: node.y - 1 } },
        ];
        for (const stair of stairs) {
            const ends = stairEnds(stair);
            if (stair.base === node.level && ends.bottom.x === node.x && ends.bottom.y === node.y) {
                next.push({ node: { level: stair.top, ...ends.top }, stair: { stair, up: true } });
            }
            if (stair.top === node.level && ends.top.x === node.x && ends.top.y === node.y) {
                next.push({ node: { level: stair.base, ...ends.bottom }, stair: { stair, up: false } });
            }
        }
        for (const step of next) {
            const key = keyOf(step.node);
            if (visited.has(key) || !walkable(step.node)) continue;
            if (!step.stair && input.blocked?.(node.level, node, step.node)) continue;
            visited.add(key);
            cameFrom.set(key, { node, step });
            if (key === endKey) {
                found = true;
                break;
            }
            queue.push(step.node);
        }
    }
    if (!found) return undefined;
    const steps: FloorRouteStep[] = [];
    for (let entry = cameFrom.get(endKey); entry; entry = cameFrom.get(keyOf(entry.node))) steps.push(entry.step);
    return steps.reverse();
}

/**
 * The walk from the avatar to a point of the screen through the floors and their stairs: the points of the screen to
 * go through, the first one being where the avatar is. Undefined when there is none (no stair leads there, the point
 * is not on a tile one can stand on, the avatar is on a stair): the caller then walks as on a map without floors.
 * The furniture is not looked at: the avatar stops against it.
 */
export function floorPath(input: FloorPathInput): { x: number; y: number }[] | undefined {
    const { model, groundWalkable, from, to } = input;
    const levels = [0, ...model.getLevels()];
    const startLevel = levels.find((level) => Math.abs(level - from.elevation) < 2);
    if (startLevel === undefined) return undefined;
    const start: FloorNode = { level: startLevel, ...floorCellAt(from.x, from.y, startLevel) };
    const endLevel = to.level ?? levelUnderPoint(model, to.x, to.y);
    const end: FloorNode = { level: endLevel, ...floorCellAt(to.x, to.y, endLevel) };
    const steps = floorRoute({
        model,
        standable: (level, x, y) => (level === 0 ? groundWalkable(x, y) : model.hasSlab(level, x, y)),
        blocked: input.blocked,
        start,
        end,
    });
    if (!steps) return undefined;

    // As points of the screen: a tile by its middle, its altitude further north.
    const onScreen = (ground: { x: number; y: number }, level: number) => ({ x: ground.x, y: ground.y - level });
    const middle = (node: FloorNode) =>
        onScreen({ x: node.x * TILE + TILE / 2, y: node.y * TILE + TILE / 2 }, node.level);
    const points: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
    for (const [index, step] of steps.entries()) {
        if (step.stair) {
            const { stair, up } = step.stair;
            const edges = stairEdges(stair);
            const foot = onScreen(edges.foot, stair.base);
            const head = onScreen(edges.head, stair.top);
            points.push(up ? foot : head, up ? head : foot, middle(step.node));
        } else if (index < steps.length - 1) {
            points.push(middle(step.node));
        }
    }
    points.push({ x: to.x, y: to.y });
    return points;
}
