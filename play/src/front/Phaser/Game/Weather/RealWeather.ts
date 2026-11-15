import { WeatherType } from "@workadventure/map-editor";
import { realWeatherAt } from "../../../../common/RealWeather";
import type { ObservedWeather, RealWeatherSlot } from "../../../../common/RealWeather";
import type { MapSnowSettings } from "./SnowCover";
import { fadedCloudiness } from "./WeatherSchedule";

/** What this browser knows of the weather timeline at the place of the map (RealWeatherClient). */
export type RealForecastState =
    | { status: "pending" }
    | { status: "known"; slots: RealWeatherSlot[] }
    | { status: "unavailable" };

/** The real weather at one instant, as the map shows it. */
export type RealWeatherState =
    | { status: "pending" }
    | {
          status: "known";
          weather: ObservedWeather;
          since: number;
          /** End of the run when known, for a fog to fade out. */
          until?: number;
          /** When a snow just before this weather stopped, for the ground to melt. */
          snowMeltFrom?: number;
          /** Clouds of a clear sky, 0 to 1, faded in from those of the quarter hour before. */
          cloudiness?: number;
          /** Cloud cover of a rain or a storm, 0 to 1: how dense its grey or dark clouds are. */
          cloudCover?: number;
          /** Where the wind comes from (degrees, 0 north), turned from that of the quarter hour before. */
          windFrom?: number;
      }
    | { status: "unavailable" };

/** How long the wind takes to turn from one quarter hour to the next: the clouds bend their way slowly. */
const WIND_TURN_MS = 10 * 60 * 1000;

/** The wind direction from `before` to `now`, `elapsed` ms into the quarter hour, the shorter way round (degrees). */
function turnedWind(before: number | undefined, now: number | undefined, elapsed: number): number | undefined {
    if (now === undefined || before === undefined) return now;
    const turn = ((now - before + 540) % 360) - 180;
    const share = Math.max(0, Math.min(1, elapsed / WIND_TURN_MS));
    return (before + turn * share + 360) % 360;
}

/**
 * The real weather at the game date: pending until the first answer and the date are known, unavailable when the
 * timeline does not cover that date (the map then falls back to the seasonal draw).
 */
export function realWeatherStateAt(forecast: RealForecastState, date: Date | undefined): RealWeatherState {
    if (forecast.status !== "known") return forecast;
    if (!date) return { status: "pending" };
    const now = realWeatherAt(forecast.slots, date.getTime());
    if (!now) return { status: "unavailable" };
    const snowMeltFrom = now.before === WeatherType.Snow && now.weather !== WeatherType.Snow ? now.since : undefined;
    // White clouds belong to a clear sky: those of the quarter hour before count only if it was clear too.
    const weatherBefore = now.slotAt === now.since ? now.before : now.weather;
    const clearBefore = weatherBefore === WeatherType.Clear ? now.cloudinessBefore : 0;
    const clearNow = now.weather === WeatherType.Clear ? now.cloudiness : 0;
    const cloudiness = fadedCloudiness(clearBefore, clearNow, date.getTime() - now.slotAt);
    const raining = now.weather === WeatherType.Rain || now.weather === WeatherType.Storm;
    const windFrom = turnedWind(now.windFromBefore, now.windFrom, date.getTime() - now.slotAt);
    return {
        status: "known",
        weather: now.weather,
        since: now.since,
        until: now.until,
        snowMeltFrom,
        ...(cloudiness > 0 ? { cloudiness } : {}),
        ...(raining && now.cloudiness > 0 ? { cloudCover: now.cloudiness } : {}),
        ...(windFrom !== undefined ? { windFrom } : {}),
    };
}

/**
 * The map weather settings with "real" replaced by what it shows: the weather of the quarter hour under way, begun at
 * the start of its run (so fog and snow fade in); clear until the first answer, so no drawn weather flashes on load; the seasonal
 * draw with the map's Auto settings while the weather service is unavailable. Other modes are returned untouched.
 */
export function withRealWeather(
    settings: MapSnowSettings | undefined,
    real: RealWeatherState,
): MapSnowSettings | undefined {
    if (settings?.weather !== WeatherType.Real) return settings;
    const { weatherAuto, weatherLocation } = settings;
    switch (real.status) {
        case "known":
            return {
                weather: real.weather,
                weatherStartedAt: real.since,
                weatherEndsAt: real.until,
                snowMeltFrom: real.snowMeltFrom,
                cloudiness: real.cloudiness,
                cloudCover: real.cloudCover,
                windFrom: real.windFrom,
                weatherAuto,
                weatherLocation,
            };
        case "unavailable":
            return { weather: WeatherType.Automatic, weatherAuto, weatherLocation };
        default:
            return { weather: WeatherType.Clear, weatherAuto, weatherLocation };
    }
}

/**
 * What the map settings panel shows to the person trying a weather, before it is saved. Without `weatherLocation`, the
 * saved place stays; with it undefined, the default place (Paris) is tried.
 */
export interface WeatherPreview {
    weather: WeatherType;
    weatherAuto?: MapSnowSettings["weatherAuto"];
    weatherLocation?: MapSnowSettings["weatherLocation"];
}

/**
 * The map weather settings with the weather being tried in the settings panel, for this person only: shown at once,
 * without the start of the saved episode (so it does not fade in), and with the place being tried if any.
 */
export function withWeatherPreview(
    settings: MapSnowSettings | undefined,
    preview: WeatherPreview | undefined,
): MapSnowSettings | undefined {
    if (!preview) return settings;
    return {
        weather: preview.weather,
        weatherAuto: preview.weatherAuto ?? settings?.weatherAuto,
        // A preview may try going back to the default place (weatherLocation present but undefined).
        weatherLocation: "weatherLocation" in preview ? preview.weatherLocation : settings?.weatherLocation,
    };
}
