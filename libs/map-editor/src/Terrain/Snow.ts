/**
 * The snow lying on the ground of a map: how much of it whitens the ground, how fast it melts and how fast it goes
 * without melting. Kept in millimetres of water (what it gives back when it melts), so that what fell is what melts
 * plus what the dry wind took. Pure rules, shared by the back (which keeps the snow) and the front.
 */

/** The most snow a tile holds, in mm of water. */
export const SNOW_MAX_MM = 600;
/** The snow, in mm of water, from which the ground under it is all white. */
export const SNOW_FULL_MM = 15;

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
