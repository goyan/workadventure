import { heightAt, TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { FACE_JUMP_PX, MAX_DROP, shiftOfHeight } from "./Pixel/ColumnPainter";

// How a column of the relief is drawn lives in a file the worker can load (Pixel/ColumnPainter).
export {
    CLIFF_JUMP_PX,
    DROP_SCALE,
    FACE_JUMP_PX,
    MAX_DROP,
    MAX_RISE,
    paintColumn,
    RELIEF_TEXEL,
    RIM_OUTLINE,
    shiftOfHeight,
    SILHOUETTE_GAP_PX,
} from "./Pixel/ColumnPainter";
export type { ColumnSample } from "./Pixel/ColumnPainter";

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

/** The highest ground of each relief, read once (a relief is never changed in place: an edit makes a new one). */
const highestGrounds = new WeakMap<TerrainData, number>();

/**
 * How far above its place anything of a map is drawn: its highest ground, with `over` px more on it (the water of a lake
 * on a mount); 0 on a map without a mount. What lies south of a point can only hide it, or be found under it, this far.
 */
export function riseOf(terrain: TerrainData | undefined, over = 0): number {
    if (!terrain) return 0;
    let highest = highestGrounds.get(terrain);
    if (highest === undefined) {
        highest = 0;
        for (const chunk of Object.values(terrain.chunks))
            for (const height of chunk) if (height > highest) highest = height;
        highestGrounds.set(terrain, highest);
    }
    return Math.max(0, -shiftOfHeight(highest + Math.max(0, over)));
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
    // From as far north as a hollow draws its floor, to as far south as the highest mount of the map draws its top.
    const rise = riseOf(terrain);
    for (let y = screen.y - MAX_DROP; y <= screen.y + rise; y++) {
        const drawn = drawnAt(y);
        // Drawn further down than the pixel of ground before it: from just under that one down to its own place (as
        // paintColumn stretches it); drawn higher (the north side of a mount, hidden): its own row only.
        const covers =
            drawn > previous
                ? previous < screen.y && drawn >= screen.y - 0.5
                : drawn >= screen.y - 0.5 && drawn < screen.y + 0.5;
        if (covers) {
            let foot = y;
            if (isFace(y)) {
                if (drawnAt(y - 1) < y - 1) {
                    // The south flank of a mount (the face comes down from a ground drawn higher): the mount, its edge
                    // where the flank is a cliff down to the ground.
                    foot = drawnAt(y) < y ? y : y - 1;
                } else {
                    // The face of a hollow: down to where the ground stops falling away, its foot.
                    while (foot < screen.y + MAX_DROP + rise && isFace(foot + 1)) foot++;
                }
            }
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
 * as far south of where the point is drawn as the highest ground (and its water) of the map rises (riseOf).
 */
export function hiddenBehindRim(
    terrain: TerrainData | undefined,
    x: number,
    y: number,
    dropOf: (x: number, y: number) => number,
    /** The deepest water of the map: a lake on a mount draws its surface that much higher still. */
    deepestWater = 0,
): boolean {
    if (!terrain) return false;
    const drawn = y + dropOf(x, y);
    const end = drawn + riseOf(terrain, deepestWater);
    for (let south = Math.floor(y) + 1; south < end; south++) {
        if (south + dropOf(x, south) < drawn - 0.5) return true;
    }
    return false;
}

/**
 * Whether the relief is drawn in 3/4: only when the player chose it (the map is else drawn flat by the other engine of
 * the ground, TerrainView), not while the map editor is open (one digs and places where one aims, on a flat relief),
 * nor in the basic mode (the relief and its water are not drawn at all there).
 */
export function projectionShown(where: { chosen: boolean; editorOpen: boolean; basic: boolean }): boolean {
    return where.chosen && !where.editorOpen && !where.basic;
}
