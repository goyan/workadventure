/**
 * Hoar frost (white frost): ice deposited from the water vapour of the air onto a surface colder than the frost point
 * of that air. It needs a surface under 0 °C and an air saturated over the ice of that surface: whether it deposits is
 * the ratio of the vapour of the air to the saturation over ice at the surface (at or over 1: the surface is at or under
 * the frost point). In a drier air it freezes without whitening (a black frost). How fast it deposits goes by the
 * vapour in excess, in hPa, which a very cold air has little of: a great cold whitens as soon as its air is saturated
 * over ice, with a thinner deposit, never none. A wind stirs the air near the ground and keeps the surface as warm as
 * the air, so it holds the frost back.
 *
 * Sources:
 * - WMO, Guide to Instruments and Methods of Observation (WMO-No. 8), Annex 4.B: the Magnus forms over water and over
 *   ice used here, as listed by H. Vömel (CIRES):
 *   https://www.eas.ualberta.ca/jdwilson/EAS372_15/Vomel_CIRES_satvpformulae.html
 * - R. L. Snyder, J. P. de Melo-Abreu, Frost Protection: fundamentals, practice and economics, FAO (2005), ch. 2
 *   (radiation frost on clear, calm nights; hoar or white frost when vapour deposits, black frost when it does not):
 *   https://www.fao.org/4/y7223e/y7223e07.htm
 * - American Meteorological Society, Glossary of Meteorology, "hoarfrost" (deposited when air with a frost point below
 *   freezing is brought to saturation by cooling): https://glossary.ametsoc.org/wiki/Hoarfrost
 * - University of British Columbia, ATSC 113, "Surface hoar" (deposited when the surface falls below the frost point of
 *   the air, under clear skies and winds under 15 km/h):
 *   https://www.eoas.ubc.ca/courses/atsc113/snow/met_concepts/07-met_concepts/07i-surface-hoar/
 * - A. Hachikubo, E. Akitaya, Effect of wind on surface hoar growth on snow, J. Geophys. Res. 102 (1997): the rate of
 *   deposition grows with the vapour pressure difference between the air and the surface (times the wind), read in
 *   its abstract only: https://kitami-it.repo.nii.ac.jp/record/7575/files/%281997%29JGR.pdf
 *
 * The humidity of the weather service and of the conditions of a room is relative to liquid water, as weather services
 * give it: the vapour of the air is found over water, then compared with the saturation over ice of the surface.
 */

/**
 * Saturation vapour pressure over liquid water, hPa, at `celsius` (WMO-No. 8, Annex 4.B; -45 to 60 °C). Read from -80
 * to +80 °C too, the bounds of the conditions of a room: it stays within 2.5 % of the vapour pressure of supercooled
 * water of D. M. Murphy and T. Koop (Q. J. R. Meteorol. Soc. 131, 2005), valid from -150 °C, and within 1.5 % of the
 * steam tables at 80 °C (see the tests "at the extremes"): kept as it is rather than held at its range, which would make
 * the vapour of an air at -80 °C a hundred times too much.
 */
export function waterSaturationPressure(celsius: number): number {
    return 6.112 * Math.exp((17.62 * celsius) / (243.12 + celsius));
}

/**
 * Saturation vapour pressure over ice, hPa, at `celsius` (WMO-No. 8, Annex 4.B; -65 to 0 °C). Read down to -80 °C, it
 * stays within 1 % of the vapour pressure of ice of Murphy and Koop (2005), valid from -163 °C.
 */
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
/**
 * Supersaturation over the ice of the ground (the ratio of the vapour of the air to the saturation over ice of the
 * ground, less 1) at which the ground is all white: from nothing at saturation to all white at 5 % over it. A choice,
 * hoar frost needing only a slight supersaturation.
 */
export const FULL_FROST_SUPERSATURATION = 0.05;
/**
 * Vapour in excess (hPa) over the saturation over ice of the ground at which the frost deposits at its full speed, so
 * at its full thickness: under it, in a great cold whose air holds little vapour, the deposit is thinner (Hachikubo and
 * Akitaya). A choice under the excess of a damp air at -2 °C, which deposits at its full thickness. It was, before
 * the frost of great colds, the excess at which the ground was all white (0.25 hPa).
 */
export const FULL_FROST_EXCESS_HPA = 0.1;
/**
 * Winds (km/h) between which a storm sweeps the frost away: whole up to the first, the strongest the conditions of a
 * room could be set to before 2026-11-21 (nothing changes under it), none at the second, their strongest now. A choice:
 * surface hoar is a fragile deposit of calm air (UBC, "Surface hoar": winds under 15 km/h) that a storm tears off as it
 * forms; under 120 km/h the wind only keeps the ground as warm as the air, as before.
 */
export const FROST_SWEPT_FROM_KMH = 120;
export const FROST_SWEPT_KMH = 250;
/** Share of its whiteness a frost keeps at least however cold, the deposit being thinner but never none. A choice. */
export const COLD_FROST_SHARE = 0.5;

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
 * Ratio of the vapour of the air to the saturation over ice of the ground under it: hoar frost deposits at 1 and over
 * (the ground at or under the frost point of the air). Undefined while the temperature or the humidity is not known.
 */
export function iceSaturationRatio(air: HoarFrostAir | undefined): number | undefined {
    if (!air || !Number.isFinite(air.temperature) || !Number.isFinite(air.humidity)) return undefined;
    const surface = surfaceTemperature(air.temperature, air.windSpeed);
    return vapourPressure(air.temperature, air.humidity) / iceSaturationPressure(surface);
}

/**
 * How white the ground is with hoar frost, 0 to 1: by the supersaturation of the air over the ice of the ground, none
 * under saturation, all white at FULL_FROST_SUPERSATURATION; thinner when the vapour in excess (hPa) is under
 * FULL_FROST_EXCESS_HPA, down to COLD_FROST_SHARE of it; swept away by a storm from FROST_SWEPT_FROM_KMH, none at
 * FROST_SWEPT_KMH. None over a ground at or above zero, none while the temperature or the humidity is not known.
 */
export function hoarFrost(air: HoarFrostAir | undefined): number {
    const ratio = iceSaturationRatio(air);
    if (!air || ratio === undefined || ratio <= 1) return 0;
    const surface = surfaceTemperature(air.temperature, air.windSpeed);
    if (surface >= 0) return 0;
    const white = Math.min(1, (ratio - 1) / FULL_FROST_SUPERSATURATION);
    const excess = vapourPressure(air.temperature, air.humidity) - iceSaturationPressure(surface);
    const thickness = Math.min(1, excess / FULL_FROST_EXCESS_HPA);
    const wind = air.windSpeed !== undefined && Number.isFinite(air.windSpeed) ? air.windSpeed : 0;
    const kept = Math.min(1, Math.max(0, (FROST_SWEPT_KMH - wind) / (FROST_SWEPT_KMH - FROST_SWEPT_FROM_KMH)));
    return white * (COLD_FROST_SHARE + (1 - COLD_FROST_SHARE) * thickness) * kept;
}
