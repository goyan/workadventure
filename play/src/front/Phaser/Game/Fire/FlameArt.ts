import { hash01 } from "../Autumn/LeafPalette";

/**
 * The detailed flames: a pixel-art fire worked out from a noise that rises, instead of the nested outlines of the
 * quick flames. Each frame is a small picture, the foot of the flame at the middle of its bottom; a flame at its
 * height is DETAILED_FLAME_HEIGHT_PX tall and DETAILED_FLAME_WIDTH_PX wide, as the quick ones, so both are laid the
 * same way (see flamePose).
 */
export const DETAILED_FRAME_WIDTH_PX = 64;
export const DETAILED_FRAME_HEIGHT_PX = 88;
export const DETAILED_FLAME_HEIGHT_PX = 64;
export const DETAILED_FLAME_WIDTH_PX = 44;
/** The loop: this many frames at this pace, and this many different flames so that neighbours do not look alike. */
export const DETAILED_FRAMES = 24;
export const DETAILED_FRAMES_PER_SECOND = 16;
export const DETAILED_VARIANTS = 4;

/** The colours of a flame from its heart to its edge, with the heat from which each shows. */
const PALETTE: readonly { from: number; color: readonly [number, number, number, number] }[] = [
    { from: 0.86, color: [255, 250, 214, 255] },
    { from: 0.68, color: [255, 226, 96, 255] },
    { from: 0.5, color: [255, 172, 40, 255] },
    { from: 0.34, color: [247, 108, 24, 255] },
    { from: 0.2, color: [208, 52, 24, 240] },
    { from: 0.11, color: [130, 30, 22, 190] },
];
const NONE: readonly [number, number, number, number] = [0, 0, 0, 0];
/** The noise repeats every this many pixels upwards: it rises by whole periods over the loop, which then has no seam. */
const NOISE_PERIOD_PX = 48;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A noise from 0 to 1, smooth, that repeats every `period` cells upwards. */
function risingNoise(x: number, y: number, cell: number, period: number, seed: number): number {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const rows = Math.max(1, Math.round(period / cell));
    const wrap = (row: number): number => ((row % rows) + rows) % rows;
    const at = (cx: number, cy: number): number => hash01(cx, wrap(cy), seed);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
}

/**
 * How hot a point of a frame is, from 0 (no flame) to 1 (its heart): the shape of a flame (a belly above its foot, a
 * point at its tip, swaying), eaten by a noise that rises, the more the higher: tongues that lick and break off.
 * `still`: the flame that stands still for who asked for less motion.
 */
export function detailedFlameHeat(x: number, y: number, frame: number, variant: number, still = false): number {
    const turn = still ? 0 : frame / DETAILED_FRAMES;
    const up = (DETAILED_FRAME_HEIGHT_PX - 0.5 - y) / DETAILED_FLAME_HEIGHT_PX;
    if (up < 0 || up > 1.3) return 0;
    const rise = Math.min(1, up);
    // The whole flame sways, its tip the most; each variant in its own time.
    const sway =
        (Math.sin(2 * Math.PI * (turn + variant * 0.27) + rise * 2.4) * 0.13 +
            Math.sin(2 * Math.PI * (2 * turn + variant * 0.61) + rise * 5) * 0.05) *
        rise *
        (still ? 0 : 1);
    const across = (x + 0.5 - DETAILED_FRAME_WIDTH_PX / 2) / (DETAILED_FLAME_WIDTH_PX / 2) - sway;
    // Half its width at this height: a belly a little above the foot, then a long taper.
    const half =
        Math.max(0, 1 - up) ** 0.62 * (0.62 + 0.75 * Math.min(1, up / 0.22) - 0.37 * Math.min(1, up / 0.22) ** 2);
    if (half <= 0) return 0;
    const middle = 1 - Math.abs(across) / half;
    if (middle <= -0.6) return 0;
    const scroll = turn * NOISE_PERIOD_PX;
    const seed = 31 + variant * 7;
    const noise =
        0.62 * risingNoise(x, y + scroll, 8, NOISE_PERIOD_PX, seed) +
        0.38 * risingNoise(x, y + 2 * scroll, 4, NOISE_PERIOD_PX, seed + 1);
    // Hot at the foot and along the middle; the noise bites more and more towards the tip and the edges.
    const body = middle * (0.98 - 0.4 * rise) + 0.14 * (1 - rise);
    let heat = body - noise * (0.3 + 1.0 * rise) + 0.16;
    // A rounded foot, not a flat cut: the sides of the lowest rows are lifted off the ground.
    const footShare = 0.1;
    if (up < footShare) heat -= (1 - up / footShare) * (0.25 + 0.9 * Math.abs(across) ** 2);
    return Math.min(1, Math.max(0, heat));
}

/** The colour of a point of a frame (red, green, blue, opacity, 0 to 255): the heat in a few plain steps. */
export function detailedFlamePixel(
    x: number,
    y: number,
    frame: number,
    variant: number,
    still = false,
): readonly [number, number, number, number] {
    const heat = detailedFlameHeat(x, y, frame, variant, still);
    for (const step of PALETTE) if (heat >= step.from) return step.color;
    if (still) return NONE;
    // Sparks over the flame: a few bright points that rise through the loop and go out.
    const turn = frame / DETAILED_FRAMES;
    for (let spark = 0; spark < 5; spark++) {
        const life = (turn + hash01(spark, variant, 5)) % 1;
        const sx = Math.round(
            DETAILED_FRAME_WIDTH_PX / 2 + (hash01(spark, variant, 9) - 0.5) * 34 + Math.sin(life * 6 + spark) * 4,
        );
        const sy = Math.round(DETAILED_FRAME_HEIGHT_PX - 26 - life * 58);
        if (x === sx && y === sy) return [255, 196, 92, Math.round(255 * (1 - life) ** 0.6)];
    }
    return NONE;
}

/** The frame of the sheet for a frame of the loop and a variant; the frame after the loop is the still flame. */
export function detailedFrameIndex(frame: number, variant: number): number {
    return variant * (DETAILED_FRAMES + 1) + frame;
}

/** Which of the variants a tile or a flame of a tree shows, from its own seed (0 to 1). */
export function detailedVariant(seed: number): number {
    return Math.min(DETAILED_VARIANTS - 1, Math.floor(((seed * 13) % 1) * DETAILED_VARIANTS));
}
