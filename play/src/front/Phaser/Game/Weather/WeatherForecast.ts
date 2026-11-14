import { WeatherType } from "@workadventure/map-editor";
import { realWeatherAt } from "../../../../common/RealWeather";
import type { RealForecastState } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";
import { weatherAtTime } from "./WeatherFrame";
import { autoWeatherAt } from "./WeatherSchedule";

/** The hours ahead shown by the weather banner: now, in one hour, in four hours. */
export const FORECAST_HOURS: readonly number[] = [0, 1, 4];
const HOUR_MS = 60 * 60 * 1000;

/** The weather of the map at one moment of the banner; undefined when not known (yet). */
export interface ForecastCell {
    at: number;
    weather: WeatherType | undefined;
    /** °C, only for the real weather. */
    temperature: number | undefined;
}

/**
 * The weather the map will show at each of `hours` from `epoch`, as the game draws it: the real timeline (blank past
 * its end, nothing before the first answer), the seasonal schedule in Automatic or while the real weather is unavailable
 * (the same fallback as the sky), the fixed weather otherwise. A snow out of season is drawn as rain, as in the sky.
 */
export function weatherForecast(
    settings: MapSnowSettings | undefined,
    epoch: number,
    real: RealForecastState,
    hours: readonly number[] = FORECAST_HOURS,
): ForecastCell[] {
    const weather = settings?.weather ?? WeatherType.Clear;
    const realNow = real.status === "known" ? realWeatherAt(real.slots, epoch) : undefined;
    return hours.map((hour): ForecastCell => {
        const at = epoch + hour * HOUR_MS;
        if (weather === WeatherType.Real && real.status === "pending") {
            return { at, weather: undefined, temperature: undefined };
        }
        if (weather === WeatherType.Real && real.status === "known" && realNow) {
            const then = realWeatherAt(real.slots, at);
            return {
                at,
                weather: then ? weatherAtTime(then.weather, new Date(at)) : undefined,
                temperature: then?.temperature ?? undefined,
            };
        }
        if (weather === WeatherType.Real || weather === WeatherType.Automatic) {
            return { at, weather: autoWeatherAt(new Date(at), settings?.weatherAuto), temperature: undefined };
        }
        return { at, weather: weatherAtTime(weather, new Date(at)), temperature: undefined };
    });
}
