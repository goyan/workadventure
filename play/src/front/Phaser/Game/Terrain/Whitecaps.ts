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
