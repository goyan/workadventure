import { TILE_AREA_M2 } from "./Scale";

/**
 * The snow lying on the ground of a map: how much of it whitens the ground, how fast it melts and how fast it goes
 * without melting. Kept in millimetres of water (what it gives back when it melts), so that what fell is what melts
 * plus what the dry wind took. Pure rules, shared by the back (which keeps the snow) and the front.
 */

/** The most snow a tile holds, in mm of water. */
export const SNOW_MAX_MM = 600;
/** The snow, in mm of water, from which the ground under it is all white. */
export const SNOW_FULL_MM = 15;

/**
 * The most the snow that falls lays on a tile, in mm of water, at that speed of the freeze and the thaw of the map
 * (WaterSettings.freezeThawSpeed): SNOW_MAX_MM in real time; a ground all white (SNOW_FULL_MM) as soon as it goes
 * faster (« >> », « >>> »), where the snow falls as fast as the cold goes: the water of its melt, poured on the
 * relief, then never floods the map (a choice of the user, 2026-11-27). A snow already thicker is kept, only no more
 * falls on it; back to ×1 it thickens again at the pace of reality.
 */
export function snowfallCapMm(freezeThawSpeed: number): number {
    return Number.isFinite(freezeThawSpeed) && freezeThawSpeed > 1 ? SNOW_FULL_MM : SNOW_MAX_MM;
}

/** `snowMm` lying, with `fallenMm` fallen on it, no thicker than `capMm` unless it was already. */
export function snowLaid(snowMm: number, fallenMm: number, capMm = SNOW_MAX_MM): number {
    const cap = Math.min(SNOW_MAX_MM, capMm);
    return fallenMm > 0 && snowMm < cap ? Math.min(cap, snowMm + fallenMm) : snowMm;
}

/** Melt by degree and by hour: a degree-day factor of 4.8 mm/°C/day, within the usual 3 to 6. */
const MELT_MM_PER_DEGREE_HOUR = 0.2;
/** The wind (km/h) that doubles the melt: it brings the heat of the air to the snow. */
const MELT_WIND_KMH = 20;
/** Sublimation by km/h of wind and by hour, in a wholly dry air. */
const SUBLIMATION_MM_PER_KMH_HOUR = 0.02;
/** The share of a rain that melts the snow it falls on, by degree over zero (the heat of its water). */
const RAIN_MELT_PER_DEGREE = 0.1;

/** The air over the snow: what the conditions of a room give. */
export interface SnowWeather {
    /** Degrees Celsius. */
    temperature: number;
    /** Relative humidity, in %. */
    humidity: number;
    /** Wind speed, in km/h. */
    windSpeed: number;
}

const known = (weather: SnowWeather): boolean =>
    Number.isFinite(weather.temperature) && Number.isFinite(weather.humidity) && Number.isFinite(weather.windSpeed);

const share = (humidity: number): number => Math.min(1, Math.max(0, humidity / 100));

/** How much of the ground a snow of `mm` of water whitens, 0 to 1. */
export function snowCoverOf(mm: number): number {
    return Number.isFinite(mm) ? Math.min(1, Math.max(0, mm / SNOW_FULL_MM)) : 0;
}

/**
 * How fast the snow melts, in mm of water an hour of the real clock: by the degrees over zero, faster in the wind
 * (which brings heat) and in damp air (which gives its heat as it condenses; a dry air takes some). None at 0 °C and
 * under, nor in an air that is not known.
 */
export function snowMeltMmPerHour(weather: SnowWeather): number {
    if (!known(weather) || weather.temperature <= 0) return 0;
    return (
        weather.temperature *
        MELT_MM_PER_DEGREE_HOUR *
        (1 + Math.max(0, weather.windSpeed) / MELT_WIND_KMH) *
        (0.5 + share(weather.humidity))
    );
}

/**
 * While snow falls on it, the snow lying on the ground melts as if the air were this many degrees colder: every flake
 * renews a cold surface and the flakes that melt on their way down cool the air under them towards zero. A snow that
 * falls thus holds on the ground up to about +2 °C, melts weakly just over that, and melts as usual once the fall stops.
 * A choice of the user (2026-11-27).
 */
export const SNOW_HOLDS_WHILE_FALLING_C = 2;

/** The temperature the snow on the ground melts by: SNOW_HOLDS_WHILE_FALLING_C colder while snow falls on it. */
export function snowMeltTemperature(temperature: number, snowFalling: boolean): number {
    return snowFalling ? temperature - SNOW_HOLDS_WHILE_FALLING_C : temperature;
}

/** The air the snow on the ground melts by (snowMeltTemperature): the air itself while no snow falls. */
export function snowMeltWeather(weather: SnowWeather, snowFalling: boolean): SnowWeather {
    return snowFalling ? { ...weather, temperature: snowMeltTemperature(weather.temperature, true) } : weather;
}

/** How fast a dry wind takes the snow without melting it, in mm of water an hour, at any temperature. */
export function snowSublimationMmPerHour(weather: SnowWeather): number {
    if (!known(weather)) return 0;
    return SUBLIMATION_MM_PER_KMH_HOUR * Math.max(0, weather.windSpeed) * (1 - share(weather.humidity));
}

/** The snow (mm of water) a rain of `rainMm` melts where it falls, at this temperature of the air. */
export function rainMeltMm(rainMm: number, temperature: number): number {
    if (!Number.isFinite(rainMm) || !Number.isFinite(temperature) || rainMm <= 0 || temperature <= 0) return 0;
    return rainMm * RAIN_MELT_PER_DEGREE * temperature;
}

/** The snow of a tile in a byte: by its square root, to tell a thin snow from none. */
export function snowByte(mm: number): number {
    if (!Number.isFinite(mm) || mm <= 0) return 0;
    return Math.max(1, Math.round(255 * Math.sqrt(Math.min(1, mm / SNOW_MAX_MM))));
}

/** The snow (mm of water) a byte tells. */
export function snowMmOfByte(byte: number): number {
    return (byte / 255) ** 2 * SNOW_MAX_MM;
}

/**
 * The heat that melts a kilogram of ice at 0 °C, in J: a mm of water over a square metre is a kilogram, so as many
 * joules a square metre melt a mm of snow (a snow at -10 °C first takes some 6 % more to warm to 0 °C, left aside).
 */
const FUSION_J_PER_KG = 334_000;
/** The Stefan-Boltzmann constant, W/m²/K⁴. */
const STEFAN_BOLTZMANN = 5.670374e-8;
/**
 * What a square metre of the flames of a vegetation fire radiates, in W: a flame at 1090 K of emissivity 0.95, the
 * values the Australian standard for building in bushfire areas takes (AS 3959), about 76 kW/m². The snow takes
 * nearly all of it: it is almost black in the thermal infrared (Warren 1982, Optical properties of snow).
 */
export const FLAME_EMISSIVE_W_PER_M2 = STEFAN_BOLTZMANN * 0.95 * 1090 ** 4;
/** How tall the flames of a tile on fire are, in m: those of a grass fire, about a metre (and a tile wide). */
export const FLAME_HEIGHT_M = 1;
/**
 * The flames of a tile radiate on the snow up to this many tiles from it: farther, one tile on fire melts less than
 * 0.0005 mm of water a second (0.15 kW/m²), under a fortieth of what it melts one tile away.
 */
export const FLAME_REACH_TILES = 4;
/** The width of a tile, in m (TILE_AREA_M2). */
const TILE_M = Math.sqrt(TILE_AREA_M2);

/**
 * How fast the flames of one tile on fire melt the snow lying `distanceTiles` tiles from them (from centre to
 * centre), in mm of water a second: the heat they radiate onto the ground there, a vertical panel of flames a tile
 * wide and FLAME_HEIGHT_M tall seen from a level ground (E·w·H²·d / 2π(d² + (H/2)²)²: about 7 kW/m² one tile
 * away, 1.2 kW/m² two tiles away), melts it as it comes. Their own tile is under them, not lit from aside: 0 there,
 * and beyond FLAME_REACH_TILES. The flames of a whole front add up to the radiation of a wall of fire. Kept for the
 * clock of the real world: what goes faster with the cold of the map is for the caller.
 */
export function flameMeltMmPerSecond(distanceTiles: number): number {
    if (!Number.isFinite(distanceTiles) || distanceTiles <= 0 || distanceTiles > FLAME_REACH_TILES) return 0;
    const distance = distanceTiles * TILE_M;
    const height = FLAME_HEIGHT_M;
    const squared = distance * distance + (height / 2) ** 2;
    const watts = (FLAME_EMISSIVE_W_PER_M2 * TILE_M * height * height * distance) / (2 * Math.PI * squared * squared);
    return watts / FUSION_J_PER_KG;
}
