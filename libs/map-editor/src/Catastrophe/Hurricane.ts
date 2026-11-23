import { TILE_PX } from "../types";
import type { FireConditions } from "../Weather/FireConditions";
import { TILE_AREA_M2 } from "../Terrain/Scale";
import { waterHeightOfPressure } from "../Terrain/AirPressure";
import type { AirPressure } from "../Terrain/AirPressure";

/**
 * A hurricane crosses the map, REDUCED TO THE SIZE OF THE MAP: a creative choice, as the comet is. A real one is
 * hundreds of kilometres wide and the map (a few hundred metres) would only be a point in it; here its eye is a few
 * tens of metres wide, its spiral a little wider than the map, and the eye crosses the map in a few minutes. What is
 * kept is the coherence of the phenomenon at that scale: the strongest wind at the eyewall, calm and an open sky in
 * the eye, the wind turning round the centre the way of its hemisphere and turned in towards it, falling off outwards
 * (the profile of Holland), rain in spiral bands, none in the eye, the whole storm moving on.
 *
 * Everything here is a pure function of the hurricane (as the server keeps it), of the time of the server and of a
 * point of the map: the server, the thread that computes the ground and every browser read the same wind, rain and
 * sky at the same instant and the same place, from a few figures told once a second. The wind is no longer the same
 * all over the map: it depends on where a point is from the eye.
 */

/** Map pixels in a metre: a tile is about 1.1 m wide (Terrain/Scale). */
const PX_PER_METRE = TILE_PX / Math.sqrt(TILE_AREA_M2);

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

export function hurricaneCategory(category: number): number {
    if (!Number.isFinite(category) || category === 0) return HURRICANE_DEFAULT_CATEGORY;
    return Math.min(5, Math.max(1, Math.round(category)));
}

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

/**
 * The radius of the strongest winds, metres: reduced to the map (a real one: 20 to 60 km). The eye, a little smaller
 * (HURRICANE_EYE_RMAX), is then about 35 m across, the whole system (HURRICANE_REACH_RMAX) a little wider than the map.
 */
export const HURRICANE_RMAX_M = 30;
export const HURRICANE_RMAX_PX = HURRICANE_RMAX_M * PX_PER_METRE;
/** The width of the wind maximum (Holland 1980): B, 1 to 2.5 in most hurricanes. */
export const HURRICANE_HOLLAND_B = 1.5;
/** How far the storm reaches, in radii of the strongest winds: its clouds and its winds fade out there. */
export const HURRICANE_REACH_RMAX = 12;
/**
 * The wind at the sea surface turns towards the centre by this angle (degrees): −22.6° ± 2.2° on average over more
 * than 1600 dropsondes (Zhang and Uhlhorn 2012, Monthly Weather Review 140).
 */
export const HURRICANE_INFLOW_DEGREES = 22.6;
/** The share of the motion of the storm added to its winds: stronger where they blow the way it goes (a choice). */
export const HURRICANE_MOTION_SHARE = 0.55;
/** The eye: clear sky and no rain within this share of the radius of the strongest winds; the eyewall begins here. */
export const HURRICANE_EYE_RMAX = 0.6;
/** The cloud of the eyewall is whole from this share of the radius of the strongest winds. */
export const HURRICANE_WALL_CLOUD_RMAX = 0.85;
/** Within this share of the radius of the strongest winds a point is in the eyewall; beyond, in the rain bands. */
export const HURRICANE_WALL_RMAX = 2;
/**
 * The azimuthal mean of the rain at the radius of the strongest winds, mm/h, by category: about 7 for categories 1-2
 * and 12 for 3-5 (Lonfat, Marks and Chen 2004, Monthly Weather Review 132, TRMM over 260 tropical cyclones).
 */
const HURRICANE_PEAK_RAIN = [7, 7, 12, 12, 12];
/** Beyond the radius of the strongest winds the mean rain falls off exponentially over this many radii (a choice). */
export const HURRICANE_RAIN_FALLOFF_RMAX = 4;
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
/**
 * The spiral of the clouds turns once in this many seconds round the eye (a choice: at the speed of its winds, a
 * storm this small would spin in a few seconds, too fast to be read).
 */
export const HURRICANE_SPIN_SECONDS = 90;

/** What a player chooses: the category, how long the eye takes to cross the map, where it goes. */
export const HURRICANE_MIN_MINUTES = 1;
export const HURRICANE_MAX_MINUTES = 30;
export const HURRICANE_DEFAULT_MINUTES = 5;
export const HURRICANE_DEFAULT_CATEGORY = 4;
/** Where the storm goes, in degrees (0 north, 90 east): west-north-west, a usual track in the tropics. */
export const HURRICANE_DEFAULT_HEADING = 290;
/**
 * The widget of the speed of the map (the speed of its freeze and its thaw: ×1, ×60, ×600) speeds the hurricane up too,
 * by steps of its own (a choice of the user: « >>> » a crossing of 5 min in 30 s): ×1, ×5 at ×60, ×10 at ×600, ×2 at
 * ×10; never a crossing shorter than HURRICANE_SHORTEST_MS.
 */
const HURRICANE_TIMES: readonly (readonly [number, number])[] = [
    [1, 1],
    [10, 2],
    [60, 5],
    [600, 10],
];
export const HURRICANE_SHORTEST_MS = 30_000;

/** How many times faster the hurricane goes at that speed of the freeze and the thaw of the map. */
export function hurricaneTimesOf(freezeThawSpeed: number | undefined): number {
    const speed = freezeThawSpeed !== undefined && Number.isFinite(freezeThawSpeed) ? freezeThawSpeed : 1;
    if (speed <= HURRICANE_TIMES[0][0]) return HURRICANE_TIMES[0][1];
    for (let at = 1; at < HURRICANE_TIMES.length; at++) {
        const [speed1, times1] = HURRICANE_TIMES[at];
        if (speed <= speed1) {
            const [speed0, times0] = HURRICANE_TIMES[at - 1];
            const t = Math.log(speed / speed0) / Math.log(speed1 / speed0);
            return times0 * Math.pow(times1 / times0, t);
        }
    }
    return HURRICANE_TIMES[HURRICANE_TIMES.length - 1][1];
}

/**
 * The hurricane going `asked` times faster than the passage asked for (hurricaneTimesOf), from `now`: its crossing
 * shortened (never under HURRICANE_SHORTEST_MS, nor longer than asked), and its start moved so that its eye is where
 * it was: no jump when the speed changes during the passage. The same hurricane when nothing changes.
 */
export function hurricaneSpedUp(hurricane: Hurricane, asked: number, now: number): Hurricane {
    const was = hurricane.times ?? 1;
    const passage = hurricane.durationMs * was;
    const wanted = Number.isFinite(asked) && asked > 0 ? asked : 1;
    const durationMs = Math.max(Math.min(passage, HURRICANE_SHORTEST_MS), passage / wanted);
    if (Math.abs(durationMs - hurricane.durationMs) < 1) return hurricane;
    const progress = Math.min(1, Math.max(0, (now - hurricane.startedAt) / hurricane.durationMs));
    return { ...hurricane, durationMs, times: passage / durationMs, startedAt: now - progress * durationMs };
}

/** The hurricane of a room is told this often, so that a player who joins sees it at once. */
export const HURRICANE_TELL_MS = 1000;

/** How a hurricane crosses the map, as asked. */
export interface HurricaneTrack {
    category: number;
    durationMs: number;
    /** Where it goes, degrees (0 north, 90 east). */
    heading: number;
    /** It turns clockwise, as in the southern hemisphere. */
    southern: boolean;
    /**
     * How many times stronger than in reality its low and its wind act on the water (HURRICANE_WATER_EFFECTS): 1 is
     * the real effect, more an exaggeration a player asked for, to see it better. 1 when absent.
     */
    waterEffect?: number;
}

/**
 * The effects on the water a player may ask for: the real one, then exaggerated five to twenty times. Real, the dome
 * under the eye of a category 4 is some 0.7 m on a lake of the map, hard to see from above: exaggerated, it floods.
 */
export const HURRICANE_WATER_EFFECTS: readonly number[] = [1, 5, 10, 20];

/** The effect on the water asked, as one of HURRICANE_WATER_EFFECTS (the nearest under it; the real one otherwise). */
export function hurricaneWaterEffect(asked: number | undefined): number {
    if (asked === undefined || !Number.isFinite(asked) || asked < 1) return 1;
    let kept = 1;
    for (const effect of HURRICANE_WATER_EFFECTS) if (effect <= asked) kept = effect;
    return kept;
}

/**
 * A hurricane crossing a map: since `startedAt` (ms, the time of the server), its eye going straight from
 * (fromX, fromY) to (toX, toY), map pixels, over the point (anchorX, anchorY) it was sent across.
 */
export interface Hurricane extends HurricaneTrack {
    id: number;
    startedAt: number;
    /**
     * How many times faster than asked it goes (the speed of the map, hurricaneTimesOf): its `durationMs` is the
     * passage asked divided by it. 1 when absent.
     */
    times?: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    anchorX: number;
    anchorY: number;
}

export type HurricanePhase = "bands" | "wall" | "eye";

/** The storm as a whole at an instant. */
export interface HurricaneNow {
    /** 0 when it begins, 1 when it ends. */
    progress: number;
    /** How much the weather of the storm has taken over that of the map, 0 to 1: it fades in and out at the ends. */
    share: number;
    /** Where its eye is, map pixels. */
    eyeX: number;
    eyeY: number;
    /** How fast it goes, km/h. */
    speedKmh: number;
}

/** The storm at a point of the map. */
export interface HurricaneHere extends HurricaneNow {
    /** The eye has gone past the point (or is the nearest it will be). */
    after: boolean;
    phase: HurricanePhase;
    /** From the centre of the storm, metres. */
    distanceM: number;
    /** The wind of the storm here, averaged over 10 minutes, km/h, and its gusts. */
    windSpeed: number;
    gust: number;
    /** Where the wind of the storm here comes from, degrees (0 north, 90 east). */
    windFrom: number;
    /** The rain of the storm here, mm/h. */
    rainRate: number;
    /** Its cloud here, 0 to 1. */
    cloudCover: number;
}

export function hurricaneMinutes(minutes: number): number {
    if (!Number.isFinite(minutes) || minutes === 0) return HURRICANE_DEFAULT_MINUTES;
    return Math.min(HURRICANE_MAX_MINUTES, Math.max(HURRICANE_MIN_MINUTES, Math.round(minutes)));
}

export function hurricaneHeading(heading: number | undefined): number {
    if (heading === undefined || !Number.isFinite(heading)) return HURRICANE_DEFAULT_HEADING;
    return ((Math.round(heading) % 360) + 360) % 360;
}

/** A track as a player asks for it, kept within what a hurricane may be. */
export function hurricaneTrack(
    asked: { category?: number; minutes?: number; heading?: number; waterEffect?: number },
    southern: boolean,
): HurricaneTrack {
    return {
        category: hurricaneCategory(asked.category ?? 0),
        durationMs: hurricaneMinutes(asked.minutes ?? 0) * 60_000,
        heading: hurricaneHeading(asked.heading),
        southern,
        waterEffect: hurricaneWaterEffect(asked.waterEffect),
    };
}

/**
 * Where the eye crosses a map of `width` x `height` pixels going `heading` over the point (x, y) (the centre of the
 * map when it is outside it): from where it comes in at the edge to where it goes out. The spiral is over the map from
 * the first instant, its eye coming in.
 */
export function hurricaneCrossing(
    width: number,
    height: number,
    x: number,
    y: number,
    heading: number,
): { fromX: number; fromY: number; toX: number; toY: number; anchorX: number; anchorY: number } {
    const inside = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= width && y <= height;
    const anchorX = inside ? x : width / 2;
    const anchorY = inside ? y : height / 2;
    const angle = (hurricaneHeading(heading) * Math.PI) / 180;
    // Map pixels: east is x, south is y.
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    // How far the line goes each way before it leaves the map.
    const reach = (sign: number): number => {
        let best = Number.POSITIVE_INFINITY;
        const ex = sign * dx;
        const ey = sign * dy;
        if (ex > 1e-9) best = Math.min(best, (width - anchorX) / ex);
        if (ex < -1e-9) best = Math.min(best, -anchorX / ex);
        if (ey > 1e-9) best = Math.min(best, (height - anchorY) / ey);
        if (ey < -1e-9) best = Math.min(best, -anchorY / ey);
        return Number.isFinite(best) ? best : 0;
    };
    const ahead = reach(1);
    const behind = reach(-1);
    return {
        fromX: anchorX - dx * behind,
        fromY: anchorY - dy * behind,
        toX: anchorX + dx * ahead,
        toY: anchorY + dy * ahead,
        anchorX,
        anchorY,
    };
}

/**
 * The wind of a vortex at `distanceM` from its centre, as a share of its strongest (Holland 1980, Monthly Weather
 * Review 108; cyclostrophic: at this size the Coriolis force is nothing): 1 at the radius of the strongest winds,
 * nothing in the very centre, a quarter of it at the reach of the storm.
 */
export function hollandShare(distanceM: number): number {
    if (!(distanceM > 0)) return 0;
    const x = (HURRICANE_RMAX_M / distanceM) ** HURRICANE_HOLLAND_B;
    return Math.sqrt(x * Math.exp(1 - x));
}

function smoothstep(from: number, to: number, value: number): number {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

/** The azimuthal mean of the rain at `distanceM` from the centre, mm/h: none in the eye, the most at the wall. */
export function hurricaneMeanRain(category: number, distanceM: number): number {
    const peak = HURRICANE_PEAK_RAIN[hurricaneCategory(category) - 1];
    const rmax = HURRICANE_RMAX_M;
    if (distanceM <= rmax) return peak * smoothstep(HURRICANE_EYE_RMAX * rmax, rmax, distanceM);
    return peak * Math.exp(-(distanceM - rmax) / (HURRICANE_RAIN_FALLOFF_RMAX * rmax));
}

/** The share of its mean rain a point of the storm has, in or between the spiral bands (1 on average round a circle). */
export function bandShare(distanceM: number, azimuth: number, southern: boolean): number {
    const rmax = HURRICANE_RMAX_M;
    const weight = smoothstep(1.5 * rmax, 2.5 * rmax, distanceM);
    if (weight <= 0) return 1;
    const turn = southern ? -azimuth : azimuth;
    const spiral = Math.log(distanceM / rmax) / Math.tan((HURRICANE_BAND_PITCH_DEGREES * Math.PI) / 180);
    return 1 + HURRICANE_BAND_DEPTH * weight * Math.cos(HURRICANE_BAND_ARMS * (turn + spiral));
}

/** The storm as a whole at `epoch` (ms, the time of the server); undefined before it begins and once it ended. */
export function hurricaneAt(hurricane: Hurricane | undefined, epoch: number): HurricaneNow | undefined {
    if (!hurricane || !Number.isFinite(epoch) || !(hurricane.durationMs > 0)) return undefined;
    const progress = (epoch - hurricane.startedAt) / hurricane.durationMs;
    if (!(progress >= 0 && progress < 1)) return undefined;
    const lengthM = Math.hypot(hurricane.toX - hurricane.fromX, hurricane.toY - hurricane.fromY) / PX_PER_METRE;
    return {
        progress,
        share: smoothstep(0, HURRICANE_FADE_SHARE, progress) * smoothstep(0, HURRICANE_FADE_SHARE, 1 - progress),
        eyeX: hurricane.fromX + (hurricane.toX - hurricane.fromX) * progress,
        eyeY: hurricane.fromY + (hurricane.toY - hurricane.fromY) * progress,
        speedKmh: (lengthM / (hurricane.durationMs / 1000)) * 3.6,
    };
}

/**
 * The wind of the storm at the point (x, y) of the map (pixels), towards the east and the north, km/h, averaged over
 * 10 minutes: round the centre (anticlockwise in the north), turned in towards it, falling off by the profile of
 * Holland, the motion of the storm added. What hurricaneHere tells, and what pushes the water (hurricanePressure).
 */
export function hurricaneWind(
    hurricane: Hurricane,
    storm: HurricaneNow,
    x: number,
    y: number,
): { east: number; north: number } {
    const mapE = (x - storm.eyeX) / PX_PER_METRE;
    const mapN = -(y - storm.eyeY) / PX_PER_METRE;
    const distanceM = Math.hypot(mapE, mapN);
    const share = hollandShare(distanceM);
    const speed = hurricaneMaxWind(hurricane.category) * share;
    const spin = hurricane.southern ? -1 : 1;
    const outE = distanceM > 0 ? mapE / distanceM : 0;
    const outN = distanceM > 0 ? mapN / distanceM : 0;
    const roundE = -outN * spin;
    const roundN = outE * spin;
    const inflow = (HURRICANE_INFLOW_DEGREES * Math.PI) / 180;
    const heading = (hurricane.heading * Math.PI) / 180;
    // The motion of the storm where its wind blows: none in the calm of the eye.
    const motion = HURRICANE_MOTION_SHARE * storm.speedKmh * share;
    return {
        east: speed * (Math.cos(inflow) * roundE - Math.sin(inflow) * outE) + motion * Math.sin(heading),
        north: speed * (Math.cos(inflow) * roundN - Math.sin(inflow) * outN) + motion * Math.cos(heading),
    };
}

/** The storm at the point (x, y) of the map (pixels) at `epoch`; undefined outside its passage. */
export function hurricaneHere(
    hurricane: Hurricane | undefined,
    epoch: number,
    x: number,
    y: number,
): HurricaneHere | undefined {
    const storm = hurricaneAt(hurricane, epoch);
    if (!hurricane || !storm || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    // East and north, metres, from the eye to the point.
    const mapE = (x - storm.eyeX) / PX_PER_METRE;
    const mapN = -(y - storm.eyeY) / PX_PER_METRE;
    const distanceM = Math.hypot(mapE, mapN);
    const { east: windE, north: windN } = hurricaneWind(hurricane, storm, x, y);
    const windSpeed = Math.hypot(windE, windN);
    const windFrom = ((((Math.atan2(windE, windN) * 180) / Math.PI + 180) % 360) + 360) % 360;
    const rmax = HURRICANE_RMAX_M;
    const azimuth = Math.atan2(mapN, mapE);
    const rainRate =
        hurricaneMeanRain(hurricane.category, distanceM) * bandShare(distanceM, azimuth, hurricane.southern);
    const cloudCover =
        HURRICANE_EYE_CLOUD +
        (1 - HURRICANE_EYE_CLOUD) * smoothstep(HURRICANE_EYE_RMAX * rmax, HURRICANE_WALL_CLOUD_RMAX * rmax, distanceM);
    const phase: HurricanePhase =
        distanceM < HURRICANE_EYE_RMAX * rmax ? "eye" : distanceM < HURRICANE_WALL_RMAX * rmax ? "wall" : "bands";
    // Past the point: the eye has gone beyond it along its track.
    const along =
        (x - storm.eyeX) * (hurricane.toX - hurricane.fromX) + (y - storm.eyeY) * (hurricane.toY - hurricane.fromY);
    return {
        ...storm,
        after: along <= 0,
        phase,
        distanceM,
        windSpeed,
        gust: windSpeed * HURRICANE_GUST_FACTOR,
        windFrom,
        rainRate,
        cloudCover,
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
 * The conditions of a room at the point (x, y) as its hurricane makes them at `epoch`: its wind there and an air near
 * saturation, the heat of the room kept. The conditions of the room themselves outside the hurricane.
 */
export function hurricaneConditions(
    base: FireConditions,
    hurricane: Hurricane | undefined,
    epoch: number,
    x = hurricane?.anchorX ?? 0,
    y = hurricane?.anchorY ?? 0,
): FireConditions {
    const here = hurricaneHere(hurricane, epoch, x, y);
    if (!here || here.share <= 0) return base;
    const wind = blendedWind(base, here, here.share);
    return {
        temperature: base.temperature,
        humidity: base.humidity + (Math.max(base.humidity, HURRICANE_HUMIDITY) - base.humidity) * here.share,
        windSpeed: wind.windSpeed,
        windFrom: wind.windFrom,
    };
}

/** How much of the air of a room the hurricane makes near saturation at `epoch` (its share), the room's air kept. */
export function hurricaneHumidity(humidity: number, hurricane: Hurricane | undefined, epoch: number): number {
    const storm = hurricaneAt(hurricane, epoch);
    if (!storm || storm.share <= 0) return humidity;
    return humidity + (Math.max(humidity, HURRICANE_HUMIDITY) - humidity) * storm.share;
}

/**
 * The rain the ground receives at the point (x, y) under its hurricane, mm an hour of the time of its water or its
 * meadow: the rain of the map (`mapRate`, mm/h) gives way to that of the storm, which takes its place (none in the
 * eye, whatever the map says). Real rates over the real time of the passage, divided by `groundSpeed`, how many times
 * faster than reality that ground lives (the speed of its water), so that a faster ground does not count it twice.
 */
export function skyRainUnder(
    mapRate: number,
    hurricane: Hurricane | undefined,
    epoch: number,
    groundSpeed = 1,
    x = hurricane?.anchorX ?? 0,
    y = hurricane?.anchorY ?? 0,
): number {
    const here = hurricaneHere(hurricane, epoch, x, y);
    if (!here || here.share <= 0) return mapRate;
    // Sped up, its passage is shorter: its rain falls that many times harder, the same total.
    const storm = (here.rainRate * (hurricane?.times ?? 1)) / (groundSpeed > 0 ? groundSpeed : 1);
    return mapRate + (storm - mapRate) * here.share;
}

/** The density of the air at the surface of a tropical sea, kg/m³ (Holland 1980 takes 1.15). */
const HURRICANE_AIR_DENSITY = 1.15;

/**
 * How much lower the pressure is in the eye than far from it, Pa: from its strongest wind by the relation of Holland
 * (1980), V² = B Δp / (ρ e), the same profile as its wind (hollandShare). 26 hPa for a category 1, 74 for a 4, 100 for
 * a 5: within the central pressures of the Saffir-Simpson scale (980 hPa and over, 920 to 944, under 920) under
 * 1010 hPa far from it.
 */
export function hurricanePressureDrop(category: number): number {
    const wind = hurricaneMaxWind(category) / 3.6;
    return (HURRICANE_AIR_DENSITY * Math.E * wind * wind) / HURRICANE_HOLLAND_B;
}

/**
 * The low of the hurricane over the water at `epoch` (WaterGrid.setPressure): under its eye the water stands higher
 * by the height of water its drop of pressure holds (the inverted barometer, about 1 cm a hPa), and its wind pushes
 * the water, both fading in and out with the storm. Undefined outside its passage.
 */
export function hurricanePressure(hurricane: Hurricane | undefined, epoch: number): AirPressure | undefined {
    const storm = hurricaneAt(hurricane, epoch);
    if (!hurricane || !storm || !(storm.share > 0)) return undefined;
    const share = storm.share;
    // The real effect, or that many times stronger when a player asked for it to be seen better.
    const effect = hurricaneWaterEffect(hurricane.waterEffect);
    return {
        x: storm.eyeX,
        y: storm.eyeY,
        dropPx: waterHeightOfPressure(hurricanePressureDrop(hurricane.category) * share) * PX_PER_METRE * effect,
        radiusPx: HURRICANE_RMAX_PX,
        b: HURRICANE_HOLLAND_B,
        windGain: effect,
        // Its wind pushes the water, fading in and out with the storm (m/s, east and south).
        wind: (x, y) => {
            const wind = hurricaneWind(hurricane, storm, x, y);
            return { east: (wind.east / 3.6) * share, south: (-wind.north / 3.6) * share };
        },
    };
}
