import { snowMeltMmPerHour } from "./Snow";
import type { SnowWeather } from "./Snow";

/**
 * The ice that takes on the water of a map in the frost: how fast it thickens, how fast it thaws, and what it bears.
 * Kept in millimetres of ice over the water of a tile, by the server, so that every player who follows its weather
 * skates on the same ice. The ice is the top of the water under it: freezing and thawing change no volume of water.
 * Pure rules, shared by the back (which keeps the ice) and the front.
 */

/** From this thickness (mm) the ice bears someone walking on it: under it, on water deep enough to swim, it gives way. */
export const ICE_BEARS_MM = 50;
/** From this thickness (mm) the ice is slipped on, as a rink: a frozen puddle, black ice on a flooded ground. */
export const ICE_SLIPS_MM = 5;
/** The thickest ice a tile holds, in mm. */
export const ICE_MAX_MM = 1000;

/**
 * Stefan's law: the square of the thickness grows with the degree-days of frost, thickness² = α² × degree-days with
 * α = 2.7 cm, which gives a growth of α² / 2 = 365 mm² a day by degree under zero, divided by the thickness.
 */
const STEFAN_MM2_PER_DEGREE_DAY = 365;
/** A film of ice grows as an ice this thick (mm): the law has no growth without end at its start. */
const FIRST_ICE_MM = 10;
/** The wind (km/h) that doubles the growth: it takes the heat of the water away. */
const GROWTH_WIND_KMH = 30;
/** The snow (mm of water) lying on the ice that halves its growth: it keeps the cold off. */
const INSULATING_SNOW_MM = 50;

/**
 * How fast the ice thickens, in mm a day of the real clock, for an ice `thicknessMm` thick under `snowMm` of snow (mm
 * of water): by the degrees under zero, faster in the wind, slower as it thickens and under the snow. None at 0 °C
 * and above, nor in an air that is not known.
 */
export function iceGrowthMmPerDay(thicknessMm: number, weather: SnowWeather, snowMm: number): number {
    if (!Number.isFinite(weather.temperature) || weather.temperature >= 0) return 0;
    const wind = Number.isFinite(weather.windSpeed) ? Math.max(0, weather.windSpeed) : 0;
    const thickness = Math.max(FIRST_ICE_MM, Number.isFinite(thicknessMm) ? thicknessMm : 0);
    const snow = Number.isFinite(snowMm) ? Math.max(0, snowMm) : 0;
    return (
        (STEFAN_MM2_PER_DEGREE_DAY * -weather.temperature * (1 + wind / GROWTH_WIND_KMH)) /
        thickness /
        (1 + snow / INSULATING_SNOW_MM)
    );
}

/** How fast the ice thaws, in mm an hour of the real clock: as the snow melts under the same air. */
export function iceThawMmPerHour(weather: SnowWeather): number {
    return snowMeltMmPerHour(weather);
}

/** The ice of a tile in a byte: by its square root, to tell a thin ice from none. */
export function iceByte(mm: number): number {
    if (!Number.isFinite(mm) || mm <= 0) return 0;
    return Math.max(1, Math.round(255 * Math.sqrt(Math.min(1, mm / ICE_MAX_MM))));
}

/** The ice (mm) a byte tells. */
export function iceMmOfByte(byte: number): number {
    return (byte / 255) ** 2 * ICE_MAX_MM;
}
