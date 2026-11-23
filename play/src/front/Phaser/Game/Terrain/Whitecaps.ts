/**
 * The whitecaps of the wind on open water: the short, steep waves a wind raises break at their crests. They have
 * nothing to do with a long swell (the wave of an impact over deep water makes none): they come with the wind
 * alone, a few from force 3 of Beaufort, many at force 4, more and more at 5 and 6. Drawn by the water shader
 * (GroundSplat), which is told the share of the water they whiten and which way the wind blows.
 */

/** Water this deep at least carries whitecaps, in pixels (a quarter of a tile): a puddle raises no waves. */
export const WHITECAP_MIN_DEPTH_PX = 8;

/**
 * The share of open water white with foam under a wind of that speed (km/h, ten metres up), from 0 to 1: the
 * usual law of the whitecap coverage of the sea (Monahan and O'Muircheartaigh, 1980: 3.84 millionths of the speed
 * of the wind, in metres a second, to the power 3.41). About 0.03 % at force 3, 0.3 % at force 4, 1 % at force 5,
 * 2.4 % at force 6. Nothing under 3 m/s: no crest breaks.
 */
export function whitecapShare(windKmh: number | undefined): number {
    if (windKmh === undefined || !Number.isFinite(windKmh)) return 0;
    const metresASecond = windKmh / 3.6;
    if (metresASecond < 3) return 0;
    return Math.min(1, 3.84e-6 * Math.pow(metresASecond, 3.41));
}

/**
 * Which way the wind blows on the map, as a vector of length 1 (map pixels: east and south positive), from the
 * direction it comes from in degrees (0: from the north, 90: from the east). Undefined: no wind known.
 */
export function windHeading(windFrom: number | undefined): { x: number; y: number } | undefined {
    if (windFrom === undefined || !Number.isFinite(windFrom)) return undefined;
    const angle = (windFrom * Math.PI) / 180;
    return { x: -Math.sin(angle) || 0, y: Math.cos(angle) || 0 };
}

/** The whitecaps follow the law up to this wind (m/s): the measures it comes from go no further. */
const LAW_UP_TO_MS = 25;
/** Past it, the white of the sea creeps toward this, never more: the water stays seen. */
export const MOST_WHITE = 0.45;
/** How fast it creeps there, in share of the law past its end. */
const CREEP = 0.3;

/**
 * The white the sea is drawn with for a share of white water (whitecapShare): the law up to 25 m/s (90 km/h), where
 * the measures behind it end; past it, the law grows out of hand (96 % at 138 km/h), and the white only creeps toward
 * MOST_WHITE, so that the water is still seen in a hurricane.
 */
export function whitecapWhite(share: number): number {
    const law = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0;
    const end = lawEnd();
    if (law <= end) return law;
    return end + (MOST_WHITE - end) * (1 - Math.exp(-(law - end) / CREEP));
}

let lawEndMemo: number | undefined;
function lawEnd(): number {
    lawEndMemo ??= whitecapShare(LAW_UP_TO_MS * 3.6);
    return lawEndMemo;
}

/**
 * Past the whitecaps, the sea of a hurricane: from about 30 m/s the whitecaps stop growing and streaks of foam and
 * spray along the wind take over; by about 40 m/s (144 km/h) they cover the waves as a white sheet, the sea a milky
 * white without distinct waves (Holthuijsen, Powell and Pietrzak 2012, Journal of Geophysical Research 117, C09003,
 * from low-level reconnaissance films and dropsondes; the thresholds [Gemini, to be checked against the paper]).
 * Beaufort 12 (WMO): "Sea completely white with driving spray; visibility very seriously affected".
 */
export const SPUME_FROM_MS = 30;
export const SPUME_WHOLE_MS = 40;

/** How much of that white sheet a wind (km/h, ten metres up) lays on open water, 0 to 1. */
export function spumeShare(windKmh: number | undefined): number {
    if (windKmh === undefined || !Number.isFinite(windKmh)) return 0;
    const t = Math.max(0, Math.min(1, (windKmh / 3.6 - SPUME_FROM_MS) / (SPUME_WHOLE_MS - SPUME_FROM_MS)));
    return t * t * (3 - 2 * t);
}
