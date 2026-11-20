/**
 * What falls from the sky is one thing, a precipitation: whether it reaches the ground as rain or as snow follows from
 * the air it falls through, never from a weather of its own. Shared by the back (the water that runs) and the front
 * (drops or flakes), so both find the same form from the same temperature and humidity.
 */

/** The humidity range of the fit of Stull (2011), in %. */
const STULL_HUMIDITY: readonly [number, number] = [5, 99];

/**
 * Wet-bulb temperature (°C) at sea-level pressure from the air temperature (°C) and its relative humidity (%): the
 * empirical fit of R. Stull, "Wet-Bulb Temperature from Relative Humidity and Air Temperature", J. Appl. Meteor.
 * Climatol. 50 (2011), 2267-2269. Valid from -20 to 50 °C and 5 to 99 % (the humidity is kept within), to about 0.3 °C;
 * less exact in air both cold and very dry.
 */
export function wetBulbTemperature(temperature: number, humidity: number): number {
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
