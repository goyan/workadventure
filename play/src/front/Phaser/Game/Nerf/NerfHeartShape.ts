import { NERF_THIRDS_PER_HEART } from "./NerfHearts";

/** An original 7 × 6 pixel heart, drawn in the game and in the screen counter alike (`#` = a pixel of the heart). */
export const NERF_HEART_MASK: readonly string[] = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
export const NERF_HEART_WIDTH = 7;
export const NERF_HEART_HEIGHT = NERF_HEART_MASK.length;
export const NERF_HEART_COLORS = { full: 0xe8434f, empty: 0x3b2a33 } as const;

/** A heart fills from left to right: these columns are full for 0, 1, 2 and 3 thirds. */
const FILLED_COLUMNS = [0, 3, 5, NERF_HEART_WIDTH];

/** The pixels of a heart holding `fill` thirds, each full or empty. */
export function heartPixels(fill: 0 | 1 | 2 | 3): { x: number; y: number; filled: boolean }[] {
    const columns = FILLED_COLUMNS[Math.min(fill, NERF_THIRDS_PER_HEART)];
    return NERF_HEART_MASK.flatMap((row, y) =>
        [...row].flatMap((cell, x) => (cell === "#" ? [{ x, y, filled: x < columns }] : [])),
    );
}
