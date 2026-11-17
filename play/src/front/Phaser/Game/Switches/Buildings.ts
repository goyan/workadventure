/** The cells of the map that are outdoors, as OutdoorGrid tells them. */
export interface OutdoorCells {
    cols: number;
    rows: number;
    cellSize: number;
    isOutdoorCell(col: number, row: number): boolean;
}

/** Outdoors, or out of the map: in no building. */
export const NO_BUILDING = -1;

/** The building of each cell of the map (NO_BUILDING outdoors). */
export interface Buildings {
    cols: number;
    rows: number;
    cellSize: number;
    labels: Int32Array;
}

/**
 * The buildings of the map: each is the cells that are not outdoors (rooms and walls alike) and touch one another by a
 * side. Two buildings that only touch by a corner stay apart. A presence sensor "of its building" fires for anybody
 * anywhere in the building it stands in (see buildingSensorsWithSomebody).
 */
export function labelBuildings(grid: OutdoorCells): Buildings {
    const { cols, rows } = grid;
    const labels = new Int32Array(cols * rows).fill(NO_BUILDING);
    let next = 0;
    const stack: number[] = [];
    for (let start = 0; start < labels.length; start++) {
        if (labels[start] !== NO_BUILDING || grid.isOutdoorCell(start % cols, Math.floor(start / cols))) {
            continue;
        }
        labels[start] = next;
        stack.push(start);
        while (stack.length > 0) {
            const cell = stack.pop() as number;
            const col = cell % cols;
            const row = Math.floor(cell / cols);
            const neighbours = [
                col > 0 ? cell - 1 : -1,
                col < cols - 1 ? cell + 1 : -1,
                row > 0 ? cell - cols : -1,
                row < rows - 1 ? cell + cols : -1,
            ];
            for (const neighbour of neighbours) {
                if (
                    neighbour >= 0 &&
                    labels[neighbour] === NO_BUILDING &&
                    !grid.isOutdoorCell(neighbour % cols, Math.floor(neighbour / cols))
                ) {
                    labels[neighbour] = next;
                    stack.push(neighbour);
                }
            }
        }
        next++;
    }
    return { cols, rows, cellSize: grid.cellSize, labels };
}

/** The building a point of the map is in, on the ground; NO_BUILDING outdoors or out of the map. */
export function buildingAt(buildings: Buildings, point: { x: number; y: number }): number {
    const col = Math.floor(point.x / buildings.cellSize);
    const row = Math.floor(point.y / buildings.cellSize);
    if (col < 0 || row < 0 || col >= buildings.cols || row >= buildings.rows) {
        return NO_BUILDING;
    }
    return buildings.labels[row * buildings.cols + col];
}

/** The rectangle around a building, in pixels; undefined for NO_BUILDING. */
export function buildingBounds(
    buildings: Buildings,
    building: number,
): { x: number; y: number; width: number; height: number } | undefined {
    if (building === NO_BUILDING) {
        return undefined;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let cell = 0; cell < buildings.labels.length; cell++) {
        if (buildings.labels[cell] !== building) {
            continue;
        }
        const col = cell % buildings.cols;
        const row = Math.floor(cell / buildings.cols);
        left = Math.min(left, col);
        top = Math.min(top, row);
        right = Math.max(right, col);
        bottom = Math.max(bottom, row);
    }
    if (left === Infinity) {
        return undefined;
    }
    const size = buildings.cellSize;
    return { x: left * size, y: top * size, width: (right - left + 1) * size, height: (bottom - top + 1) * size };
}

/**
 * The sensors "of their building" that sense somebody: those whose building holds one of `occupied`, the buildings
 * of my avatar and of my wandering animals. A sensor outdoors never fires, and nobody outdoors fires one.
 */
export function buildingSensorsWithSomebody(
    sensors: readonly { id: string; building: number }[],
    occupied: readonly number[],
): string[] {
    const buildings = new Set(occupied.filter((building) => building !== NO_BUILDING));
    return sensors.filter((sensor) => buildings.has(sensor.building)).map((sensor) => sensor.id);
}
