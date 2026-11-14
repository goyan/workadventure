import { WeatherType } from "@workadventure/map-editor";
import { z } from "zod";

/** Paris, whose real weather the "real" map weather shows: the same point as the night clock. */
export const PARIS_LATITUDE = 48.8566;
export const PARIS_LONGITUDE = 2.3522;

/** A weather that can be observed: the map modes (Automatic, Real) are not. */
export const ObservedWeather = z.enum([
    WeatherType.Clear,
    WeatherType.Fog,
    WeatherType.Rain,
    WeatherType.Snow,
    WeatherType.Storm,
]);
export type ObservedWeather = z.infer<typeof ObservedWeather>;

/**
 * What the pusher answers on /real-weather: the weather in Paris and the time (epoch ms) the pusher first saw it, or
 * nulls when the weather service gave nothing usable for an hour.
 */
export const RealWeatherReport = z.union([
    z.object({ weather: ObservedWeather, since: z.number().int().nonnegative() }),
    z.object({ weather: z.null(), since: z.null() }),
]);
export type RealWeatherReport = z.infer<typeof RealWeatherReport>;

/**
 * The game weather for a WMO weather interpretation code, as reported by Open-Meteo. Clouds count as clear; freezing
 * drizzle and rain fall as rain; hail is part of a thunderstorm. An unknown code has no weather.
 */
export function weatherFromWmoCode(code: number): ObservedWeather | undefined {
    if (!Number.isInteger(code)) return undefined;
    if (code >= 0 && code <= 3) return WeatherType.Clear;
    if (code === 45 || code === 48) return WeatherType.Fog;
    if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
        return WeatherType.Rain;
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return WeatherType.Snow;
    if (code >= 95 && code <= 99) return WeatherType.Storm;
    return undefined;
}
