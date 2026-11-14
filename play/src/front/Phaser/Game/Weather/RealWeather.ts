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
    const { weatherAuto } = settings;
    switch (real.status) {
        case "known":
            return { weather: real.weather, weatherStartedAt: real.since, weatherAuto };
        case "unavailable":
            return { weather: WeatherType.Automatic, weatherAuto };
        default:
            return { weather: WeatherType.Clear, weatherAuto };
    }
}
