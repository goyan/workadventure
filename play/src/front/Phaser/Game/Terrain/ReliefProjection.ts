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
 * southernmost) is the one seen: a rim hides what lies behind it. A point on the face of a drop (where the drawing of
 * the ground jumps down) is taken to the foot of that face: one clicks where one wants to go.
 */
export function groundPointAt(
    terrain: TerrainData | undefined,
    screen: { x: number; y: number },
): { x: number; y: number } {
    if (!terrain) return { ...screen };
    const drawnAt = (y: number): number => y + dropAt(terrain, screen.x, y);
    let found: number | undefined;
    let previous = drawnAt(screen.y - MAX_DROP - 1);
    for (let y = screen.y - MAX_DROP; y <= screen.y; y++) {
        const drawn = drawnAt(y);
        if (Math.abs(drawn - screen.y) <= 0.5) {
            found = y;
        } else if (previous < screen.y && drawn > screen.y) {
            // On the face of a drop: down to where the ground stops falling away.
            let foot = y;
            while (foot < screen.y + MAX_DROP && drawnAt(foot + 1) - drawnAt(foot) > 1) foot++;
            found = foot;
        }
        previous = drawn;
    }
    return { x: screen.x, y: found ?? screen.y };
}
