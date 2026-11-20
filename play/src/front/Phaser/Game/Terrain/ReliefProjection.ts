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

/** The highest a map is raised (256 px) drawn at half: no point of the ground is drawn higher than this. */
export const MAX_RISE = 128;

/** How far a point of the ground is drawn from its place, given its height (or that of the water over it). */
export function shiftOfHeight(height: number): number {
    // + 0: no -0 for a flat ground.
    return Math.min(MAX_DROP, Math.max(-MAX_RISE, -height * DROP_SCALE)) + 0;
}

/**
 * How much lower than its place a point of the ground is drawn: positive in a hollow, negative on a mount (drawn
 * higher by half its height).
 */
export function shiftAt(terrain: TerrainData | undefined, x: number, y: number): number {
    return shiftOfHeight(heightAtPoint(terrain, x, y));
}

/**
 * The point of the ground drawn under a point of the screen. Going from the north, the ground drawn last (the
 * southernmost) is the one seen: a rim hides what lies behind it, a mount the ground behind it, a bridge the hollow
 * under it. A point on the face of a drop (where the drawing of the ground jumps down) is taken to the foot of that
 * face: one clicks where one wants to go.
 */
export function groundPointAt(
    terrain: TerrainData | undefined,
    screen: { x: number; y: number },
    /** Whether a point of the map is on the deck of a bridge: drawn at its place, over the hollow under it. */
    onBridge?: (x: number, y: number) => boolean,
): { x: number; y: number } {
    if (!terrain) return { ...screen };
    const drawnAt = (y: number): number => y + (onBridge?.(screen.x, y) ? 0 : shiftAt(terrain, screen.x, y));
    // A face: the drawing jumps down by more than FACE_JUMP_PX for a pixel of ground (as paintColumn draws one).
    const isFace = (y: number): boolean => drawnAt(y) - drawnAt(y - 1) > FACE_JUMP_PX;
    let found: number | undefined;
    let previous = drawnAt(screen.y - MAX_DROP - 1);
    // From as far north as a hollow draws its floor, to as far south as a mount draws its top.
    for (let y = screen.y - MAX_DROP; y <= screen.y + MAX_RISE; y++) {
        const drawn = drawnAt(y);
        // Drawn further down than the pixel of ground before it: from just under that one down to its own place (as
        // paintColumn stretches it); drawn higher (the north side of a mount, hidden): its own row only.
        const covers =
            drawn > previous
                ? previous < screen.y && drawn >= screen.y - 0.5
                : drawn >= screen.y - 0.5 && drawn < screen.y + 0.5;
        if (covers) {
            let foot = y;
            // On a face: down to where the ground stops falling away, its foot.
            if (isFace(y)) while (foot < screen.y + MAX_DROP + MAX_RISE && isFace(foot + 1)) foot++;
            found = foot;
        }
        previous = drawn;
    }
    return { x: screen.x, y: found ?? screen.y };
}

/**
 * Whether a point of the ground (or of the surface of its water: `dropOf`) is hidden in 3/4 by the ground south of it:
 * the south rim of a hollow drawn over the floor behind it, or a mount drawn over the ground north of it. A ground
 * further south hides it when it is drawn as high or higher on the screen; it can only be between the point and
 * MAX_RISE south of where the point is drawn (a ground is never drawn higher than that above its place).
 */
export function hiddenBehindRim(
    terrain: TerrainData | undefined,
    x: number,
    y: number,
    dropOf: (x: number, y: number) => number,
): boolean {
    if (!terrain) return false;
    const drawn = y + dropOf(x, y);
    for (let south = Math.floor(y) + 1; south < drawn + MAX_RISE; south++) {
        if (south + dropOf(x, south) < drawn - 0.5) return true;
    }
    return false;
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
/**
 * The south flank of a mount (a face that comes down from a raised ground): its ground in the shade while the drawing
 * falls less than this many pixels for a pixel of ground, rock from there on (a cliff).
 */
export const CLIFF_JUMP_PX = 6;
/**
 * The silhouette of a mount (or the south rim of a hollow) where it hides the ground behind it: two pixels one over the
 * other whose points of the ground are further apart than this on the map. Cerned with RIM_OUTLINE.
 */
export const SILHOUETTE_GAP_PX = 6;
/** The shade of the ground of the flank of a mount (0 to 1 on its ramp). */
const FLANK_SHADE = 0.25;
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
    /** Undefined where nothing covers the ground: left to the map, cleared where it hides something. */
    color: Rgb | undefined;
    /** The shades of the face of a drop that goes down from it. */
    wallRamp: Ramp;
    /** The shades of its ground, for the gentle flank of a mount that comes down to it. */
    flankRamp: Ramp;
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

/** The point of the ground each row of the column shows, from the row -1 (just above the block): NaN where none. */
let rowGround = new Float64Array(0);

/**
 * Draws one column of a block of the relief (`rows` pixels from the screen row `firstRow`) into the RGBA pixels `out`,
 * `stride` pixels a row. The `count` first samples go from the north to the south, from far enough north for the
 * deepest face to reach the block to far enough south for the highest mount. Each one is drawn over what is there
 * (the south rim hides the floor behind it, a mount the ground behind it). Where the drawing falls more than
 * FACE_JUMP_PX, a face fills the gap: the face of a hollow (below the ground, rock, cerned at its top) or the south
 * flank of a mount (above it: its ground in the shade, rock where it is a cliff, cerned at its foot). The silhouette
 * of what hides the ground behind it is cerned too.
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
    if (rowGround.length < rows + 1) rowGround = new Float64Array(rows + 1);
    rowGround.fill(Number.NaN, 0, rows + 1);
    const showGround = (row: number, groundY: number): void => {
        if (row >= -1 && row < rows) rowGround[row + 1] = groundY;
    };
    let previous: number | undefined;
    let previousDrawn = 0;
    let previousDrop = 0;
    let onFace = false;
    for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
        const sample = samples[sampleIndex];
        const drawn = sample.groundY + sample.drop;
        const at = Math.round(drawn) - firstRow;
        const jump = previous === undefined ? 0 : at - previous;
        // A face where the drawing falls more than FACE_JUMP_PX exactly (as groundPointAt sees it), not after the
        // rounding: a slope near the threshold would else alternate face and ground, a stripe each time.
        if (previous !== undefined && drawn - previousDrawn > FACE_JUMP_PX) {
            const steep = drawn - previousDrawn >= CLIFF_JUMP_PX;
            const next = sampleIndex + 1 < count ? samples[sampleIndex + 1] : undefined;
            // The face goes on with the next sample: its foot is further south.
            const goesOn = next !== undefined && next.groundY + next.drop - drawn > FACE_JUMP_PX;
            let wasFlank = previousDrop < 0;
            let flankRows = 0;
            for (let k = 1; k < jump; k++) {
                const row = previous + k;
                const drop = previousDrop + ((sample.drop - previousDrop) * k) / jump;
                const flank = drop < 0;
                let color: Rgb;
                if (flank) {
                    color = steep
                        ? wallShade(sample.wallRamp, -drop, column, row + firstRow)
                        : shadeAt(sample.flankRamp, FLANK_SHADE, column, row + firstRow);
                    flankRows++;
                } else {
                    // The rim of a hollow: where its face starts, under flat ground or at the foot of a flank.
                    const rim = wasFlank || (k === 1 && !onFace);
                    color = rim ? RIM_OUTLINE : wallShade(sample.wallRamp, drop, column, row + firstRow);
                }
                wasFlank = flank;
                showGround(row, sample.groundY);
                if (row >= 0 && row < rows) put(out, index(row), color);
            }
            showGround(at, sample.groundY);
            if (sample.drop > 0 || previousDrop >= 0) {
                // The face of a hollow (or a flank going on down into one): its foot is part of it.
                if (at >= 0 && at < rows)
                    put(out, index(at), wallShade(sample.wallRamp, sample.drop, column, at + firstRow));
            } else if (goesOn) {
                // The flank goes on: this sample is part of it.
                if (at >= 0 && at < rows)
                    put(
                        out,
                        index(at),
                        steep
                            ? wallShade(sample.wallRamp, -sample.drop, column, at + firstRow)
                            : shadeAt(sample.flankRamp, FLANK_SHADE, column, at + firstRow),
                    );
            } else {
                // The foot of the flank: cerned, then its ground.
                const foot = at - 1;
                if (flankRows > 0 && foot >= 0 && foot < rows) put(out, index(foot), RIM_OUTLINE);
                paintGround(sample, at, at, rows, out, index);
            }
            onFace = true;
        } else {
            // A gentle slope: the ground stretched over the rows it skips.
            const from = previous !== undefined && jump > 1 ? previous + 1 : at;
            for (let row = from; row <= at; row++) showGround(row, sample.groundY);
            paintGround(sample, from, at, rows, out, index);
            onFace = false;
        }
        previous = at;
        previousDrawn = drawn;
        previousDrop = sample.drop;
    }
    // The silhouette: a drawn pixel that shows a ground far south of the one just above it hides that ground.
    for (let row = 0; row < rows; row++) {
        const above = rowGround[row];
        if (!(rowGround[row + 1] - above > SILHOUETTE_GAP_PX)) continue;
        if (out[index(row) + 3] > 0) put(out, index(row), RIM_OUTLINE);
    }
}

/** Draws the ground of a sample over the rows `from` to `to` (the plain ground is left to the map). */
function paintGround(
    sample: ColumnSample,
    from: number,
    to: number,
    rows: number,
    out: Uint8ClampedArray,
    index: (row: number) => number,
): void {
    for (let row = from; row <= to; row++) {
        if (row >= 0 && row < rows && (!sample.plain || out[index(row) + 3] > 0)) {
            if (sample.color) put(out, index(row), sample.color);
            // Bare ground that hides what is behind it: its own tiles show there.
            else out[index(row) + 3] = 0;
        }
    }
}

/**
 * Whether the relief is drawn in 3/4: not while the map editor is open (one digs and places where one aims, on a flat
 * relief), nor in the basic mode (the relief and its water are not drawn at all there).
 */
export function projectionShown(where: { editorOpen: boolean; basic: boolean }): boolean {
    return !where.editorOpen && !where.basic;
}
