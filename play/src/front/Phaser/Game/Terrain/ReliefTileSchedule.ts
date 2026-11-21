import { heightAt, soilAt } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { blockCellWindow } from "./Pixel/BlockWindow";

// The window of a block and the fineness of its drawing live in a file the worker can load (Pixel/BlockWindow).
export { blockCellWindow, COARSE_TEXEL, NORTH_ROWS, SHADOW_CELLS, SOUTH_ROWS, texelFor } from "./Pixel/BlockWindow";

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

    /**
     * Forgets the blocks seen least lately while all those seen weigh more than `max`, never the ones in `keep` nor
     * the ones that weigh nothing (`weightOf`: 1 each by default); returns them.
     */
    public evict(keep: ReadonlySet<string>, max = KEPT_BLOCKS, weightOf: (key: string) => number = () => 1): string[] {
        let total = 0;
        for (const key of this.seen.keys()) total += weightOf(key);
        if (total <= max) return [];
        const candidates = [...this.seen.keys()]
            .filter((key) => !keep.has(key) && weightOf(key) > 0)
            .sort((a, b) => (this.seen.get(a) ?? 0) - (this.seen.get(b) ?? 0));
        const dropped: string[] = [];
        for (const key of candidates) {
            if (total <= max) break;
            total -= weightOf(key);
            dropped.push(key);
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
