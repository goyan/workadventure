/**
 * The whitecaps of the wind on open water: the short, steep waves a wind raises break at their crests. They have
 * nothing to do with a long swell (the wave of an impact over deep water makes none): they come with the wind
 * alone, a few from force 3 of Beaufort, many at force 4, more and more at 5 and 6.
 */

/** Water this deep at least carries whitecaps, in pixels (a quarter of a tile): a puddle raises no waves. */
export const WHITECAP_MIN_DEPTH_PX = 8;
/** The most whitecaps on the screen at once. */
export const MOST_WHITECAPS = 320;
/** A whitecap covers about this much water, in map pixels squared: a crest a dozen pixels long. */
const WHITECAP_AREA_PX2 = 30;
/** Points of the screen tried at each step: they tell how much of it is open water, and where new crests break. */
const TRIES = 40;
/** A whitecap lives this long, in ms: the shortest, and what chance adds to it. */
const LIFE_MS = 700;
const LIFE_SPREAD_MS = 900;
const FADE_MS = 200;
/** It drifts downwind at this share of the speed of the wind: the crest runs, the foam it leaves hardly moves. */
const DRIFT_SHARE = 0.04;
/** A crest is this long across the wind, in map pixels: the shortest, and what chance adds to it. */
const CREST_PX = 6;
const CREST_SPREAD_PX = 9;
const LONGEST_STEP_MS = 200;

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

export interface Whitecap {
    x: number;
    y: number;
    /** Half the length of its crest, in map pixels. */
    half: number;
    age: number;
    life: number;
}

export interface WhitecapView {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The whitecaps on the open water the screen shows: as many as the wind makes of it, born at random places of that
 * water, drifting slowly downwind and gone in a second or so. Each browser has its own (a decor), all from the
 * same wind.
 */
export class Whitecaps {
    private readonly held: Whitecap[] = [];

    constructor(
        /** Whether a point of the map (map pixels) is open water that can carry whitecaps. */
        private readonly isOpenWater: (x: number, y: number, now: number) => boolean,
        private readonly random: () => number = Math.random,
    ) {}

    public caps(): readonly Whitecap[] {
        return this.held;
    }

    public clear(): void {
        this.held.length = 0;
    }

    /**
     * Carries the whitecaps for `elapsed` ms under that wind (km/h, and where it comes from in degrees) and lets
     * new ones break over what the screen shows.
     */
    public step(
        now: number,
        elapsed: number,
        view: WhitecapView,
        windKmh: number | undefined,
        windFrom: number | undefined,
    ): void {
        const ms = Math.max(0, Math.min(LONGEST_STEP_MS, elapsed));
        const share = whitecapShare(windKmh);
        const heading = windHeading(windFrom) ?? { x: 0, y: 0 };
        // Kilometres an hour to map pixels a second is not a scale of the map: a drift that reads, no more.
        const drift = ((windKmh ?? 0) * DRIFT_SHARE * ms) / 1000;
        const held = this.held;
        let kept = 0;
        for (const cap of held) {
            cap.x += heading.x * drift;
            cap.y += heading.y * drift;
            cap.age += ms;
            // A calm that falls ends them at once; so does the shore.
            if (share > 0 && cap.age < cap.life && this.isOpenWater(cap.x, cap.y, now)) held[kept++] = cap;
        }
        held.length = kept;
        if (share <= 0 || view.width <= 0 || view.height <= 0) return;
        // The points tried tell how much of the screen is open water, and are where the new crests break.
        const places: { x: number; y: number }[] = [];
        for (let attempt = 0; attempt < TRIES; attempt++) {
            const x = view.x + this.random() * view.width;
            const y = view.y + this.random() * view.height;
            if (this.isOpenWater(x, y, now)) places.push({ x, y });
        }
        const water = (places.length / TRIES) * view.width * view.height;
        const wanted = Math.min(MOST_WHITECAPS, Math.round((share * water) / WHITECAP_AREA_PX2));
        for (const place of places) {
            if (held.length >= wanted) break;
            held.push({
                ...place,
                half: (CREST_PX + this.random() * CREST_SPREAD_PX) / 2,
                age: 0,
                life: LIFE_MS + this.random() * LIFE_SPREAD_MS,
            });
        }
    }
}

/** How much a whitecap shows, from 0 to 1: it comes in and goes out over a fifth of a second. */
export function whitecapAlpha(cap: Whitecap): number {
    return Math.max(0, Math.min(1, cap.age / FADE_MS, (cap.life - cap.age) / FADE_MS));
}
