import { blendedWind, hurricaneAt, STORM_RAIN_RATE, USUAL_RAIN_RATE, WeatherType } from "@workadventure/map-editor";
import type { Hurricane } from "@workadventure/map-editor";
import type { MapSnowSettings } from "./SnowCover";

/** Under this rain (mm/h) the sky of the storm shows no rain: the eye, and the gaps between bands far out. */
const DRY_UNDER_MM_PER_HOUR = 0.1;
/**
 * The outer rain bands of a hurricane hold most of its lightning, the eyewall little (Molinari et al. 1999, cloud-to-
 * ground lightning of Atlantic hurricanes: a strong maximum 210 to 290 km from the centre [Gemini, to be checked]):
 * the storm thunders there, it only rains in the wall.
 */
const THUNDER_FROM_KM = 200;
const THUNDER_TO_KM = 300;

/** How hard the weather of the map rains, mm/h, as it is drawn (rainIntensity): its rate, or the usual one. */
function mapRainRate(settings: MapSnowSettings | undefined): number {
    const weather = settings?.weather;
    if (weather !== WeatherType.Rain && weather !== WeatherType.Storm) return 0;
    return settings?.rainRate ?? (weather === WeatherType.Storm ? STORM_RAIN_RATE : USUAL_RAIN_RATE);
}

/**
 * The weather of the map as its hurricane makes it at `date` (the time of the server), for everyone: the rain, the
 * cloud and the wind of the storm take the place of those of the map (personal choices aside), faded in and out at
 * the ends of the passage (HurricaneNow.share). In the eye the sky clears, whatever the map says. The same settings
 * outside a hurricane.
 */
export function withHurricane(
    settings: MapSnowSettings | undefined,
    hurricane: Hurricane | undefined,
    date: Date | undefined,
): MapSnowSettings | undefined {
    if (!hurricane || !date) return settings;
    const now = hurricaneAt(hurricane, date.getTime());
    if (!now || now.share <= 0) return settings;
    const share = now.share;
    const base = { windSpeed: settings?.windSpeed ?? 10, windFrom: settings?.windFrom ?? 315 };
    const wind = blendedWind(base, now, share);
    const rainRate = mapRainRate(settings) + (now.rainRate - mapRainRate(settings)) * share;
    // The weather of the map until the storm has taken over half of it, then that of the storm.
    if (share < 0.5) return { ...settings, windFrom: wind.windFrom, windSpeed: wind.windSpeed };
    const mapCover = settings?.cloudCover ?? settings?.cloudiness ?? 0;
    const cover = mapCover + (now.cloudCover - mapCover) * share;
    const thunders = now.distanceKm >= THUNDER_FROM_KM && now.distanceKm <= THUNDER_TO_KM;
    const shown: MapSnowSettings = {
        ...settings,
        weather: rainRate < DRY_UNDER_MM_PER_HOUR ? WeatherType.Clear : thunders ? WeatherType.Storm : WeatherType.Rain,
        rainRate: rainRate < DRY_UNDER_MM_PER_HOUR ? 0 : rainRate,
        windFrom: wind.windFrom,
        windSpeed: wind.windSpeed,
        // The puddles fill from the start of the storm, which has been raining since.
        rainSince: hurricane.startedAt,
    };
    delete shown.rainDryFrom;
    if (shown.weather === WeatherType.Clear) {
        // A clear sky with the clouds of the storm: the low clouds of the eye under the open sky.
        shown.cloudiness = cover;
        delete shown.cloudCover;
    } else {
        shown.cloudCover = cover;
        shown.cloudiness = cover;
    }
    return shown;
}
