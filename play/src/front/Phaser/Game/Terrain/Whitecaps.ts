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

/** How the shader draws the whitecaps for a share of white water (GroundSplat, uCaps). */
export interface WhitecapDrawing {
    /** The share of the cells of the grid whose crest breaks: never all of them, or the grid shows. */
    cells: number;
    /** How long the crests are across the wind, and how thick along it, against a breeze. */
    length: number;
    thickness: number;
    /** The cut of the noise of the streaks of foam along the wind: 1, none; lower, more of them. */
    streakCut: number;
}

/** No more than this share of the cells breaks at once: past it, the regular grid of the cells shows. */
export const WHITECAP_MOST_CELLS = 0.35;
/** The share of a cell a crest whitens over its life, as thick as in a breeze (measured on the GPU). */
const CREST_SHARE = 0.1;
/** The thickest a crest grows in a gale, against a breeze: still inside its cell (thicker, it was cut square). */
const THICKEST = 1.6;

/**
 * How the shader draws the whitecaps of a share of white water (whitecapShare): crests in more cells as the wind
 * rises, up to WHITECAP_MOST_CELLS; then thicker and longer crests; then, what they cannot whiten, streaks of foam
 * along the wind. Each part measured on the GPU, so that the white drawn follows the law.
 */
export function whitecapDrawing(share: number): WhitecapDrawing {
    const wanted = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0;
    const cells = Math.min(WHITECAP_MOST_CELLS, wanted / CREST_SHARE);
    const thickness =
        cells < WHITECAP_MOST_CELLS ? 1 : Math.min(THICKEST, wanted / (WHITECAP_MOST_CELLS * CREST_SHARE));
    const crests = cells * CREST_SHARE * crestGrowth(thickness);
    const length = 1 + 1.5 * Math.min(1, Math.max(0, (thickness - 1) / (THICKEST - 1)));
    // The streaks whiten their share of the water the crests leave: the two overlap by chance.
    const streaks = crests >= wanted ? 0 : (wanted - crests) / (1 - crests);
    return { cells, length, thickness, streakCut: streakCutFor(streaks) };
}

/** How much more a crest whitens as it grows thicker: as thick (measured on the GPU: 10.1 %, 15.2 % at 1.5, 24.0 % at 2.4). */
function crestGrowth(thickness: number): number {
    return thickness;
}

/**
 * The share of the water the streaks whiten for a cut of their noise, measured on the GPU (Metal), from the cut 0 to 0.9: read backwards for the cut of a share.
 */
const STREAK_SHARES: readonly (readonly [number, number])[] = [
    [0, 1],
    [0.05, 0.994],
    [0.1, 0.9799],
    [0.15, 0.9529],
    [0.2, 0.9092],
    [0.25, 0.845],
    [0.3, 0.7623],
    [0.35, 0.6651],
    [0.4, 0.5583],
    [0.45, 0.4498],
    [0.5, 0.3462],
    [0.55, 0.2525],
    [0.6, 0.1721],
    [0.65, 0.1047],
    [0.7, 0.0561],
    [0.75, 0.0264],
    [0.8, 0.01],
    [0.85, 0.0026],
    [0.9, 0.0003],
];

/** The share of the water the streaks whiten for a cut of their noise (measured on the GPU); none for 1. */
export function streakShareOf(cut: number): number {
    if (!(cut < STREAK_SHARES[STREAK_SHARES.length - 1][0])) return 0;
    if (cut <= 0) return 1;
    for (let at = 1; at < STREAK_SHARES.length; at++) {
        const [upTo, made] = STREAK_SHARES[at];
        const [from, madeBefore] = STREAK_SHARES[at - 1];
        if (cut <= upTo) return madeBefore + ((made - madeBefore) * (cut - from)) / (upTo - from);
    }
    return 0;
}

/** The cut of the noise of the streaks that whitens this share of the water; 1, none. */
export function streakCutFor(share: number): number {
    if (!(share > STREAK_SHARES[STREAK_SHARES.length - 1][1])) return 1;
    if (share >= STREAK_SHARES[0][1]) return STREAK_SHARES[0][0];
    for (let at = 1; at < STREAK_SHARES.length; at++) {
        const [cut, made] = STREAK_SHARES[at];
        const [cutBefore, madeBefore] = STREAK_SHARES[at - 1];
        if (share >= made) return cut + ((cutBefore - cut) * (share - made)) / (madeBefore - made);
    }
    return 1;
}
