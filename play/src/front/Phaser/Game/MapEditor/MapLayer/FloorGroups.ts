import type { FloorModel } from "./FloorModel";
import type { TilePoint } from "./MapLayerFloors";

/** A raised floor as one sees it: the slabs of one altitude that touch each other (the storey of one building). */
export interface FloorGroup {
    /** Altitude of its slabs. */
    level: number;
    /** The tiles its slabs cover, on the ground. */
    cells: TilePoint[];
    /** Stable as long as its first tile (the northmost, then westmost) stays: `<level>:<x>:<y>`. */
    key: string;
}

const cellKey = (x: number, y: number): string => `${x}:${y}`;

/**
 * The raised floors of a map, one by one: two slabs of the same altitude belong to the same floor when they share a
 * side. Two buildings each have their own floors, even at the same altitude: what happens to one (it lets the room
 * under it show through) does not happen to the other.
 */
export function floorGroups(model: FloorModel): FloorGroup[] {
    const byLevel = new Map<number, Map<string, TilePoint>>();
    for (const slab of model.getSlabs()) {
        let cells = byLevel.get(slab.elevation);
        if (!cells) {
            cells = new Map();
            byLevel.set(slab.elevation, cells);
        }
        cells.set(cellKey(slab.x, slab.y), { x: slab.x, y: slab.y });
    }
    const groups: FloorGroup[] = [];
    for (const [level, cells] of [...byLevel].sort(([a], [b]) => a - b)) {
        const left = new Map(cells);
        // From the northmost, then westmost tile: the key of a floor does not depend on the order of the slabs.
        const starts = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
        for (const start of starts) {
            if (!left.has(cellKey(start.x, start.y))) continue;
            const group: TilePoint[] = [];
            const queue = [start];
            left.delete(cellKey(start.x, start.y));
            for (let head = 0; head < queue.length; head++) {
                const cell = queue[head];
                group.push(cell);
                for (const [dx, dy] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ]) {
                    const key = cellKey(cell.x + dx, cell.y + dy);
                    const next = left.get(key);
                    if (next) {
                        left.delete(key);
                        queue.push(next);
                    }
                }
            }
            groups.push({ level, cells: group, key: `${level}:${start.x}:${start.y}` });
        }
    }
    return groups;
}

/**
 * The floor of an altitude the nearest to a tile of the ground: where an object of that altitude belongs when it
 * stands over no slab (a shelf hung on the wall beside its floor). Undefined when the altitude has no floor.
 */
export function nearestFloorGroup(
    groups: readonly FloorGroup[],
    level: number,
    cell: TilePoint,
): FloorGroup | undefined {
    let nearest: FloorGroup | undefined;
    let best = Infinity;
    for (const group of groups) {
        if (group.level !== level) continue;
        for (const other of group.cells) {
            const distance = (other.x - cell.x) ** 2 + (other.y - cell.y) ** 2;
            if (distance < best) {
                best = distance;
                nearest = group;
            }
        }
    }
    return nearest;
}
