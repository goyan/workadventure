import type { WeatherView } from "../Weather/WeatherFrame";
import { hash01, leafColor } from "./LeafPalette";

/** About one leaf per square of this size, outdoors. */
export const LEAF_SCATTER_CELL_PX = 48;

export interface ScatteredLeaf {
    x: number;
    y: number;
    color: number;
    /** 3×4 instead of 4×3. */
    vertical: boolean;
}

/** Leaves of the cells the view touches, placed by their cell alone: the same for everyone, visit after visit. */
export function scatteredLeavesInView(
    view: WeatherView,
    isOutdoor: (x: number, y: number) => boolean,
): ScatteredLeaf[] {
    const size = LEAF_SCATTER_CELL_PX;
    const leaves: ScatteredLeaf[] = [];
    const lastCol = Math.floor((view.x + view.width - 1) / size);
    const lastRow = Math.floor((view.y + view.height - 1) / size);
    for (let row = Math.floor(view.y / size); row <= lastRow; row++) {
        for (let col = Math.floor(view.x / size); col <= lastCol; col++) {
            const x = col * size + Math.floor(hash01(col, row) * (size - 4));
            const y = row * size + Math.floor(hash01(col, row, 1) * (size - 4));
            if (!isOutdoor(x + 1, y + 1)) continue;
            leaves.push({ x, y, color: leafColor(hash01(col, row, 2)), vertical: hash01(col, row, 3) < 0.5 });
        }
    }
    return leaves;
}
