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

/**
 * A pool emptied is full again in this many seconds (ten minutes), whatever its size: its pump goes by its volume.
 * Slow enough that a heat, a meteor or a drain leave it visibly lower for a while.
 */
export const POOL_FILL_SECONDS = 600;
/** After a meteor fell in the water of the map, the pumps of its pools take this many seconds to start again. */
export const POOL_PUMP_RESTART_SECONDS = 3;
/** The pump fills a pool up to this many pixels under its rim: its water does not lap over the coping. */
export const POOL_FREEBOARD_PX = 2;
/** The overflow of a pool leaves this many pixels over its level before it takes water: a ripple is not a flood. */
export const POOL_OVERFLOW_SLACK_PX = 0.25;

/** A cell of a pool, as the pump that fills it reads it. */
/**
 * The pool each cell belongs to: the cells of `cells` joined side by side make one pool (its pump, its drain), by
 * the cell key ("x,y"). Numbered from 1.
 */
export function poolNumbersOf(cells: readonly Pick<PoolCell, "cellX" | "cellY">[]): Map<string, number> {
    const keyOf = (x: number, y: number): string => `${x},${y}`;
    const isPool = new Set(cells.map((cell) => keyOf(cell.cellX, cell.cellY)));
    const numbers = new Map<string, number>();
    let pool = 0;
    for (const start of cells) {
        const startKey = keyOf(start.cellX, start.cellY);
        if (numbers.has(startKey)) continue;
        pool++;
        numbers.set(startKey, pool);
        let front: { x: number; y: number }[] = [{ x: start.cellX, y: start.cellY }];
        while (front.length > 0) {
            const next: { x: number; y: number }[] = [];
            for (const { x, y } of front) {
                for (const [nx, ny] of [
                    [x + 1, y],
                    [x - 1, y],
                    [x, y + 1],
                    [x, y - 1],
                ]) {
                    const key = keyOf(nx, ny);
                    if (!isPool.has(key) || numbers.has(key)) continue;
                    numbers.set(key, pool);
                    next.push({ x: nx, y: ny });
                }
            }
            front = next;
        }
    }
    return numbers;
}

export interface PoolCell {
    cellX: number;
    cellY: number;
    /** How deep the basin of its pool is under its rim, in pixels: the depth of its style. */
    depthPx: number;
    /** The water the cell holds when its pool is full, in pixels: up to a little under the rim. */
    fullPx: number;
}

const SIDES: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

/**
 * The pools of a relief, cell by cell, with the height of the floor of each. The cells of a style that touch one
 * another make one pool, and a pool has one level: its rim is the lowest ground around it, its floor is flat, as deep
 * as its style under that rim (a cell already lower keeps its ground), and full it stands a little under the rim. So
 * a pool painted on a slope or on uneven ground does not run over its low side.
 */
function readPools(
    terrain: TerrainData,
    pools: readonly PoolStyle[] | undefined,
): { cells: PoolCell[]; floors: Map<string, number> } {
    const painted = new Map<string, { cellX: number; cellY: number; style: number }>();
    for (const [key, codes] of Object.entries(terrain.soil ?? {})) {
        const [chunkX, chunkY] = key.split(",").map(Number);
        for (let index = 0; index < codes.length; index++) {
            const style = poolStyleOf(codes[index] ?? 0);
            if (style === undefined) continue;
            const cellX = chunkX * TERRAIN_CHUNK + (index % TERRAIN_CHUNK);
            const cellY = chunkY * TERRAIN_CHUNK + Math.floor(index / TERRAIN_CHUNK);
            painted.set(cellKey(cellX, cellY), { cellX, cellY, style });
        }
    }
    const cells: PoolCell[] = [];
    const floors = new Map<string, number>();
    const seen = new Set<string>();
    for (const [key, first] of painted) {
        if (seen.has(key)) continue;
        seen.add(key);
        // One pool: the cells of this style reached side by side, and the lowest ground along its sides.
        const members = [first];
        let rim = Infinity;
        for (let next = 0; next < members.length; next++) {
            const { cellX, cellY, style } = members[next];
            for (const [dx, dy] of SIDES) {
                const beside = cellKey(cellX + dx, cellY + dy);
                const other = painted.get(beside);
                if (other?.style === style) {
                    if (!seen.has(beside)) {
                        seen.add(beside);
                        members.push(other);
                    }
                } else {
                    rim = Math.min(rim, heightAt(terrain, cellX + dx, cellY + dy));
                }
            }
        }
        const depthPx = poolStyleAt(pools, first.style).depthPx;
        for (const { cellX, cellY } of members) {
            const floor = Math.min(rim - depthPx, heightAt(terrain, cellX, cellY));
            floors.set(cellKey(cellX, cellY), floor);
            cells.push({ cellX, cellY, depthPx, fullPx: Math.max(0, rim - POOL_FREEBOARD_PX - floor) });
        }
    }
    return { cells, floors };
}

const basinsOf = new WeakMap<
    TerrainData,
    { pools: readonly PoolStyle[] | undefined; cells: PoolCell[]; basins: TerrainData }
>();

function read(terrain: TerrainData, pools: readonly PoolStyle[] | undefined) {
    const kept = basinsOf.get(terrain);
    if (kept && kept.pools === pools) return kept;
    const { cells, floors } = readPools(terrain, pools);
    const basins = floors.size > 0 ? withHeights(terrain, floors) : terrain;
    const made = { pools, cells, basins };
    basinsOf.set(terrain, made);
    return made;
}

/**
 * The relief as the water reads it: the relief of the map with each pool dug as deep as its style under its rim, the
 * lowest ground around it (see readPools). The relief of the map itself is not changed (it is what the editor edits and what is
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
