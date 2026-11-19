import { OUTDOOR_CELL_SIZE } from "../Outdoor/OutdoorTracker";
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
    function staysOutdoor(from: Point, to: Point): boolean {
        // Check every outdoor-grid cell crossed by the segment, including a diagonal grazing a corner.
        let crossings = [0, 1];
        for (const axis of ["x", "y"] as const) {
            const delta = to[axis] - from[axis];
            if (delta === 0) continue;
            const low = Math.min(from[axis], to[axis]);
            const high = Math.max(from[axis], to[axis]);
            for (
                let edge = (Math.floor(low / OUTDOOR_CELL_SIZE) + 1) * OUTDOOR_CELL_SIZE;
                edge < high;
                edge += OUTDOOR_CELL_SIZE
            ) {
                crossings = [...crossings, (edge - from[axis]) / delta];
            }
        }
        const ordered = [...crossings].sort((a, b) => a - b);
        const outsideAt = (ratio: number): boolean =>
            isOutdoor(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
        return ordered.every(
            (ratio, index) => outsideAt(ratio) && (index === 0 || outsideAt((ordered[index - 1] + ratio) / 2)),
        );
    }
    return {
        isWalkable: (tile) =>
            base.isWalkable(tile) && isOutdoor(tile.x * tileSize + tileSize / 2, tile.y * tileSize + tileSize / 2),
        findPath: async (from, to) => {
            const path = await base.findPath(from, to);
            let previous = from;
            for (const point of path) {
                if (!staysOutdoor(previous, point)) return [];
                previous = point;
            }
            return staysOutdoor(previous, to) ? path : [];
        },
        // They drink like the others, at the shores that are outdoors.
        shores: () => (base.shores?.() ?? []).filter(isOutdoorPoint),
        drinkIntervalMs: () => base.drinkIntervalMs?.(),
    };
}
