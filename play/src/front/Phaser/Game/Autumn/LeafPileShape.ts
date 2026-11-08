import { hash01, leafColor } from "./LeafPalette";

/** Rows at the bottom of an image where an object touches the ground. */
const BASE_ROWS = 4;
/** The pile covers this share of the base, centred. */
const PILE_SHARE = 0.7;

/** Columns of the frame where the pile goes: the central 70 % of the opaque base. */
export function leafPileSpan(
    alpha: Uint8ClampedArray,
    width: number,
    height: number,
): { left: number; right: number } | undefined {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
        for (let y = Math.max(0, height - BASE_ROWS); y < height; y++) {
            if (alpha[y * width + x] > 0) {
                if (left < 0) left = x;
                right = x;
                break;
            }
        }
    }
    if (left < 0) return undefined;
    const length = right - left + 1;
    const keep = Math.max(1, Math.round(length * PILE_SHARE));
    const start = left + Math.floor((length - keep) / 2);
    return { left: start, right: start + keep - 1 };
}

/** 12 % of the object's height, between 4 and 8 px. */
export function leafPileHeight(height: number): number {
    return Math.min(8, Math.max(4, Math.round(height * 0.12)));
}

/** RGBA of a rounded mound of leaves: full height in the middle, 1 px at the ends, standing on the bottom row. */
export function paintLeafPile(width: number, pileHeight: number, seed: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(width * pileHeight * 4);
    for (let x = 0; x < width; x++) {
        const t = width > 1 ? (2 * x) / (width - 1) - 1 : 0;
        const column = Math.max(1, Math.round(pileHeight * Math.sqrt(Math.max(0, 1 - t * t))));
        for (let r = 0; r < column; r++) {
            const color = leafColor(hash01(x, r, seed));
            const i = ((pileHeight - 1 - r) * width + x) * 4;
            rgba[i] = (color >> 16) & 0xff;
            rgba[i + 1] = (color >> 8) & 0xff;
            rgba[i + 2] = color & 0xff;
            rgba[i + 3] = 255;
        }
    }
    return rgba;
}
