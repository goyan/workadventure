import { heightAt, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { shadeAt } from "./Pixel/PixelPalette";
import type { Ramp, Rgb } from "./Pixel/PixelPalette";

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
    // A face: the drawing jumps down by more than FACE_JUMP_PX for a pixel of ground (as paintColumn draws one).
    const isFace = (y: number): boolean => drawnAt(y) - drawnAt(y - 1) > FACE_JUMP_PX;
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

/** Map pixels for a texel of the drawing of the relief: pixel art, one for one. */
export const RELIEF_TEXEL = 1;
/**
 * A face of a drop: where the drawing of the ground falls more than this many pixels for a pixel of ground (the ground
 * slopes down more than twice as fast as it goes south). Gentler, the ground is only stretched on the screen.
 */
export const FACE_JUMP_PX = 2;
/** The dark line along the top of the face of a drop: the rim of a hollow. */
export const RIM_OUTLINE: Rgb = [0x2a, 0x24, 0x20];
/** The face is as dark as its foot from this drop on (px). */
const WALL_DARK_DROP = 64;
/** A darker stratum of the face every this many rows of the screen. */
const STRATUM_ROWS = 5;

/** A pixel of the ground of a column, as `paintColumn` draws it. */
export interface ColumnSample {
    /** Its place on the ground (map pixels). */
    groundY: number;
    /** How much lower it is drawn (dropAt, or the drop of the surface of the water over it). */
    drop: number;
    color: Rgb;
    /** The shades of the face of a drop that goes down from it. */
    wallRamp: Ramp;
    /** Flat ground: left to the map, unless it hides something drawn before it. */
    plain: boolean;
}

function put(out: Uint8ClampedArray, index: number, color: Rgb): void {
    out[index] = color[0];
    out[index + 1] = color[1];
    out[index + 2] = color[2];
    out[index + 3] = 255;
}

/** The shade of the face of a drop at a row of the screen, for the drop reached there. */
function wallShade(ramp: Ramp, drop: number, column: number, screenRow: number): Rgb {
    const reached = Math.min(1, drop / WALL_DARK_DROP);
    const stratum = screenRow % STRATUM_ROWS === 0 ? 0.2 : 0;
    return shadeAt(ramp, 0.75 - reached * 0.6 - stratum, column, screenRow);
}

/**
 * Draws one column of a block of the relief (`rows` pixels from the screen row `firstRow`) into the RGBA pixels `out`,
 * `stride` pixels a row. The `count` first samples go from the north to the south, from far enough north for the
 * highest face to reach the block. Each one is drawn over what is there (the south rim hides the floor behind it).
 * Where the drawing falls more than FACE_JUMP_PX, the face of the drop fills the gap, cerned at its top, and the
 * sample at its foot is part of it: a steep slope is one face, not lines of ground across it.
 */
export function paintColumn(
    samples: readonly ColumnSample[],
    count: number,
    rows: number,
    firstRow: number,
    out: Uint8ClampedArray,
    stride: number,
    column: number,
): void {
    const index = (row: number): number => (row * stride + column) * 4;
    let previous: number | undefined;
    let previousDrop = 0;
    let onFace = false;
    for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
        const sample = samples[sampleIndex];
        const at = Math.round(sample.groundY + sample.drop) - firstRow;
        const jump = previous === undefined ? 0 : at - previous;
        if (previous !== undefined && jump > FACE_JUMP_PX) {
            for (let k = 1; k < jump; k++) {
                const row = previous + k;
                if (row < 0 || row >= rows) continue;
                const drop = previousDrop + ((sample.drop - previousDrop) * k) / jump;
                const color =
                    k === 1 && !onFace ? RIM_OUTLINE : wallShade(sample.wallRamp, drop, column, row + firstRow);
                put(out, index(row), color);
            }
            if (at >= 0 && at < rows)
                put(out, index(at), wallShade(sample.wallRamp, sample.drop, column, at + firstRow));
            onFace = true;
        } else {
            // A gentle slope: the ground stretched over the row it skips.
            const from = previous !== undefined && jump === FACE_JUMP_PX ? at - 1 : at;
            for (let row = from; row <= at; row++) {
                if (row >= 0 && row < rows && (!sample.plain || out[index(row) + 3] > 0)) {
                    put(out, index(row), sample.color);
                }
            }
            onFace = false;
        }
        previous = at;
        previousDrop = sample.drop;
    }
}

/**
 * Whether the relief is drawn in 3/4: not while the map editor is open (one digs and places where one aims, on a flat
 * relief), nor in the basic mode (the relief and its water are not drawn at all there).
 */
export function projectionShown(where: { editorOpen: boolean; basic: boolean }): boolean {
    return !where.editorOpen && !where.basic;
}
