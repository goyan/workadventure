import {
    frostPoint,
    RAIN_FROM_WET_BULB,
    SNOW_FULL_MM,
    SNOW_UNDER_WET_BULB,
    snowMeltMmPerHour,
    snowShare,
    snowShareOf,
    SOIL_FROZEN_UNDER,
    SOIL_THAWED_FROM,
    soilFrostOf,
    surfaceTemperature,
    THAW_SPEED,
    wetBulbTemperature,
} from "@workadventure/map-editor";
import type { PrecipitationAir } from "@workadventure/map-editor";
import { DEEP_ICE_PX, frostOf, iceAt, iceOf, isFrozen, POOL_ICE_DEPTH_PX } from "./Frost";
import type { AirNow } from "./Frost";

/**
 * Why this player sees the weather they see, said in values a board can show (the "Weather explained" board of the
 * visualisation panel): for each thing the cold and the rain do, what it is now, the reason, which air decides and
 * who sees the same.
 *
 * Nothing of the weather is computed here by a rule of its own: each value is what the rule of the game gives for
 * the air the game itself reads (snowShareOf, frostOf, iceOf, soilFrostOf, snowMeltMmPerHour), and what would change
 * it is found by asking that same rule again (thresholdBetween). Pure: the airs and the state are given.
 */

/** Which air decides: the air of the map, the same for everyone, or the air of the city this player follows. */
export type AirOwner = "map" | "own";
/**
 * Who sees the same thing: everyone in the room; every player who follows the weather of the server; this player
 * alone.
 */
export type Audience = "everyone" | "serverFollowers" | "you";

/** An air as the board shows it; a value not known is absent. */
export interface ShownAir {
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    /** Set by hand in the room (Catastrophe, Weather) rather than the real air of a place. */
    byHand: boolean;
    /** The place of a real air; absent: the default one (Paris). */
    place?: string;
}

/** What the game knows now, each read by the reader the game itself draws from. */
export interface WeatherBoardInput {
    /** The city this player follows on their clock; undefined while they follow the server. */
    city: string | undefined;
    /** Whether the weather drawn for them is that of their city (showsChosenPlaceWeather). */
    drawsOwnWeather: boolean;
    /** The air of the map, as shown at the top of the board. */
    mapAir: ShownAir;
    /** The air of the city followed, as shown at the top of the board; undefined while they follow the server. */
    ownAir: ShownAir | undefined;
    /** The air the precipitation drawn falls through (precipitationAirNow). */
    precipitationAir: PrecipitationAir | undefined;
    /** The air of the room, the one the server goes by (roomPrecipitationAir). */
    roomAir: PrecipitationAir | undefined;
    /** The air the frost and the ice go by (frostAirNow). */
    frostAir: AirNow | undefined;
    /** The air the frost and the ice go by for who follows the server (mapFrostAirNow). */
    mapFrostAir: AirNow | undefined;
    /** Whether a precipitation is drawn for this player now. */
    falling: boolean;
    /** Whether the weather of the map is a precipitation now. */
    mapFalling: boolean;
    /** The frost and the ice drawn now (waterCycleNow): they move towards the air over a minute or two. */
    drawn: { frost: number; ice: number } | undefined;
    /** The snow the server told, 0 to 1: over the whole map, and under the avatar. Undefined until it told. */
    snow: { map: number; here: number } | undefined;
    /** The wind of the conditions of the room (km/h): the one the server melts the snow by. */
    roomWind: number | undefined;
}

export type PrecipitationForm = "rain" | "mix" | "snow";
/**
 * Why a precipitation has its form: the air is not known (rain); the wet bulb is over the threshold of the rain;
 * the air is too mild whatever its wet bulb; the wet bulb is under the threshold of the snow; it lies between both;
 * the wet bulb would give snow but the air is nearly too mild.
 */
export type PrecipitationReason = "unknown" | "wetBulbWarm" | "airMild" | "wetBulbCold" | "mix" | "mildMix";

export interface FormExplained {
    air: AirOwner;
    audience: Audience;
    /** The share that falls as snow, 0 to 1: what the game draws. */
    share: number;
    form: PrecipitationForm;
    reason: PrecipitationReason;
    temperature?: number;
    humidity?: number;
    /** The wet-bulb temperature of that air, °C. */
    wetBulb?: number;
    /** The wet-bulb temperatures between which rain and snow fall together. */
    snowUnderWetBulb: number;
    rainFromWetBulb: number;
    /** A rain: the air temperature (°C) under which, at this humidity, the first flakes would fall. */
    snowUnder?: number;
    /** A rain: the humidity (%) under which, at this temperature, the first flakes would fall. */
    snowUnderHumidity?: number;
    /** A mix: the air temperature (°C) under which, at this humidity, all of it would be snow. */
    allSnowUnder?: number;
    /** A snow or a mix: the air temperature (°C) from which, at this humidity, all of it would be rain. */
    rainFrom?: number;
}

export interface PrecipitationExplained extends FormExplained {
    /** Whether something falls now; else the form is the one a precipitation would have. */
    falling: boolean;
}

/**
 * What this player sees, set against what the map (the server) has when they follow a city of their own: the same
 * thing by the air of the map, as every player who follows the server sees it, and whether the two differ now.
 */
export interface AgainstMap<T> {
    /** By the air of the map; absent when the air of the map already decides for this player. */
    onMap?: T;
    /** Whether this player's screen and the map do not show the same thing now. */
    differs: boolean;
}

export type FrostLevel = "none" | "light" | "white";
/**
 * Why there is frost or not: no air known; no humidity known; the ground is at 0 °C or over; the wind alone keeps
 * the ground too warm (a calm would whiten it); the air is too dry; there is frost.
 */
export type FrostReason = "unknown" | "noHumidity" | "groundWarm" | "wind" | "dry" | "frost";

export interface FrostExplained {
    air: AirOwner;
    audience: Audience;
    /** The frost the ground goes towards, 0 to 1. */
    frost: number;
    level: FrostLevel;
    reason: FrostReason;
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    /** The temperature of the ground under that air and that wind, °C. */
    ground?: number;
    /** The frost point of that air, °C: the ground has to be colder for its vapour to settle as ice. */
    frostPoint?: number;
    /** No frost: the humidity (%) over which there would be, the rest unchanged. */
    needsHumidity?: number;
    /** No frost: the wind (km/h) under which there would be, the rest unchanged. */
    needsWindUnder?: number;
    /** A ground too warm: the air temperature (°C) under which the ground would be under zero. */
    needsAirUnder?: number;
    /** The frost drawn now, 0 to 1. */
    drawn?: number;
}

export type IceStage = "none" | "shallows" | "pools" | "all";
/** No temperature known; at zero or over; just under zero, the ice has not set; freezing. */
export type IceReason = "unknown" | "warm" | "barely" | "freezing";

export interface IceExplained {
    air: AirOwner;
    audience: Audience;
    /** How far the ice goes towards, 0 to 1. */
    ice: number;
    stage: IceStage;
    reason: IceReason;
    temperature?: number;
    /** The air temperatures (°C) under which the shallows, the pools and the deepest water are frozen. */
    thresholds: { shallows: number; pools: number; all: number };
    /** The ice drawn now, 0 to 1. */
    drawn?: number;
}

export type SoilReason = "unknown" | "thawed" | "partly" | "frozen";

export interface SoilExplained {
    air: AirOwner;
    audience: Audience;
    /** How frozen the soil is, 0 to 1, by the rule of the server on the air of the room. */
    frost: number;
    reason: SoilReason;
    temperature?: number;
    frozenUnder: number;
    thawedFrom: number;
}

/** Nothing to say; a snow falls on the map; it melts; it holds; the air of the map is not known. */
export type SnowTrend = "none" | "building" | "melting" | "holding" | "unknown";

export interface SnowExplained {
    air: AirOwner;
    audience: Audience;
    /** Whether the server told the ground of the map yet. */
    known: boolean;
    /** How much of the map the snow whitens, 0 to 1, as the server told. */
    mapCover: number;
    /** How white the ground is under the avatar, 0 to 1, as the server told. */
    hereCover: number;
    /** Whether this player sees it: only who follows the weather of the server does. */
    shown: boolean;
    trend: SnowTrend;
    /** The share of the precipitation of the map that falls as snow. */
    snowShare: number;
    temperature?: number;
    /** Melting: the seconds a ground all white lasts under the air of the room. */
    whiteGroundMeltsIn?: number;
}

export interface WeatherBoard {
    /** What this player follows: the server; a city of their own; a city, but a weather tried in the map settings shows. */
    follows: "server" | "city" | "trial";
    city: string | undefined;
    mapAir: ShownAir;
    ownAir: ShownAir | undefined;
    precipitation: PrecipitationExplained & AgainstMap<PrecipitationExplained>;
    downpour: FormExplained;
    frost: FrostExplained & AgainstMap<FrostExplained>;
    ice: IceExplained & AgainstMap<IceExplained>;
    soil: SoilExplained;
    snow: SnowExplained;
}

/**
 * The value between `from`, where `holds` is false, and `to`, where it is true, at which it begins to hold: found by
 * asking the rule itself, never by a formula beside it. Undefined when it does not hold at `to` (nothing to say) or
 * already holds at `from`.
 */
export function thresholdBetween(from: number, to: number, holds: (value: number) => boolean): number | undefined {
    if (holds(from) || !holds(to)) return undefined;
    let off = from;
    let on = to;
    for (let step = 0; step < 48; step++) {
        const middle = (off + on) / 2;
        if (holds(middle)) on = middle;
        else off = middle;
    }
    return on;
}

/** As cold, as warm, as an air is looked for. */
const COLDEST_C = -60;
const WARMEST_C = 30;

function explainForm(air: PrecipitationAir | undefined, owner: AirOwner, audience: Audience): FormExplained {
    const share = snowShareOf(air);
    const base = {
        air: owner,
        audience,
        share,
        snowUnderWetBulb: SNOW_UNDER_WET_BULB,
        rainFromWetBulb: RAIN_FROM_WET_BULB,
    };
    if (!air || !Number.isFinite(air.temperature) || !Number.isFinite(air.humidity)) {
        return { ...base, form: "rain", reason: "unknown" };
    }
    const { temperature, humidity } = air;
    const wetBulb = wetBulbTemperature(temperature, humidity);
    const known = { ...base, temperature, humidity, wetBulb };
    if (share <= 0) {
        return {
            ...known,
            form: "rain",
            reason: wetBulb >= RAIN_FROM_WET_BULB ? "wetBulbWarm" : "airMild",
            snowUnder: thresholdBetween(temperature, COLDEST_C, (colder) => snowShare(colder, humidity) > 0),
            snowUnderHumidity: thresholdBetween(humidity, 0, (drier) => snowShare(temperature, drier) > 0),
        };
    }
    const rainFrom = thresholdBetween(temperature, WARMEST_C, (warmer) => snowShare(warmer, humidity) <= 0);
    if (share >= 1) return { ...known, form: "snow", reason: "wetBulbCold", rainFrom };
    return {
        ...known,
        form: "mix",
        reason: wetBulb <= SNOW_UNDER_WET_BULB ? "mildMix" : "mix",
        allSnowUnder: thresholdBetween(temperature, COLDEST_C, (colder) => snowShare(colder, humidity) >= 1),
        rainFrom,
    };
}

/** From this much frost the ground reads as white rather than lightly frosted. A choice of words. */
const WHITE_FROST = 0.5;

function explainFrost(
    air: AirNow | undefined,
    owner: AirOwner,
    audience: Audience,
    drawn: number | undefined,
): FrostExplained {
    const frost = frostOf(air);
    const base = { air: owner, audience, frost, drawn };
    if (!air || !Number.isFinite(air.temperature)) return { ...base, level: "none", reason: "unknown" };
    const { temperature, humidity, windSpeed } = air;
    const ground = surfaceTemperature(temperature, windSpeed);
    if (humidity === undefined || !Number.isFinite(humidity)) {
        return { ...base, level: "none", reason: "noHumidity", temperature, windSpeed, ground };
    }
    const known = {
        ...base,
        temperature,
        humidity,
        windSpeed,
        ground,
        frostPoint: humidity > 0 ? frostPoint(temperature, humidity) : undefined,
    };
    if (frost > 0) return { ...known, level: frost >= WHITE_FROST ? "white" : "light", reason: "frost" };
    const needsHumidity = thresholdBetween(humidity, 100, (damper) => frostOf({ ...air, humidity: damper }) > 0);
    // The wind alone holds the frost back when the same air, calm, would whiten the ground.
    const needsWindUnder =
        windSpeed === undefined
            ? undefined
            : thresholdBetween(windSpeed, 0, (calmer) => frostOf({ ...air, windSpeed: calmer }) > 0);
    if (needsWindUnder !== undefined) return { ...known, level: "none", reason: "wind", needsHumidity, needsWindUnder };
    if (ground >= 0) {
        return {
            ...known,
            level: "none",
            reason: "groundWarm",
            needsAirUnder: thresholdBetween(
                temperature,
                COLDEST_C,
                (colder) => surfaceTemperature(colder, windSpeed) < 0,
            ),
        };
    }
    return { ...known, level: "none", reason: "dry", needsHumidity };
}

/** The shallowest water there is, in map pixels: the first to freeze. */
const SHALLOWEST_PX = 1;

/** The air temperature (°C) under which water this deep is frozen, by the rule of the game. */
function freezesUnder(depthPx: number): number {
    return thresholdBetween(0, COLDEST_C, (colder) => isFrozen(depthPx, iceAt(colder))) ?? COLDEST_C;
}

let iceThresholds: IceExplained["thresholds"] | undefined;

function explainIce(
    air: AirNow | undefined,
    owner: AirOwner,
    audience: Audience,
    drawn: number | undefined,
): IceExplained {
    iceThresholds ??= {
        shallows: freezesUnder(SHALLOWEST_PX),
        pools: freezesUnder(POOL_ICE_DEPTH_PX),
        all: freezesUnder(DEEP_ICE_PX),
    };
    const ice = iceOf(air);
    const base = { air: owner, audience, ice, drawn, thresholds: iceThresholds };
    if (!air || !Number.isFinite(air.temperature)) return { ...base, stage: "none", reason: "unknown" };
    const stage: IceStage = isFrozen(DEEP_ICE_PX, ice)
        ? "all"
        : isFrozen(POOL_ICE_DEPTH_PX, ice)
          ? "pools"
          : isFrozen(SHALLOWEST_PX, ice)
            ? "shallows"
            : "none";
    const reason: IceReason = ice <= 0 ? "warm" : stage === "none" ? "barely" : "freezing";
    return { ...base, stage, reason, temperature: air.temperature };
}

function explainSoil(roomAir: PrecipitationAir | undefined): SoilExplained {
    const frost = soilFrostOf(roomAir);
    const base = {
        air: "map" as const,
        audience: "everyone" as const,
        frost,
        frozenUnder: SOIL_FROZEN_UNDER,
        thawedFrom: SOIL_THAWED_FROM,
    };
    if (!roomAir || !Number.isFinite(roomAir.temperature)) return { ...base, reason: "unknown" };
    return {
        ...base,
        reason: frost <= 0 ? "thawed" : frost >= 1 ? "frozen" : "partly",
        temperature: roomAir.temperature,
    };
}

function explainSnow(input: WeatherBoardInput): SnowExplained {
    const { roomAir, snow } = input;
    const share = snowShareOf(roomAir);
    const base = {
        air: "map" as const,
        audience: "serverFollowers" as const,
        known: snow !== undefined,
        mapCover: snow?.map ?? 0,
        hereCover: snow?.here ?? 0,
        shown: input.city === undefined,
        snowShare: share,
        temperature: roomAir?.temperature,
    };
    if (input.mapFalling && share > 0) return { ...base, trend: "building" };
    if (base.mapCover <= 0) return { ...base, trend: "none" };
    if (!roomAir || input.roomWind === undefined) return { ...base, trend: "unknown" };
    // What the server melts the snow by: the air of the room and the wind of its conditions (GameRoom, snowUnder).
    const melt = snowMeltMmPerHour({ ...roomAir, windSpeed: input.roomWind });
    if (melt <= 0) return { ...base, trend: "holding" };
    return { ...base, trend: "melting", whiteGroundMeltsIn: (SNOW_FULL_MM / (melt * THAW_SPEED)) * 3600 };
}

/** Why this player sees the weather they see: see the head of this file. */
export function explainWeather(input: WeatherBoardInput): WeatherBoard {
    const followsCity = input.city !== undefined;
    // The sky drawn: the city's when its weather shows, else the map's, the same for who follows the server.
    const sky: AirOwner = input.drawsOwnWeather ? "own" : "map";
    // The frost and the ice go by the city followed, even while a weather is tried in the map settings (Frost).
    const ground: AirOwner = followsCity ? "own" : "map";
    const seenBy = (owner: AirOwner): Audience => (owner === "own" ? "you" : "serverFollowers");
    const precipitation = { ...explainForm(input.precipitationAir, sky, seenBy(sky)), falling: input.falling };
    const frost = explainFrost(input.frostAir, ground, seenBy(ground), input.drawn?.frost);
    const ice = explainIce(input.frostAir, ground, seenBy(ground), input.drawn?.ice);
    // What every player who follows the server has, where this player's own air decides for them.
    const skyOnMap =
        sky === "own"
            ? { ...explainForm(input.roomAir, "map", "serverFollowers"), falling: input.mapFalling }
            : undefined;
    const frostOnMap =
        ground === "own" ? explainFrost(input.mapFrostAir, "map", "serverFollowers", undefined) : undefined;
    const iceOnMap = ground === "own" ? explainIce(input.mapFrostAir, "map", "serverFollowers", undefined) : undefined;
    return {
        follows: !followsCity ? "server" : input.drawsOwnWeather ? "city" : "trial",
        city: input.city,
        mapAir: input.mapAir,
        ownAir: followsCity ? input.ownAir : undefined,
        precipitation: {
            ...precipitation,
            onMap: skyOnMap,
            differs:
                skyOnMap !== undefined &&
                (skyOnMap.falling !== precipitation.falling || skyOnMap.form !== precipitation.form),
        },
        // The server lets the downpour fall, through the air of the room, for everyone.
        downpour: explainForm(input.roomAir, "map", "everyone"),
        frost: { ...frost, onMap: frostOnMap, differs: frostOnMap !== undefined && frostOnMap.level !== frost.level },
        ice: { ...ice, onMap: iceOnMap, differs: iceOnMap !== undefined && iceOnMap.stage !== ice.stage },
        soil: explainSoil(input.roomAir),
        snow: explainSnow(input),
    };
}
