import { MAX_POOL_STYLES, PoolStyle } from "../types";
import { MAX_SOIL_CODE } from "./Soils";

/**
 * The pools of a map, painted with the relief tool like the soils, in any shape (the round brush draws their curves):
 * a cell of a pool is kept as a soil numbered after the six soils, one number for each style of pool. The cells of
 * a style that touch one another make one pool. Its look (colours, depth, hot water) is the style's, kept in the
 * settings of the map. A pool holds its water of itself: the water of the relief does not flow into it.
 */

/** The style a pool is drawn with when the map says nothing of it: turquoise water, a light coping. */
export const DEFAULT_POOL_STYLE: PoolStyle = {
    water: "#22c3c9",
    coping: "#e9e3d3",
    depthPx: 48,
    hot: false,
    ladders: 2,
};

/** The soil number the cells of a pool of this style (0 to MAX_POOL_STYLES - 1) are kept as. */
export function poolSoilCode(style: number): number {
    return MAX_SOIL_CODE + 1 + style;
}

/** The style of pool a soil number is, or undefined for a soil (or a cell not painted). */
export function poolStyleOf(code: number): number | undefined {
    const style = code - MAX_SOIL_CODE - 1;
    return Number.isInteger(style) && style >= 0 && style < MAX_POOL_STYLES ? style : undefined;
}

/** The style `style` of the map, or the default one when the map has none for it. */
export function poolStyleAt(styles: readonly PoolStyle[] | undefined, style: number): PoolStyle {
    return styles?.[style] ?? DEFAULT_POOL_STYLE;
}

/** The styles a map may keep, each checked: a broken one is left out, the list is cut at MAX_POOL_STYLES. */
export function validPoolStyles(sent: readonly unknown[]): PoolStyle[] {
    return sent
        .flatMap((style) => {
            const parsed = PoolStyle.safeParse(style);
            return parsed.success ? [parsed.data] : [];
        })
        .slice(0, MAX_POOL_STYLES);
}
