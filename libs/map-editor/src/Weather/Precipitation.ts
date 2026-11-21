/**
 * What falls from the sky is one thing, a precipitation: whether it reaches the ground as rain or as snow follows from
 * the air it falls through, never from a weather of its own. Shared by the back (the water that runs) and the front
 * (drops or flakes), so both find the same form from the same temperature and humidity.
 */

import { iceSaturationPressure, waterSaturationPressure } from "./HoarFrost";

/** The humidity range of the fit of Stull (2011), in %. */
const STULL_HUMIDITY: readonly [number, number] = [5, 99];
/** The temperature range of that fit, in °C: out of it the psychrometric equation is solved instead. */
const STULL_TEMPERATURE: readonly [number, number] = [-20, 50];
/** Sea-level pressure, hPa: the fit of Stull is for it too. */
const SEA_LEVEL_HPA = 1013.25;

/**
 * Wet-bulb temperature (°C) at sea-level pressure from the air temperature (°C) and its relative humidity (%): the
 * empirical fit of R. Stull, "Wet-Bulb Temperature from Relative Humidity and Air Temperature", J. Appl. Meteor.
 * Climatol. 50 (2011), 2267-2269. Valid from -20 to 50 °C and 5 to 99 % (the humidity is kept within), to about 0.3 °C;
 * less exact in air both cold and very dry. Out of its temperature range the fit is no longer to be trusted (it gives
 * -48 °C for an air at -80 °C and 5 %): the psychrometric equation is solved there (psychrometricWetBulb).
 */
export function wetBulbTemperature(temperature: number, humidity: number): number {
    if (temperature < STULL_TEMPERATURE[0] || temperature > STULL_TEMPERATURE[1]) {
        return psychrometricWetBulb(temperature, humidity);
    }
    const rh = Math.min(STULL_HUMIDITY[1], Math.max(STULL_HUMIDITY[0], humidity));
    return (
        temperature * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
        Math.atan(temperature + rh) -
        Math.atan(rh - 1.676331) +
        0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
        4.686035
    );
}

/**
 * Wet-bulb temperature (°C) at sea-level pressure by the psychrometric formulae of the WMO (WMO-No. 8, 2018, Annex
 * 4.B, eq. 4.B.8 over water, 4.B.9 over ice under zero): the bulb whose saturation vapour pressure, less what the dry
 * air takes from it by its warmth, is the vapour of the air. Solved by halving between the air and 120 °C under it:
 * the left side grows with the bulb. The enhancement factor f(p), about 1.004 on both sides, is left out.
 */
function psychrometricWetBulb(temperature: number, humidity: number): number {
    const vapour = (Math.min(100, Math.max(0, humidity)) / 100) * waterSaturationPressure(temperature);
    const excess = (bulb: number): number =>
        bulb >= 0
            ? waterSaturationPressure(bulb) -
              6.53e-4 * (1 + 0.000944 * bulb) * SEA_LEVEL_HPA * (temperature - bulb) -
              vapour
            : iceSaturationPressure(bulb) - 5.75e-4 * SEA_LEVEL_HPA * (temperature - bulb) - vapour;
    let low = temperature - 120;
    let high = temperature;
    for (let step = 0; step < 48; step++) {
        const middle = (low + high) / 2;
        if (excess(middle) > 0) high = middle;
        else low = middle;
    }
    return (low + high) / 2;
}

/**
 * Wet-bulb temperatures (°C) between which rain and snow fall together: all snow at or under the first, all rain from
 * the second, half of each at 1.0 °C, the wet-bulb temperature at which snow and rain are as likely over land (Sims and
 * Liu 2015, Geophys. Res. Lett.; Behrangi et al. 2018, Q. J. R. Meteorol. Soc.). The width of the mix (1 °C) is a
 * choice within the 1.5 to 2 °C the observations spread over.
 */
export const SNOW_UNDER_WET_BULB = 0.5;
export const RAIN_FROM_WET_BULB = 1.5;
/**
 * Air temperatures (°C) between which the snow gives way whatever the humidity: flakes do reach the ground in dry air
 * a few degrees over zero (Jennings et al. 2018, Nat. Commun.: thresholds up to about 4 °C), not on a mild day, where
 * the fit of the wet bulb is no longer to be trusted in very dry air. A choice.
 */
const SNOW_FADES_FROM_AIR = 4;
const NO_SNOW_FROM_AIR = 6;

const unit = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The share of a precipitation that falls as snow, 0 (rain) to 1 (snow), for an air temperature (°C) and a relative
 * humidity (%): by the wet-bulb temperature, which is what a falling flake feels (it cools as it evaporates, so dry air
 * keeps it frozen where damp air melts it). Rain when either is not a number.
 */
export function snowShare(temperature: number, humidity: number): number {
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) return 0;
    const byWetBulb = unit(
        (RAIN_FROM_WET_BULB - wetBulbTemperature(temperature, humidity)) / (RAIN_FROM_WET_BULB - SNOW_UNDER_WET_BULB),
    );
    const byAir = unit((NO_SNOW_FROM_AIR - temperature) / (NO_SNOW_FROM_AIR - SNOW_FADES_FROM_AIR));
    return byWetBulb * byAir;
}

/** The air a precipitation falls through: what the conditions of a room give (FireConditions). */
export interface PrecipitationAir {
    /** Degrees Celsius. */
    temperature: number;
    /** Relative humidity, in %. */
    humidity: number;
}

/** The share of snow under the conditions of a room; rain while they are not known. */
export function snowShareOf(air: PrecipitationAir | undefined): number {
    return air ? snowShare(air.temperature, air.humidity) : 0;
}

/**
 * The part of a precipitation rate (mm of water an hour) that reaches the ground as water: the snow lies where it
 * falls, it neither runs to the hollows nor soaks the soil.
 */
export function liquidRainRate(rate: number, air: PrecipitationAir | undefined): number {
    return rate * (1 - snowShareOf(air));
}

/**
 * The part of a precipitation rate (mm of water an hour) that falls as snow, and lies on the ground: what
 * liquidRainRate leaves.
 */
export function snowRainRate(rate: number, air: PrecipitationAir | undefined): number {
    return rate * snowShareOf(air);
}
