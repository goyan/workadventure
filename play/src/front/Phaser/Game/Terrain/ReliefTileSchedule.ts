import { heightAt, soilAt, TERRAIN_CHUNK } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** Rows of cells north of a block read to draw it: the highest face of a drop (128 px drawn, 8 cells) reaches it. */
export const NORTH_ROWS = 8;
/** Rows of cells south of a block read to draw it: the highest top of a mount (128 px drawn, 8 cells) rises into it. */
export const SOUTH_ROWS = 8;
/**
 * Columns of cells west of a block read to draw it: the shadow of the highest mount (256 px high, 113 px long, 8 cells)
 * falls south-east into it.
 */
export const SHADOW_CELLS = 8;

/**
 * The cells a block of the relief is drawn from: its own, NORTH_ROWS north of it (the faces of the hollows),
 * SOUTH_ROWS south (the tops of the mounts), SHADOW_CELLS west (the shadows), and one more all around (the heights are
 * interpolated between the centres of the cells). The drawing and every signature of a block read this one window.
 */
export function blockCellWindow(
    blockX: number,
    blockY: number,
): { x: number; y: number; width: number; height: number } {
    return {
        x: blockX * TERRAIN_CHUNK - 1 - SHADOW_CELLS,
        y: blockY * TERRAIN_CHUNK - NORTH_ROWS - 1,
        width: TERRAIN_CHUNK + 2 + SHADOW_CELLS,
        height: TERRAIN_CHUNK + NORTH_ROWS + SOUTH_ROWS + 2,
    };
}

/**
 * Pixels of the map for a point of a block drawn (its texel), given how many pixels of the screen a pixel of the map
 * takes: a point drawn is a pixel of the screen at most, a block is drawn no finer than the screen shows it. Far out,
 * a block costs 4 or 16 times less to draw, and looks the same.
 */
export function texelFor(screenScale: number): 1 | 2 | 4 {
    return screenScale > 0.5 ? 1 : screenScale > 0.25 ? 2 : 4;
}

/**
 * The texel a block of the view is first drawn with, whatever the zoom: 16 times cheaper than a sharp one, so the view
 * is filled at once; each block is then drawn again as sharp as the screen shows it.
 */
export const COARSE_TEXEL = 4;

/** The most blocks drawn in one image of the game; the others wait for the next one. */
export const BLOCKS_AN_IMAGE = 1;
/** The most blocks kept drawn. */
export const KEPT_BLOCKS = 64;

/**
 * The heights and soils a block of the relief is drawn from (blockCellWindow), as a short text: the same relief gives the
 * same text. Empty when none of them is dug, raised or painted.
 */
export function reliefSignature(terrain: TerrainData | undefined, blockX: number, blockY: number): string {
    if (!terrain) return "";
    let hash = 0;
    let dug = false;
    const window = blockCellWindow(blockX, blockY);
    for (let y = window.y; y < window.y + window.height; y++) {
        for (let x = window.x; x < window.x + window.width; x++) {
            const height = heightAt(terrain, x, y);
            // Dug or raised: a relief to draw (a mount is lit by its slope and carries level lines).
            if (height !== 0) dug = true;
            hash = (Math.imul(hash, 31) + height + 1000) | 0;
            // The soil painted there: its texture is drawn.
            const soil = soilAt(terrain, x, y);
            if (soil !== 0) dug = true;
            hash = (Math.imul(hash, 31) + soil) | 0;
        }
    }
    return dug ? hash.toString(36) : "";
}

/**
 * Which blocks of the relief to draw again: the ones whose inputs (their signature: relief, water, meadow, season,
 * snow) changed since they were drawn, at most BLOCKS_AN_IMAGE an image, the visible ones first. A scroll or a zoom
 * changes no signature: nothing is drawn again.
 */
export class ReliefTileSchedule {
    /** Blocks drawn so far. */
    public redraws = 0;
    private readonly drawn = new Map<string, string>();
    private readonly seen = new Map<string, number>();
    private tick = 0;

    public toRedraw(
        keys: readonly string[],
        signatures: ReadonlyMap<string, string>,
        budget = BLOCKS_AN_IMAGE,
        visible?: ReadonlySet<string>,
    ): string[] {
        this.tick++;
        for (const key of keys) this.seen.set(key, this.tick);
        const stale = keys.filter((key) => this.drawn.get(key) !== signatures.get(key));
        const ordered = visible
            ? [...stale.filter((key) => visible.has(key)), ...stale.filter((key) => !visible.has(key))]
            : stale;
        const chosen = ordered.slice(0, budget);
        for (const key of chosen) this.drawn.set(key, signatures.get(key) ?? "");
        this.redraws += chosen.length;
        return chosen;
    }

    /** A block chosen by toRedraw is drawn from this signature in fact (coarser than asked: it stays to draw again). */
    public mark(key: string, signature: string): void {
        this.drawn.set(key, signature);
    }

    /** Forgets the blocks seen least lately beyond `max`, never the ones in `keep`; returns them. */
    public evict(keep: ReadonlySet<string>, max = KEPT_BLOCKS): string[] {
        if (this.drawn.size <= max) return [];
        const candidates = [...this.drawn.keys()]
            .filter((key) => !keep.has(key))
            .sort((a, b) => (this.seen.get(a) ?? 0) - (this.seen.get(b) ?? 0));
        const dropped = candidates.slice(0, this.drawn.size - max);
        for (const key of dropped) {
            this.drawn.delete(key);
            this.seen.delete(key);
        }
        return dropped;
    }

    /** Everything is to draw again (the editor closed, the map changed). */
    public forget(): void {
        this.drawn.clear();
    }
}
