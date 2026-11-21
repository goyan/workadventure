/**
 * Hoar frost (white frost): ice deposited from the water vapour of the air onto a surface colder than the frost point
 * of that air. It needs a surface at or under 0 °C and an air damp enough: in dry air it freezes without whitening
 * (a black frost). A very cold air holds little vapour, so colder is not whiter; a wind stirs the air near the ground
 * and keeps the surface as warm as the air, so it holds the frost back.
 *
 * Sources:
 * - WMO, Guide to Instruments and Methods of Observation (WMO-No. 8), Annex 4.B: the Magnus forms over water and over
 *   ice used here, as listed by H. Vömel (CIRES):
 *   https://www.eas.ualberta.ca/jdwilson/EAS372_15/Vomel_CIRES_satvpformulae.html
 * - R. L. Snyder, J. P. de Melo-Abreu, Frost Protection: fundamentals, practice and economics, FAO (2005), ch. 2
 *   (radiation frost on clear, calm nights; hoar or white frost when vapour deposits, black frost when it does not):
 *   https://www.fao.org/4/y7223e/y7223e07.htm
 *
 * The humidity of the weather service and of the conditions of a room is relative to liquid water, as weather services
 * give it: the vapour of the air is found over water, then compared with the saturation over ice of the surface.
 */

/** Saturation vapour pressure over liquid water, hPa, at `celsius` (WMO-No. 8, Annex 4.B; -45 to 60 °C). */
export function waterSaturationPressure(celsius: number): number {
    return 6.112 * Math.exp((17.62 * celsius) / (243.12 + celsius));
}

/** Saturation vapour pressure over ice, hPa, at `celsius` (WMO-No. 8, Annex 4.B; -65 to 0 °C). */
export function iceSaturationPressure(celsius: number): number {
    return 6.112 * Math.exp((22.46 * celsius) / (272.62 + celsius));
}

/** Vapour pressure of an air, hPa, from its temperature (°C) and its relative humidity over water (%). */
function vapourPressure(celsius: number, humidity: number): number {
    return (Math.min(100, Math.max(0, humidity)) / 100) * waterSaturationPressure(celsius);
}

/** Frost point of an air (°C): the temperature at which its vapour saturates over ice (the ice form inverted). */
export function frostPoint(celsius: number, humidity: number): number {
    const alpha = Math.log(vapourPressure(celsius, humidity) / 6.112);
    return (272.62 * alpha) / (22.46 - alpha);
}

/**
 * How much colder than the air (°C) the ground is in a calm: it loses heat to the sky. A choice, under the 1 to 3 °C
 * of grass on clear, calm nights (FAO): it holds by day and by night and under any sky, the weather read here giving
 * neither the night nor the clouds for every source (the conditions set by hand in a room have neither). So an air at
 * +1 °C never frosts here, though a clear calm night gives real hoar frost under such an air.
 */
export const CALM_SURFACE_COOLING = 0.8;
/**
 * Winds (km/h) between which the stirring of the air warms the ground back to the air: the whole cooling at and under
 * the first (about 2 m/s), none from the second (5 m/s). A choice of the order of a radiation frost needing a calm.
 */
export const CALM_WIND_KMH = 7;
export const STIRRED_WIND_KMH = 18;
/** Vapour (hPa) the air holds over the saturation over ice of the ground when the ground is all white. A choice. */
export const FULL_FROST_EXCESS_HPA = 0.25;

/**
 * Temperature of the ground (°C) under an air at `celsius` and a wind of `windSpeed` km/h: colder in a calm, the air
 * itself in a stirring wind. A wind not known is a calm.
 */
export function surfaceTemperature(celsius: number, windSpeed: number | undefined): number {
    const wind = windSpeed !== undefined && Number.isFinite(windSpeed) ? windSpeed : 0;
    const calm = Math.min(1, Math.max(0, (STIRRED_WIND_KMH - wind) / (STIRRED_WIND_KMH - CALM_WIND_KMH)));
    return celsius - CALM_SURFACE_COOLING * calm;
}

/** The air hoar frost forms from: its temperature (°C), its relative humidity over water (%), its wind (km/h). */
export interface HoarFrostAir {
    temperature: number;
    humidity: number;
    windSpeed?: number;
}

/**
 * How white the ground is with hoar frost, 0 to 1: by the vapour the air holds over the saturation over ice of the
 * ground (hPa), none over a ground above zero. None while the temperature or the humidity is not known.
 */
export function hoarFrost(air: HoarFrostAir | undefined): number {
    if (!air || !Number.isFinite(air.temperature) || !Number.isFinite(air.humidity)) return 0;
    const surface = surfaceTemperature(air.temperature, air.windSpeed);
    if (surface >= 0) return 0;
    const excess = vapourPressure(air.temperature, air.humidity) - iceSaturationPressure(surface);
    return Math.min(1, Math.max(0, excess / FULL_FROST_EXCESS_HPA));
}
