import { WeatherType } from "@workadventure/map-editor";
import type { ObservedWeather } from "../../../../common/RealWeather";
import type { MapSnowSettings } from "./SnowCover";

/** What this browser knows of the weather in Paris (RealWeatherClient). */
export type RealWeatherState =
    | { status: "pending" }
    | { status: "known"; weather: ObservedWeather; since: number }
    | { status: "unavailable" };

/**
 * The map weather settings with "real" replaced by what it shows: the observed weather, begun when the pusher first
 * saw it (so fog and snow fade in); clear until the first answer, so no drawn weather flashes on load; the seasonal
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
            return { weather: real.weather, weatherStartedAt: real.since, weatherAuto, weatherLocation };
        case "unavailable":
            return { weather: WeatherType.Automatic, weatherAuto, weatherLocation };
        default:
            return { weather: WeatherType.Clear, weatherAuto, weatherLocation };
    }
}

/** What the map settings panel shows to the person trying a weather, before it is saved. */
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
        weatherLocation: preview.weatherLocation ?? settings?.weatherLocation,
    };
}
