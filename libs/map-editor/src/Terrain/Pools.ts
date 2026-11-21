import { MAX_POOL_STYLES, PoolStyle, TERRAIN_CHUNK } from "../types";
import type { TerrainData } from "../types";
import { MAX_SOIL_CODE } from "./Soils";
import { cellKey, heightAt, withHeights } from "./TerrainGrid";

/**
 * The pools of a map, painted with the relief tool like the soils, in any shape (the round brush draws their curves):
 * a cell of a pool is kept as a soil numbered after the six soils, one number for each style of pool. The cells of
 * a style that touch one another make one pool. Its look (colours, depth, hot water) is the style's, kept in the
 * settings of the map.
 *
 * Its water is the water of the relief, kept by the server: for the water, a cell of a pool is dug as deep as its
 * style under the ground it is painted on (poolBasins), and a pump fills it up to its rim (poolCells). So a pool
 * takes the waves of a comet, boils under a fireball, is emptied by a drain and fills again, freezes as a lake, takes
 * a flood in and overflows.
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

/** A pool emptied is full again in this many seconds, whatever its size: its pump goes by its volume. */
export const POOL_FILL_SECONDS = 8;
/** The pump fills a pool up to this many pixels under its rim: its water does not lap over the coping. */
export const POOL_FREEBOARD_PX = 2;

/** A cell of a pool, as the pump that fills it reads it: how deep its basin is, in pixels. */
export interface PoolCell {
    cellX: number;
    cellY: number;
    depthPx: number;
}

/** The cells of the pools of a relief with the depth of their style, read once for a relief and its styles. */
function readPools(terrain: TerrainData, pools: readonly PoolStyle[] | undefined): PoolCell[] {
    const cells: PoolCell[] = [];
    for (const [key, codes] of Object.entries(terrain.soil ?? {})) {
        const [chunkX, chunkY] = key.split(",").map(Number);
        for (let index = 0; index < codes.length; index++) {
            const style = poolStyleOf(codes[index] ?? 0);
            if (style === undefined) continue;
            cells.push({
                cellX: chunkX * TERRAIN_CHUNK + (index % TERRAIN_CHUNK),
                cellY: chunkY * TERRAIN_CHUNK + Math.floor(index / TERRAIN_CHUNK),
                depthPx: poolStyleAt(pools, style).depthPx,
            });
        }
    }
    return cells;
}

const basinsOf = new WeakMap<
    TerrainData,
    { pools: readonly PoolStyle[] | undefined; cells: PoolCell[]; basins: TerrainData }
>();

function read(terrain: TerrainData, pools: readonly PoolStyle[] | undefined) {
    const kept = basinsOf.get(terrain);
    if (kept && kept.pools === pools) return kept;
    const cells = readPools(terrain, pools);
    const basins =
        cells.length > 0
            ? withHeights(
                  terrain,
                  new Map(
                      cells.map(({ cellX, cellY, depthPx }) => [
                          cellKey(cellX, cellY),
                          heightAt(terrain, cellX, cellY) - depthPx,
                      ]),
                  ),
              )
            : terrain;
    const made = { pools, cells, basins };
    basinsOf.set(terrain, made);
    return made;
}

/**
 * The relief as the water reads it: the relief of the map with each cell of a pool dug as deep as its style under
 * the ground it is painted on. The relief of the map itself is not changed (it is what the editor edits and what is
 * drawn). The same relief for the same map and the same styles: it is read once. The relief given when it has no
 * pool.
 */
export function poolBasins(
    terrain: TerrainData | undefined,
    pools: readonly PoolStyle[] | undefined,
): TerrainData | undefined {
    return terrain ? read(terrain, pools).basins : undefined;
}

/** The cells of the pools of a map with the depth of their basin: what the pump of the server fills. */
export function poolCells(terrain: TerrainData | undefined, pools: readonly PoolStyle[] | undefined): PoolCell[] {
    return terrain ? read(terrain, pools).cells : [];
}
