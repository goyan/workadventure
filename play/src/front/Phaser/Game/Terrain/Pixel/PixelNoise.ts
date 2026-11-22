/**
 * The noise the pixel-art terrain is drawn with: the same number for the same point, everywhere and every time, so a
 * block drawn again, or its neighbour, matches it pixel for pixel.
 */

/** A number in [0, 1) for a whole point of the map. */
export function hash2(x: number, y: number): number {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** A number in [0, 1] that changes smoothly between whole points (hash2 at each of them). */
export function valueNoise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = x - xi;
    const ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
