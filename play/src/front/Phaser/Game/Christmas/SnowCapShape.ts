/** Alpha at or above this is part of the object's silhouette. */
const OPAQUE = 128;
const SNOW_TOP = [0xf6, 0xf8, 0xff];
const SNOW_SHADE = [0xc5, 0xd0, 0xee];
const SHADE_PX = 2;

/** For each column, the first row whose alpha is opaque, or -1. `alpha` holds one byte per pixel. */
export function snowCapTops(alpha: Uint8ClampedArray, width: number, height: number): Int16Array {
    const tops = new Int16Array(width).fill(-1);
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (alpha[y * width + x] >= OPAQUE) {
                tops[x] = y;
                break;
            }
        }
    }
    return tops;
}

/** Thick, round snow like on a winter map: 18 % of the object's height, 4 to 12 px. */
export function snowCapThickness(height: number): number {
    return Math.min(12, Math.max(4, Math.round(height * 0.18)));
}

/**
 * RGBA pixels of the snow lying on top of an image: a light band shaded on its last 2 px, thinner on the two columns
 * at each end of a run of opaque columns so that the cap looks rounded. Only painted over opaque pixels.
 */
export function paintSnowCap(alpha: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(width * height * 4);
    const tops = snowCapTops(alpha, width, height);
    const thickness = snowCapThickness(height);
    for (let x = 0; x < width; x++) {
        const top = tops[x];
        if (top < 0) continue;
        const nearStart = x < 2 || tops[x - 1] < 0 || tops[x - 2] < 0;
        const nearEnd = x >= width - 2 || tops[x + 1] < 0 || tops[x + 2] < 0;
        const band = nearStart || nearEnd ? Math.floor(thickness / 2) : thickness;
        for (let y = top; y < Math.min(height, top + band); y++) {
            if (alpha[y * width + x] < OPAQUE) continue;
            const color = y >= top + band - SHADE_PX ? SNOW_SHADE : SNOW_TOP;
            const i = (y * width + x) * 4;
            rgba[i] = color[0];
            rgba[i + 1] = color[1];
            rgba[i + 2] = color[2];
            rgba[i + 3] = 255;
        }
    }
    return rgba;
}
