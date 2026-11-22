import { CELL_AREA_M2, CELL_LITRES_PER_PX, LITRES_PER_M3, metresOf, TERRAIN_CELL } from "@workadventure/map-editor";
import type { SettledWater } from "./TerrainWater";

/** A cell belongs to a body of water from this depth on: a film left by a flood joins nothing. */
export const MASS_MIN_DEPTH_PX = 2;
/** A body smaller than this many cells is a puddle, not told. */
export const MASS_MIN_CELLS = 12;

/** A body of water of the map: the cells deep enough that touch each other. */
export interface WaterMass {
    cells: number;
    volumeM3: number;
    areaM2: number;
    meanDepthM: number;
    /**
     * How fast its volume changes, in cubic metres a minute of real time: positive when it fills. Over a few
     * seconds (the trend of its cells), so that its waves do not make it jump.
     */
    trendM3PerMinute: number;
    /** A point of the body to hang its label on, in map pixels: its cell nearest to its middle. */
    x: number;
    y: number;
}

/**
 * The bodies of water of a state of the water, the largest first. Read from the depths alone: a wall between two
 * waters the browser does not know of does not part them here.
 */
export function waterMassesOf(
    water: SettledWater,
    minDepthPx = MASS_MIN_DEPTH_PX,
    minCells = MASS_MIN_CELLS,
): WaterMass[] {
    const { width, height, depths, before } = water;
    const size = width * height;
    if (size === 0 || depths.length !== size) return [];
    const seen = new Uint8Array(size);
    const queue = new Int32Array(size);
    const masses: WaterMass[] = [];
    const m3 = CELL_LITRES_PER_PX / LITRES_PER_M3;
    const timed = Number.isFinite(water.seconds) && water.seconds > 0 && before.length === size;
    // The trend of each cell over a few seconds when the water keeps it: the waves that only ripple leave it alone.
    const trend = water.trend && water.trend.length === size ? water.trend : undefined;
    for (let start = 0; start < size; start++) {
        if (seen[start] || depths[start] < minDepthPx) continue;
        let tail = 0;
        queue[tail++] = start;
        seen[start] = 1;
        let px = 0;
        let earlierPx = 0;
        let risingPx = 0;
        let sumX = 0;
        let sumY = 0;
        for (let head = 0; head < tail; head++) {
            const index = queue[head];
            const column = index % width;
            px += depths[index];
            if (trend) risingPx += trend[index];
            else if (timed) earlierPx += before[index];
            sumX += column;
            sumY += (index - column) / width;
            if (column + 1 < width && !seen[index + 1] && depths[index + 1] >= minDepthPx) {
                seen[index + 1] = 1;
                queue[tail++] = index + 1;
            }
            if (column > 0 && !seen[index - 1] && depths[index - 1] >= minDepthPx) {
                seen[index - 1] = 1;
                queue[tail++] = index - 1;
            }
            if (index + width < size && !seen[index + width] && depths[index + width] >= minDepthPx) {
                seen[index + width] = 1;
                queue[tail++] = index + width;
            }
            if (index >= width && !seen[index - width] && depths[index - width] >= minDepthPx) {
                seen[index - width] = 1;
                queue[tail++] = index - width;
            }
        }
        if (tail < minCells) continue;
        // The cell of the body nearest to its middle: the middle of a lake shaped like a ring is dry land.
        const middleX = sumX / tail;
        const middleY = sumY / tail;
        let nearest = queue[0];
        let nearestGap = Infinity;
        for (let place = 0; place < tail; place++) {
            const index = queue[place];
            const column = index % width;
            const gap = (column - middleX) ** 2 + ((index - column) / width - middleY) ** 2;
            if (gap < nearestGap) {
                nearestGap = gap;
                nearest = index;
            }
        }
        const column = nearest % width;
        masses.push({
            cells: tail,
            volumeM3: px * m3,
            areaM2: tail * CELL_AREA_M2,
            meanDepthM: -metresOf(-px / tail),
            trendM3PerMinute: trend ? risingPx * m3 * 60 : timed ? (((px - earlierPx) * m3) / water.seconds) * 60 : 0,
            x: (water.x + column + 0.5) * TERRAIN_CELL,
            y: (water.y + (nearest - column) / width + 0.5) * TERRAIN_CELL,
        });
    }
    return masses.sort((a, b) => b.volumeM3 - a.volumeM3);
}
