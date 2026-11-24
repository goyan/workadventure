import { MAX_WATER_MAX_SURFACE } from "../types";
import { heightOfMetres } from "../Terrain/Scale";

/**
 * A tsunami comes in from the sea by the east edge of the map: for the time a player chose, the sea there stands as
 * high as they chose, then goes back down. The east edge of the water of the map is the coast; the sea beyond it
 * holds its level there (WaterGrid.setSea), and everything else is the water of the map moving as it always does:
 * the flood that runs up the land as the wave of a broken dam (Chanson 2006, Coastal Engineering Journal 48(4)),
 * the bore that crosses a lake at √(g·h), the run-up on the slopes, the water left in the hollows, the backwash to
 * the sea once its level drops.
 *
 * What the coast sees is the tsunami as it arrives, not as it was born: a long wave (NOAA: five minutes to two hours
 * between two crests) which, over the shallows before the coast, steepened until its front broke into a bore
 * (Madsen, Fuhrman and Schäffer 2008, "On the solitary wave paradigm for tsunamis", JGR 113, C12012; the bores of
 * the Strait of Malacca in 2004: Grue et al. 2008). Far past its breaking, the crest of a long wave becomes a saw
 * tooth (Whitham 1974, "Linear and Nonlinear Waves", §2.8): the sea at the coast jumps up as the bore passes, then
 * goes down evenly. That is the level held at the coast: the front passing in TSUNAMI_FRONT_SECONDS, then a fall
 * back to the rest level over the time chosen. The map is a couple of hundred metres wide, far less than the length
 * of a tsunami (kilometres): it sees its front and its flood, at the scale of reality, heights, speeds and times
 * alike; no similitude.
 */

/** The height of the tsunami at the coast, above the rest level of the sea, in metres: what a player chooses. */
export const TSUNAMI_MIN_METRES = 1;
/**
 * Ten metres at the coast: the Tōhoku tsunami of 2011 on the plain of Sendai. Deeper, over the deepest lake a map
 * may dig (8.8 m), the waves would need more moves a step than the water makes (WaterGrid, MOST_INERTIA_MOVES).
 */
export const TSUNAMI_MAX_METRES = 10;
export const TSUNAMI_DEFAULT_METRES = 8;
/**
 * How long the sea stays high at the coast, in minutes: the crest of the wave, from the bore to the rest level.
 * Half the time between two crests, for a tsunami of an earthquake (5 min to 2 h, NOAA) as for the shorter one of a
 * landslide or a volcano (a minute or two).
 */
export const TSUNAMI_MIN_MINUTES = 1;
export const TSUNAMI_MAX_MINUTES = 30;
export const TSUNAMI_DEFAULT_MINUTES = 3;
/**
 * How long the front of the wave, a bore, takes to pass the coast, in seconds: about half the period of the waves of
 * an undular bore (15 to 20 s in the Strait of Malacca, Grue et al. 2008). A quarter of the duration at most.
 */
export const TSUNAMI_FRONT_SECONDS = 10;
/**
 * Once the crest has gone by, the sea stays at its rest level at the coast for this long (ms): the water the
 * tsunami left on the land runs back to it there (the backwash), instead of creeping off the edge of the map.
 */
export const TSUNAMI_BACKWASH_MS = 60_000;
/**
 * Under this share of the real speed of its waves (the server affording fewer moves a step than the depth of its bore
 * asks for), the panel says that the server limits the tsunami.
 */
export const TSUNAMI_FULL_CELERITY = 0.95;
/** The room is told the tsunami once a second while it goes on, as it is told a hurricane. */
export const TSUNAMI_TELL_MS = 1000;
/**
 * While the sea stands high, its water may stand this many times the height of the tsunami over the level it spills
 * at, and no less than the usual ceiling: a bore that meets a wall rises about twice as high (the reflection of a
 * long wave), and the water is not cut there.
 */
export const TSUNAMI_TOP_TIMES = 2.5;

/** A tsunami on its way to the coast of a map, as the server keeps it and tells it. */
export interface Tsunami {
    id: number;
    /** When its front reaches the coast (ms, the time of the server). */
    startedAt: number;
    /** Its height at the coast, metres, and how long the sea stays high there (ms). */
    metres: number;
    durationMs: number;
}

/** The height of a tsunami as asked: one out of range is the nearest, one that is not a number the usual one. */
export function tsunamiMetres(metres: number | undefined): number {
    if (metres === undefined || !Number.isFinite(metres) || metres <= 0) return TSUNAMI_DEFAULT_METRES;
    return Math.min(TSUNAMI_MAX_METRES, Math.max(TSUNAMI_MIN_METRES, Math.round(metres * 2) / 2));
}

/** How long a tsunami keeps the sea high, as asked, in minutes: within the bounds, the usual one when not a number. */
export function tsunamiMinutes(minutes: number | undefined): number {
    if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return TSUNAMI_DEFAULT_MINUTES;
    return Math.min(TSUNAMI_MAX_MINUTES, Math.max(TSUNAMI_MIN_MINUTES, Math.round(minutes)));
}

/** How long the front of a tsunami takes to pass the coast, in ms. */
export function tsunamiFrontMs(tsunami: Pick<Tsunami, "durationMs">): number {
    return Math.min(TSUNAMI_FRONT_SECONDS * 1000, tsunami.durationMs / 4);
}

/**
 * How high the sea stands at the coast over its rest level, in metres, at a time of the server: nothing before the
 * front comes and once the crest has gone by; the bore (a half cosine over its front), then the saw tooth down to
 * nothing.
 */
export function tsunamiRiseAt(tsunami: Tsunami | undefined, now: number): number {
    if (!tsunami) return 0;
    const since = now - tsunami.startedAt;
    const lasts = tsunami.durationMs;
    if (!(since > 0) || !(since < lasts)) return 0;
    const front = tsunamiFrontMs(tsunami);
    const rising = since < front ? 0.5 - 0.5 * Math.cos((Math.PI * since) / front) : 1;
    const falling = since <= front ? 1 : (lasts - since) / (lasts - front);
    return tsunami.metres * rising * falling;
}

/** The same, in pixels of altitude of the map. */
export function tsunamiRisePx(tsunami: Tsunami | undefined, now: number): number {
    return heightOfMetres(tsunamiRiseAt(tsunami, now));
}

/** How long a tsunami goes on, its backwash included (ms): the room keeps it for this long. */
export function tsunamiLastsMs(tsunami: Pick<Tsunami, "durationMs">): number {
    return tsunami.durationMs + TSUNAMI_BACKWASH_MS;
}

/**
 * Where a tsunami is at a time of the server: its bore passing the coast, the sea going back down, the water of the
 * land running back to the sea at rest, or over.
 */
export function tsunamiPhase(tsunami: Tsunami | undefined, now: number): "front" | "ebb" | "backwash" | "over" {
    if (!tsunami) return "over";
    const since = now - tsunami.startedAt;
    if (since >= tsunamiLastsMs(tsunami)) return "over";
    if (since >= tsunami.durationMs) return "backwash";
    return since < tsunamiFrontMs(tsunami) ? "front" : "ebb";
}

/**
 * The highest the water may stand over the level it spills at while a tsunami that high goes on, in pixels: see
 * TSUNAMI_TOP_TIMES. Never under `usual`.
 */
export function tsunamiTopPx(tsunami: Pick<Tsunami, "metres"> | undefined, usual: number): number {
    if (!tsunami) return usual;
    return Math.max(usual, Math.ceil(heightOfMetres(tsunami.metres) * TSUNAMI_TOP_TIMES));
}

/**
 * The sea a tsunami holds at the coast of a map at a time of the server (WaterGrid.setSea): its level over the
 * altitude 0 of the map, the rest level of the sea, and the ceiling of the water while it goes on. None before it
 * comes and once its backwash is over.
 */
export function tsunamiSea(tsunami: Tsunami | undefined, now: number): { levelPx: number; topPx: number } | undefined {
    if (!tsunami || now < tsunami.startedAt || tsunamiPhase(tsunami, now) === "over") return undefined;
    return { levelPx: tsunamiRisePx(tsunami, now), topPx: tsunamiTopPx(tsunami, MAX_WATER_MAX_SURFACE) };
}
