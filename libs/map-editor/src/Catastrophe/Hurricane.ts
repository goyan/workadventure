import type { FireConditions } from "../Weather/FireConditions";

/**
 * A hurricane crosses the map. A real one is hundreds of kilometres wide and the whole map (a few hundred metres) is a
 * point in it: what the map lives is its passage, not its spiral. The storm goes straight at a steady pace, its eye
 * passing over the map or beside it; the map feels, one after the other, the rain bands, the eyewall, the calm of the
 * eye under a clear sky, the second wall with the wind the other way round, then the storm going away.
 *
 * Everything here is a pure function of the hurricane (as the server keeps it) and of the time of the server: the
 * server, the thread that computes the ground and every browser read the same wind, rain and sky at the same instant,
 * from the same few figures, without any of them being sent more than once a second.
 *
 * The real passage takes a day and a half; the map lives it in `durationMs` (half an hour by default): its time is
 * compressed, its space is not. The rain the map receives is the total of a real passage (see skyRainUnder).
 */

/** The strongest winds of each category of the Saffir-Simpson scale, sustained over 1 minute, km/h (NHC). */
const SAFFIR_SIMPSON_KMH: readonly (readonly [number, number])[] = [
    [119, 153],
    [154, 177],
    [178, 208],
    [209, 251],
    [252, 290],
];
/**
 * A wind sustained over 1 minute, as a wind averaged over 10 minutes (the wind of the conditions of the room, the
 * 10 m wind of a weather report): 0.93 in a tropical cyclone at sea (WMO TD-1555, Harper, Kepert and Ginger 2010).
 */
export const HURRICANE_TEN_MINUTES_OF_ONE = 0.93;
/** The wind of a 3 s gust, for a wind averaged over 10 minutes, at sea (WMO TD-1555 [Gemini, to be checked]). */
export const HURRICANE_GUST_FACTOR = 1.23;
/** The strongest wind the conditions of a room may have (FIRE_CONDITION_BOUNDS): a weak category 5 holds under it. */
const HURRICANE_WIND_CEILING_KMH = 250;

/**
 * The strongest wind of a hurricane of that category, averaged over 10 minutes at 10 m (km/h): the middle of its
 * Saffir-Simpson range, a 1-minute wind, brought to 10 minutes. A category 5 is the weakest that holds under 250 km/h.
 */
export function hurricaneMaxWind(category: number): number {
    const [low, high] = SAFFIR_SIMPSON_KMH[hurricaneCategory(category) - 1];
    return Math.min(HURRICANE_WIND_CEILING_KMH, Math.round(((low + high) / 2) * HURRICANE_TEN_MINUTES_OF_ONE));
}

/** The Saffir-Simpson range of a category, km/h over 1 minute: [lowest, highest]. */
export function saffirSimpsonRange(category: number): readonly [number, number] {
    return SAFFIR_SIMPSON_KMH[hurricaneCategory(category) - 1];
}

/** The radius of the strongest winds, km: a compact, strong hurricane (a choice; most lie between 20 and 60 km). */
export const HURRICANE_RMAX_KM = 30;
/** The width of the wind maximum (Holland 1980): B, 1 to 2.5 in most hurricanes. */
export const HURRICANE_HOLLAND_B = 1.5;
/** How fast a hurricane goes over the sea, km/h: about 5.5 m/s, a usual pace in the tropics. */
export const HURRICANE_TRANSLATION_KMH = 20;
/** How far before and after the map the passage begins and ends, in radii of the strongest winds. */
export const HURRICANE_TRACK_RMAX = 12;
/** The real time of a whole passage, ms: twice the half track at the pace of the storm (36 h). */
export const HURRICANE_REAL_PASSAGE_MS =
    ((2 * HURRICANE_TRACK_RMAX * HURRICANE_RMAX_KM) / HURRICANE_TRANSLATION_KMH) * 3_600_000;
/**
 * The wind at the sea surface turns towards the centre by this angle (degrees): −22.6° ± 2.2° on average over more
 * than 1600 dropsondes (Zhang and Uhlhorn 2012, Monthly Weather Review 140).
 */
export const HURRICANE_INFLOW_DEGREES = 22.6;
/**
 * The share of the motion of the storm added to its winds: they are stronger on the side where they blow the way the
 * storm goes (the right in the northern hemisphere). About a half in parametric models (a choice).
 */
export const HURRICANE_MOTION_SHARE = 0.55;
/** The eye: clear sky and no rain within this share of the radius of the strongest winds; the eyewall begins here. */
export const HURRICANE_EYE_RMAX = 0.6;
/** The cloud of the eyewall is whole from this share of the radius of the strongest winds. */
export const HURRICANE_WALL_CLOUD_RMAX = 0.85;
/** Within this share of the radius of the strongest winds the map is in the eyewall; beyond, in the rain bands. */
export const HURRICANE_WALL_RMAX = 2;
/**
 * The azimuthal mean of the rain at the radius of the strongest winds, mm/h, by category: about 7 for categories 1-2
 * and 12 for 3-5 (Lonfat, Marks and Chen 2004, Monthly Weather Review 132, TRMM over 260 tropical cyclones).
 */
const HURRICANE_PEAK_RAIN = [7, 7, 12, 12, 12];
/** Beyond the radius of the strongest winds the mean rain falls off exponentially over this distance, km (choice). */
export const HURRICANE_RAIN_FALLOFF_KM = 125;
/** The rain bands: a logarithmic spiral of this pitch angle (degrees), two arms, ±80 % about the mean (a choice). */
export const HURRICANE_BAND_PITCH_DEGREES = 15;
export const HURRICANE_BAND_ARMS = 2;
export const HURRICANE_BAND_DEPTH = 0.8;
/** The share of the passage at each end over which the weather of the map turns into that of the storm and back. */
export const HURRICANE_FADE_SHARE = 0.03;
/** What is left of the cloud in the eye: a few low clouds under a clear sky. */
export const HURRICANE_EYE_CLOUD = 0.1;
/** The air under a hurricane is near saturation (%). */
export const HURRICANE_HUMIDITY = 95;

/** What a player chooses: the category, the length of the passage in the time of the map, where the eye goes. */
export const HURRICANE_MIN_MINUTES = 5;
export const HURRICANE_MAX_MINUTES = 60;
export const HURRICANE_DEFAULT_MINUTES = 30;
export const HURRICANE_DEFAULT_CATEGORY = 4;
/** How far from the map the eye passes, km: positive with the map on the right of the track, as the storm goes. */
export const HURRICANE_MAX_OFFSET_KM = 60;
/** Where the storm goes, in degrees (0 north, 90 east): west-north-west, a usual track in the tropics. */
export const HURRICANE_DEFAULT_HEADING = 290;
/** The hurricane of a room is told this often, so that a player who joins sees it at once. */
export const HURRICANE_TELL_MS = 1000;

/** How a hurricane crosses the map. */
export interface HurricaneTrack {
    category: number;
    durationMs: number;
    offsetKm: number;
    /** Where it goes, degrees (0 north, 90 east). */
    heading: number;
    /** It turns clockwise, as in the southern hemisphere. */
    southern: boolean;
}

/** A hurricane crossing a map: since `startedAt` (ms, the time of the server). */
export interface Hurricane extends HurricaneTrack {
    id: number;
    startedAt: number;
}

export type HurricanePhase = "bands" | "wall" | "eye";

/** The hurricane at the map at an instant. */
export interface HurricaneNow {
    /** 0 when it begins, 1 when it ends. */
    progress: number;
    /** How much the weather of the storm has taken over that of the map, 0 to 1: it fades in and out at the ends. */
    share: number;
    /** The eye has gone by (or is the nearest it will be): the second half of the passage. */
    after: boolean;
    phase: HurricanePhase;
    /** From the centre of the storm, km. */
    distanceKm: number;
    /** The wind of the storm at the map, averaged over 10 minutes, km/h, and its gusts. */
    windSpeed: number;
    gust: number;
    /** Where the wind of the storm comes from, degrees (0 north, 90 east). */
    windFrom: number;
    /** The rain of the storm as it falls at the map, mm/h. */
    rainRate: number;
    /** Its cloud over the map, 0 to 1. */
    cloudCover: number;
    /** How many times faster than reality the passage goes. */
    compression: number;
}

export function hurricaneCategory(category: number): number {
    if (!Number.isFinite(category) || category === 0) return HURRICANE_DEFAULT_CATEGORY;
    return Math.min(5, Math.max(1, Math.round(category)));
}

export function hurricaneMinutes(minutes: number): number {
    if (!Number.isFinite(minutes) || minutes === 0) return HURRICANE_DEFAULT_MINUTES;
    return Math.min(HURRICANE_MAX_MINUTES, Math.max(HURRICANE_MIN_MINUTES, Math.round(minutes)));
}

export function hurricaneOffsetKm(offsetKm: number): number {
    if (!Number.isFinite(offsetKm)) return 0;
    return Math.min(HURRICANE_MAX_OFFSET_KM, Math.max(-HURRICANE_MAX_OFFSET_KM, Math.round(offsetKm)));
}

export function hurricaneHeading(heading: number | undefined): number {
    if (heading === undefined || !Number.isFinite(heading)) return HURRICANE_DEFAULT_HEADING;
    return ((Math.round(heading) % 360) + 360) % 360;
}

/** A track as a player asks for it, kept within what a hurricane may be. */
export function hurricaneTrack(
    asked: { category?: number; minutes?: number; offsetKm?: number; heading?: number },
    southern: boolean,
): HurricaneTrack {
    return {
        category: hurricaneCategory(asked.category ?? 0),
        durationMs: hurricaneMinutes(asked.minutes ?? 0) * 60_000,
        offsetKm: hurricaneOffsetKm(asked.offsetKm ?? 0),
        heading: hurricaneHeading(asked.heading),
        southern,
    };
}

/**
 * The Coriolis parameter where hurricanes live, s⁻¹: at 20° of latitude (a choice; the map keeps its own place for
 * its sun). It slows the outer winds of the vortex, which the cyclostrophic profile alone makes too strong far out.
 */
export const HURRICANE_CORIOLIS = 2 * 7.292e-5 * Math.sin((20 * Math.PI) / 180);

/** The gradient wind of a Holland vortex whose cyclostrophic wind is `cyclostrophic` (m/s) at `distanceKm`. */
function gradientWind(cyclostrophic: number, distanceKm: number): number {
    const half = (distanceKm * 1000 * HURRICANE_CORIOLIS) / 2;
    return Math.sqrt(cyclostrophic * cyclostrophic + half * half) - half;
}

/** The cyclostrophic wind of Holland's profile at `distanceKm`, as a share of its strongest. */
function cyclostrophicShare(distanceKm: number): number {
    if (!(distanceKm > 0)) return 0;
    const x = (HURRICANE_RMAX_KM / distanceKm) ** HURRICANE_HOLLAND_B;
    return Math.sqrt(x * Math.exp(1 - x));
}

/**
 * The wind of a hurricane of strongest wind `maxKmh` at `distanceKm` from its centre, as a share of that wind: the
 * gradient wind of Holland's profile (Holland 1980, Monthly Weather Review 108, its equation with the Coriolis term),
 * 1 at the radius of the strongest winds, nothing in the very centre, about a seventh of it 360 km away.
 */
export function hollandShare(distanceKm: number, maxKmh = hurricaneMaxWind(HURRICANE_DEFAULT_CATEGORY)): number {
    if (!(distanceKm > 0)) return 0;
    const peak = maxKmh / 3.6;
    return gradientWind(peak * cyclostrophicShare(distanceKm), distanceKm) / gradientWind(peak, HURRICANE_RMAX_KM);
}

function smoothstep(from: number, to: number, value: number): number {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

/** The azimuthal mean of the rain at `distanceKm` from the centre, mm/h: none in the eye, the most at the wall. */
export function hurricaneMeanRain(category: number, distanceKm: number): number {
    const peak = HURRICANE_PEAK_RAIN[hurricaneCategory(category) - 1];
    const rmax = HURRICANE_RMAX_KM;
    if (distanceKm <= rmax) return peak * smoothstep(HURRICANE_EYE_RMAX * rmax, rmax, distanceKm);
    return peak * Math.exp(-(distanceKm - rmax) / HURRICANE_RAIN_FALLOFF_KM);
}

/** The share of its mean rain a point of the storm has, in or between the spiral bands (1 on average round a circle). */
export function bandShare(distanceKm: number, azimuth: number, southern: boolean): number {
    const rmax = HURRICANE_RMAX_KM;
    const weight = smoothstep(1.5 * rmax, 2.5 * rmax, distanceKm);
    if (weight <= 0) return 1;
    const turn = southern ? -azimuth : azimuth;
    const spiral = Math.log(distanceKm / rmax) / Math.tan((HURRICANE_BAND_PITCH_DEGREES * Math.PI) / 180);
    return 1 + HURRICANE_BAND_DEPTH * weight * Math.cos(HURRICANE_BAND_ARMS * (turn + spiral));
}

/** How many times faster than reality a passage of that length goes. */
export function hurricaneCompression(durationMs: number): number {
    return durationMs > 0 ? HURRICANE_REAL_PASSAGE_MS / durationMs : 1;
}

/** The hurricane at the map at `epoch` (ms, the time of the server); undefined before it begins and once it ended. */
export function hurricaneAt(hurricane: Hurricane | undefined, epoch: number): HurricaneNow | undefined {
    if (!hurricane || !Number.isFinite(epoch) || !(hurricane.durationMs > 0)) return undefined;
    const progress = (epoch - hurricane.startedAt) / hurricane.durationMs;
    if (!(progress >= 0 && progress < 1)) return undefined;
    // Hours from the nearest the eye comes, in real time.
    const hours = ((progress - 0.5) * HURRICANE_REAL_PASSAGE_MS) / 3_600_000;
    const heading = (hurricane.heading * Math.PI) / 180;
    // East and north: where the storm goes, and its right.
    const goE = Math.sin(heading);
    const goN = Math.cos(heading);
    const rightE = Math.cos(heading);
    const rightN = -Math.sin(heading);
    // From the centre of the storm to the map, km.
    const along = HURRICANE_TRANSLATION_KMH * hours;
    const mapE = hurricane.offsetKm * rightE - goE * along;
    const mapN = hurricane.offsetKm * rightN - goN * along;
    const distanceKm = Math.hypot(mapE, mapN);
    const strongest = hurricaneMaxWind(hurricane.category);
    const speed = strongest * hollandShare(distanceKm, strongest);
    // Round the centre (anticlockwise in the north), turned in towards it.
    const spin = hurricane.southern ? -1 : 1;
    const outE = distanceKm > 0 ? mapE / distanceKm : 0;
    const outN = distanceKm > 0 ? mapN / distanceKm : 0;
    const roundE = -outN * spin;
    const roundN = outE * spin;
    const inflow = (HURRICANE_INFLOW_DEGREES * Math.PI) / 180;
    const motion = HURRICANE_MOTION_SHARE * HURRICANE_TRANSLATION_KMH;
    const windE = speed * (Math.cos(inflow) * roundE - Math.sin(inflow) * outE) + motion * goE;
    const windN = speed * (Math.cos(inflow) * roundN - Math.sin(inflow) * outN) + motion * goN;
    const windSpeed = Math.hypot(windE, windN);
    const windFrom = ((((Math.atan2(windE, windN) * 180) / Math.PI + 180) % 360) + 360) % 360;
    const rmax = HURRICANE_RMAX_KM;
    const azimuth = Math.atan2(mapN, mapE);
    const rainRate =
        hurricaneMeanRain(hurricane.category, distanceKm) * bandShare(distanceKm, azimuth, hurricane.southern);
    const cloudCover =
        HURRICANE_EYE_CLOUD +
        (1 - HURRICANE_EYE_CLOUD) * smoothstep(HURRICANE_EYE_RMAX * rmax, HURRICANE_WALL_CLOUD_RMAX * rmax, distanceKm);
    const share = smoothstep(0, HURRICANE_FADE_SHARE, progress) * smoothstep(0, HURRICANE_FADE_SHARE, 1 - progress);
    const phase: HurricanePhase =
        distanceKm < HURRICANE_EYE_RMAX * rmax ? "eye" : distanceKm < HURRICANE_WALL_RMAX * rmax ? "wall" : "bands";
    return {
        progress,
        share,
        after: progress >= 0.5,
        phase,
        distanceKm,
        windSpeed,
        gust: windSpeed * HURRICANE_GUST_FACTOR,
        windFrom,
        rainRate,
        cloudCover,
        compression: hurricaneCompression(hurricane.durationMs),
    };
}

/** A wind as east and north components, km/h, from its speed and where it comes from. */
function windVector(speed: number, from: number): [number, number] {
    const to = ((from + 180) * Math.PI) / 180;
    return [speed * Math.sin(to), speed * Math.cos(to)];
}

/**
 * A wind (speed km/h, where it comes from) taken `share` of the way from `base` to that of the storm: the two winds
 * mixed as vectors, so that the wind of the map turns into that of the storm without jumping.
 */
export function blendedWind(
    base: { windSpeed: number; windFrom: number },
    storm: { windSpeed: number; windFrom: number },
    share: number,
): { windSpeed: number; windFrom: number } {
    if (share >= 1) return { windSpeed: storm.windSpeed, windFrom: storm.windFrom };
    if (share <= 0) return { windSpeed: base.windSpeed, windFrom: base.windFrom };
    const [baseE, baseN] = windVector(base.windSpeed, base.windFrom);
    const [stormE, stormN] = windVector(storm.windSpeed, storm.windFrom);
    const e = baseE + (stormE - baseE) * share;
    const n = baseN + (stormN - baseN) * share;
    const windSpeed = Math.hypot(e, n);
    if (windSpeed === 0) return { windSpeed: 0, windFrom: base.windFrom };
    return { windSpeed, windFrom: ((((Math.atan2(e, n) * 180) / Math.PI + 180) % 360) + 360) % 360 };
}

/**
 * The conditions of a room as its hurricane makes them at `epoch`: its wind and an air near saturation, the heat of
 * the room kept. The conditions of the room themselves outside the hurricane.
 */
export function hurricaneConditions(
    base: FireConditions,
    hurricane: Hurricane | undefined,
    epoch: number,
): FireConditions {
    const now = hurricaneAt(hurricane, epoch);
    if (!now || now.share <= 0) return base;
    const wind = blendedWind(base, now, now.share);
    return {
        temperature: base.temperature,
        humidity: base.humidity + (Math.max(base.humidity, HURRICANE_HUMIDITY) - base.humidity) * now.share,
        windSpeed: wind.windSpeed,
        windFrom: wind.windFrom,
    };
}

/**
 * The rain the ground of a map receives under its hurricane, mm an hour of the time of its water or its meadow: the
 * rain of the map (`mapRate`, mm/h) gives way to that of the storm, which takes its place (no rain in the eye, whatever
 * the map says). The ground receives the total of a real passage: the rain of the storm, compressed as its time is,
 * and divided by `groundSpeed`, how many times faster than reality that ground already lives (the speed of its water),
 * so that a faster ground does not count it twice.
 */
export function skyRainUnder(
    mapRate: number,
    hurricane: Hurricane | undefined,
    epoch: number,
    groundSpeed = 1,
): number {
    const now = hurricaneAt(hurricane, epoch);
    if (!now || now.share <= 0) return mapRate;
    const storm = (now.rainRate * now.compression) / (groundSpeed > 0 ? groundSpeed : 1);
    return mapRate + (storm - mapRate) * now.share;
}
