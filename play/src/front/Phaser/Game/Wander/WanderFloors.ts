import type { FloorModel } from "../MapEditor/MapLayer/FloorModel";
import { floorRoute, stairEdges } from "../MapEditor/MapLayer/FloorPath";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import type { Point } from "./WanderSchedule";

const TILE = MAP_LAYER_TILE_SIZE;
/** A way through the floors is looked for this many tiles around both of its ends at most. */
export const FLOOR_ROUTE_REACH_TILES = 12;

export interface WanderFloorsInput {
    /** The slabs and the stairs of the map: the same on every client. */
    model: FloorModel;
    /** Whether a wandering character may stand on a tile of the ground. */
    groundWalkable(tile: Point): boolean;
    /** Whether a wall stands between two neighbouring tiles of a floor (0: the ground). */
    blocked?(level: number, from: Point, to: Point): boolean;
    /** Whether something fills a tile of a raised floor (furniture, a pool): nobody stands there. */
    occupied?(level: number, tile: Point): boolean;
}

/**
 * The raised floors as the wandering characters walk them: like the avatars, up and down the stairs and the ramps,
 * over the slabs (the deck of a bridge is one). A point is where its feet are on the ground (`x`, `y`), and how high
 * over it they stand (`z`, absent on the ground): on the screen, the character is drawn `z` further north.
 */
export interface WanderFloors {
    /** The altitudes of the raised floors a character can stand on over a tile, lowest first. */
    levelsAt(tile: Point): number[];
    /**
     * The walk from a point to another through the floors: the points to go through, from `from` to `to`. Empty when
     * there is none. It only depends on the map, so every client finds the same.
     */
    route(from: Point, to: Point): Point[];
}

function at(x: number, y: number, z: number): Point {
    return z > 0 ? { x, y, z } : { x, y };
}

export function wanderFloorsOf(input: WanderFloorsInput): WanderFloors {
    const { model } = input;
    const levels = model.getLevels();
    const stairs = model.getStairs();
    const underStair = (level: number, tile: Point): boolean =>
        stairs.some(
            (stair) =>
                stair.base === level &&
                tile.x * TILE >= stair.ground.x &&
                tile.x * TILE < stair.ground.x + stair.ground.width &&
                tile.y * TILE >= stair.ground.y &&
                tile.y * TILE < stair.ground.y + stair.ground.height,
        );
    const standable = (level: number, tile: Point): boolean =>
        level === 0
            ? input.groundWalkable(tile)
            : model.hasSlab(level, tile.x, tile.y) && input.occupied?.(level, tile) !== true;
    const levelOf = (point: Point): number | undefined =>
        [0, ...levels].find((level) => Math.abs(level - (point.z ?? 0)) < 2);
    const tileOf = (point: Point): Point => ({ x: Math.floor(point.x / TILE), y: Math.floor(point.y / TILE) });

    return {
        levelsAt: (tile) => levels.filter((level) => standable(level, tile) && !underStair(level, tile)),
        route: (from, to) => {
            const startLevel = levelOf(from);
            const endLevel = levelOf(to);
            if (startLevel === undefined || endLevel === undefined) return [];
            const start = { level: startLevel, ...tileOf(from) };
            const end = { level: endLevel, ...tileOf(to) };
            const reach = FLOOR_ROUTE_REACH_TILES;
            const minX = Math.min(start.x, end.x) - reach;
            const maxX = Math.max(start.x, end.x) + reach;
            const minY = Math.min(start.y, end.y) - reach;
            const maxY = Math.max(start.y, end.y) + reach;
            const steps = floorRoute({
                model,
                standable: (level, x, y) =>
                    x >= minX && x <= maxX && y >= minY && y <= maxY && standable(level, { x, y }),
                blocked: (level, a, b) => input.blocked?.(level, a, b) ?? false,
                start,
                end,
            });
            if (!steps) return [];
            const points: Point[] = [at(from.x, from.y, startLevel)];
            for (const [index, step] of steps.entries()) {
                if (step.stair) {
                    const { stair, up } = step.stair;
                    const edges = stairEdges(stair);
                    const foot = at(edges.foot.x, edges.foot.y, stair.base);
                    const head = at(edges.head.x, edges.head.y, stair.top);
                    points.push(up ? foot : head, up ? head : foot);
                }
                // The last tile is left by the destination itself, anywhere on it.
                if (index < steps.length - 1 || step.stair) {
                    points.push(at(step.node.x * TILE + TILE / 2, step.node.y * TILE + TILE / 2, step.node.level));
                }
            }
            points.push(at(to.x, to.y, endLevel));
            return points;
        },
    };
}
