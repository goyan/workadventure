import { heightAt, soilAt, TERRAIN_CHUNK } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** Rows of cells north of a block read to draw it: the highest face of a drop (128 px drawn, 8 cells) reaches it. */
export const NORTH_ROWS = 8;
/** The most blocks drawn in one image of the game; the others wait for the next one. */
export const BLOCKS_AN_IMAGE = 1;
/** The most blocks kept drawn. */
export const KEPT_BLOCKS = 64;

/**
 * The heights and soils a block of the relief is drawn from (its cells, the NORTH_ROWS rows north of it, one more all around), as a short text:
 * the same relief gives the same text. Empty when none of them is dug.
 */
export function reliefSignature(terrain: TerrainData | undefined, blockX: number, blockY: number): string {
    if (!terrain) return "";
    let hash = 0;
    let dug = false;
    // The cells the drawing of the block reads: its own and the NORTH_ROWS north of it, and one more all around
    // (the heights are interpolated between the centres of the cells).
    const firstX = blockX * TERRAIN_CHUNK - 1;
    const firstY = blockY * TERRAIN_CHUNK - NORTH_ROWS - 1;
    for (let y = firstY; y <= (blockY + 1) * TERRAIN_CHUNK; y++) {
        for (let x = firstX; x <= firstX + TERRAIN_CHUNK + 1; x++) {
            const height = heightAt(terrain, x, y);
            if (height < 0) dug = true;
            hash = (Math.imul(hash, 31) + height + 1000) | 0;
            // The soil painted there: its texture is drawn.
            hash = (Math.imul(hash, 31) + soilAt(terrain, x, y)) | 0;
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
