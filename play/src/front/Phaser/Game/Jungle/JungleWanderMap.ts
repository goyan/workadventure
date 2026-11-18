import type { Point, WanderMap } from "../Wander/WanderSchedule";

/**
 * The map the jungle animals walk on: the one of the placed animals, cut down to the outdoors. A path that goes
 * through a building (in by a door, out by another) is no path, so they never enter one nor open its doors. No
 * `seats`: jungle animals never sit on furniture.
 */
export function outdoorWanderMap(
    base: WanderMap,
    isOutdoor: (x: number, y: number) => boolean,
    tileSize: number,
): WanderMap {
    const isOutdoorPoint = (point: Point): boolean => isOutdoor(point.x, point.y);
    return {
        isWalkable: (tile) =>
            base.isWalkable(tile) && isOutdoor(tile.x * tileSize + tileSize / 2, tile.y * tileSize + tileSize / 2),
        findPath: async (from, to) => {
            const path = await base.findPath(from, to);
            return path.every(isOutdoorPoint) ? path : [];
        },
        // They drink like the others, at the shores that are outdoors.
        shores: () => (base.shores?.() ?? []).filter(isOutdoorPoint),
        drinkIntervalMs: () => base.drinkIntervalMs?.(),
    };
}
