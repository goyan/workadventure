import type { WeatherView } from "../Weather/WeatherFrame";
import { LEAF_DENSITY_CELL_PX, leafDensityField, type LeafSources } from "./LeafDensity";
import { hash01, leafColor } from "./LeafPalette";

export interface ScatteredLeaf {
    x: number;
    y: number;
    color: number;
    /** 3×4 instead of 4×3. */
    vertical: boolean;
}

/**
 * Leaves of the cells the view touches, under the trees and downwind of them (LeafDensity): a cell holds a leaf when
 * its own draw is under the density there. Placed by their cell alone: the same for everyone, visit after visit, and
 * a leaf that lies somewhere stays there while autumn adds others around it.
 */
export function scatteredLeavesInView(
    view: WeatherView,
    isGround: (x: number, y: number) => boolean,
    sources: LeafSources,
): ScatteredLeaf[] {
    const leaves: ScatteredLeaf[] = [];
    if (sources.trees.length === 0) return leaves;
    const size = LEAF_DENSITY_CELL_PX;
    const field = leafDensityField(view, sources.trees, sources.wind, sources.progress);
    for (let row = 0; row < field.rows; row++) {
        for (let column = 0; column < field.columns; column++) {
            const density = field.values[row * field.columns + column];
            if (density <= 0) continue;
            const col = field.column + column;
            const line = field.row + row;
            if (hash01(col, line, 4) >= density) continue;
            const x = col * size + Math.floor(hash01(col, line) * (size - 4));
            const y = line * size + Math.floor(hash01(col, line, 1) * (size - 4));
            if (!isGround(x + 1, y + 1)) continue;
            leaves.push({ x, y, color: leafColor(hash01(col, line, 2)), vertical: hash01(col, line, 3) < 0.5 });
        }
    }
    return leaves;
}
