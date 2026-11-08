/** Autumn leaves: orange, ochre, red-brown, brown. */
export const LEAF_COLORS = [0xc8642a, 0xd9a23b, 0x9b3d23, 0x7a5a2e] as const;

/** A colour of the palette for a seed in [0, 1). */
export function leafColor(seed: number): number {
    const index = Math.min(LEAF_COLORS.length - 1, Math.max(0, Math.floor(seed * LEAF_COLORS.length)));
    return LEAF_COLORS[index];
}

/** The same pseudo-random value in [0, 1) for the same inputs, on every computer. */
export function hash01(a: number, b: number, salt = 0): number {
    return Math.abs(Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453) % 1;
}
