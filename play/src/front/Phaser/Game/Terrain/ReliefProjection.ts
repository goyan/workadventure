import { heightAt, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/**
 * The relief seen in 3/4, as the floors are: a point of the dug ground is drawn lower on the screen by half its depth
 * (the floors are drawn higher by their altitude). Its true place stays on the ground: only the drawing moves.
 */
export const DROP_SCALE = 0.5;
/** The deepest a map is dug (8 tiles of 32 px) drawn at half: no point of the ground is drawn lower than this. */
export const MAX_DROP = 128;

/** The height of the ground at a point of the map, between the centres of its cells: negative where it is dug. */
export function heightAtPoint(terrain: TerrainData | undefined, x: number, y: number): number {
    if (!terrain) return 0;
    const fx = x / TERRAIN_CELL - 0.5;
    const fy = y / TERRAIN_CELL - 0.5;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tx = fx - cx;
    const ty = fy - cy;
    const top = heightAt(terrain, cx, cy) * (1 - tx) + heightAt(terrain, cx + 1, cy) * tx;
    const bottom = heightAt(terrain, cx, cy + 1) * (1 - tx) + heightAt(terrain, cx + 1, cy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
}

/** How much lower than its place a point of the ground is drawn. */
export function dropAt(terrain: TerrainData | undefined, x: number, y: number): number {
    return Math.min(MAX_DROP, Math.max(0, -heightAtPoint(terrain, x, y)) * DROP_SCALE);
}

/**
 * The point of the ground drawn under a point of the screen. Going from the north, the ground drawn last (the
 * southernmost) is the one seen: a rim hides what lies behind it, a bridge the hollow under it. A point on the face
 * of a drop (where the drawing of the ground jumps down) is taken to the foot of that face: one clicks where one
 * wants to go.
 */
export function groundPointAt(
    terrain: TerrainData | undefined,
    screen: { x: number; y: number },
    /** Whether a point of the map is on the deck of a bridge: drawn at its place, over the hollow under it. */
    onBridge?: (x: number, y: number) => boolean,
): { x: number; y: number } {
    if (!terrain) return { ...screen };
    const drawnAt = (y: number): number => y + (onBridge?.(screen.x, y) ? 0 : dropAt(terrain, screen.x, y));
    // A face: the drawing jumps down by more than a texel for a pixel of ground (as paintColumn draws one).
    const isFace = (y: number): boolean => drawnAt(y) - drawnAt(y - 1) > RELIEF_TEXEL;
    let found: number | undefined;
    let previous = drawnAt(screen.y - MAX_DROP - 1);
    for (let y = screen.y - MAX_DROP; y <= screen.y; y++) {
        const drawn = drawnAt(y);
        // The pixel of ground y is drawn from just under the one before it down to its own place.
        if (previous < screen.y && drawn >= screen.y - 0.5) {
            let foot = y;
            // On a face: down to where the ground stops falling away, its foot.
            if (isFace(y)) while (foot < screen.y + MAX_DROP && isFace(foot + 1)) foot++;
            found = foot;
        }
        previous = drawn;
    }
    return { x: screen.x, y: found ?? screen.y };
}

/** Map pixels for a texel of the drawing of the relief. */
export const RELIEF_TEXEL = 2;
/**
 * The face of a drop: this much lighter than its tint at the rim, darker as it goes down, as dark as WALL_FOOT from
 * WALL_DARK_DROP px of drop on. Shaded by how far down it is, not by its place in one gap: a slope drawn as many small
 * gaps is one even face, not stripes.
 */
const WALL_TOP = 1.15;
const WALL_FOOT = 0.55;
const WALL_DARK_DROP = 64;
/** A darker stratum of the face every this many texels of the screen. */
const STRATUM_TEXELS = 4;
const STRATUM_SHADE = 0.85;

/** A texel of the ground of a column, as `paintColumn` draws it. */
export interface ColumnSample {
    /** Its place on the ground (map pixels). */
    groundY: number;
    /** How much lower it is drawn (dropAt, or the drop of the surface of the water over it). */
    drop: number;
    color: readonly [number, number, number];
    /** The colour of the face of a drop that starts at it. */
    wallTint: readonly [number, number, number];
    /** Flat ground: left to the map, unless it hides something drawn before it. */
    plain: boolean;
}

function put(out: Uint8ClampedArray, index: number, red: number, green: number, blue: number): void {
    out[index] = red;
    out[index + 1] = green;
    out[index + 2] = blue;
    out[index + 3] = 255;
}

/**
 * Draws one column of texels of a block of the relief (`rows` texels from the screen row `firstRow`, one texel a
 * RELIEF_TEXEL of the screen) into the RGBA pixels `out`, `stride` texels a row. The samples go from the north to
 * the south, from far enough north for the highest face to reach the block. Each one is drawn over what is there
 * (the south rim hides the floor behind it); where the drawing jumps down, the face of the drop fills the gap.
 */
export function paintColumn(
    samples: readonly ColumnSample[],
    rows: number,
    firstRow: number,
    out: Uint8ClampedArray,
    stride: number,
    column: number,
): void {
    const index = (row: number): number => (row * stride + column) * 4;
    let previous: number | undefined;
    let previousDrop = 0;
    let previousTint: readonly [number, number, number] | undefined;
    for (const sample of samples) {
        const at = Math.round((sample.groundY + sample.drop) / RELIEF_TEXEL) - firstRow;
        if (previous !== undefined && previousTint && at > previous + 1) {
            const span = at - previous;
            for (let k = 1; k < span; k++) {
                const row = previous + k;
                if (row < 0 || row >= rows) continue;
                const drop = previousDrop + ((sample.drop - previousDrop) * k) / span;
                const t = Math.min(1, drop / WALL_DARK_DROP);
                const stratum = (row + firstRow) % STRATUM_TEXELS === 0 ? STRATUM_SHADE : 1;
                const shade = (WALL_TOP * (1 - t) + WALL_FOOT * t) * stratum;
                put(out, index(row), previousTint[0] * shade, previousTint[1] * shade, previousTint[2] * shade);
            }
        }
        if (at >= 0 && at < rows && (!sample.plain || out[index(at) + 3] > 0)) {
            put(out, index(at), sample.color[0], sample.color[1], sample.color[2]);
        }
        previous = at;
        previousDrop = sample.drop;
        previousTint = sample.wallTint;
    }
}

/**
 * Whether the relief is drawn in 3/4: not while the map editor is open (one digs and places where one aims, on a flat
 * relief), nor in the basic mode (the relief and its water are not drawn at all there).
 */
export function projectionShown(where: { editorOpen: boolean; basic: boolean }): boolean {
    return !where.editorOpen && !where.basic;
}
