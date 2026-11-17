import { WeatherType } from "@workadventure/map-editor";
import { realWeatherAt } from "../../../../common/RealWeather";
import type { RealForecastState } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";
import { weatherAtTime } from "./WeatherFrame";
import { AUTO_CLOUDINESS, autoWeatherAt, cloudinessAt } from "./WeatherSchedule";

/** The hours ahead shown by the weather banner: now, in one hour, in four hours. */
export const FORECAST_HOURS: readonly number[] = [0, 1, 4];
const HOUR_MS = 60 * 60 * 1000;

/** The weather of the map at one moment of the banner; undefined when not known (yet). */
export interface ForecastCell {
    at: number;
    weather: WeatherType | undefined;
    /** °C of the place of the map, whatever weather the map shows; undefined until known. */
    temperature: number | undefined;
    /** Clouds of a clear sky, 0 to 1; absent without clouds. */
    cloudiness?: number;
    /** Wind speed (km/h, rounded) of the place of the map, whatever weather the map shows; absent when unknown. */
    windSpeed?: number;
}

function withClouds(cell: ForecastCell, cloudiness: number): ForecastCell {
    return cloudiness > 0 ? { ...cell, cloudiness } : cell;
}

function withWind(cell: ForecastCell, windSpeed: number | undefined): ForecastCell {
    return windSpeed !== undefined && Number.isFinite(windSpeed) ? { ...cell, windSpeed: Math.round(windSpeed) } : cell;
}

/**
 * The weather the map will show at each of `hours` from `epoch`, as the game draws it: the real timeline (blank past
 * its end, nothing before the first answer), the seasonal schedule in Automatic or while the real weather is unavailable
 * (the same fallback as the sky), the fixed weather otherwise. A snow out of season is drawn as rain, as in the sky;
 * a Cloudy map is a clear sky with clouds. The temperature and the wind speed are the real ones of the place whenever its
 * timeline is known, even under a weather of the schedule or a fixed one.
 */
export function weatherForecast(
    settings: MapSnowSettings | undefined,
    epoch: number,
    real: RealForecastState,
    hours: readonly number[] = FORECAST_HOURS,
): ForecastCell[] {
    const weather = settings?.weather ?? WeatherType.Clear;
    const realNow = real.status === "known" ? realWeatherAt(real.slots, epoch) : undefined;
    const cellAt = (at: number): ForecastCell => {
        const temperature =
            real.status === "known" ? (realWeatherAt(real.slots, at)?.temperature ?? undefined) : undefined;
        if (weather === WeatherType.Real && real.status === "pending") {
            return { at, weather: undefined, temperature: undefined };
        }
        if (weather === WeatherType.Real && real.status === "known" && realNow) {
            const then = realWeatherAt(real.slots, at);
            const cell = {
                at,
                weather: then ? weatherAtTime(then.weather, new Date(at)) : undefined,
                temperature: then?.temperature ?? undefined,
            };
            return withClouds(cell, then?.cloudiness ?? 0);
        }
        if (weather === WeatherType.Real || weather === WeatherType.Automatic) {
            const date = new Date(at);
            const cell = { at, weather: autoWeatherAt(date, settings?.weatherAuto), temperature };
            return withClouds(cell, cloudinessAt(date, settings?.weatherAuto));
        }
        const cell = { at, weather: weatherAtTime(weather, new Date(at)), temperature };
        return withClouds(cell, weather === WeatherType.Cloudy ? AUTO_CLOUDINESS : 0);
    };
    return hours.map((hour): ForecastCell => {
        const at = epoch + hour * HOUR_MS;
        const windSpeed = real.status === "known" ? realWeatherAt(real.slots, at)?.windSpeed : undefined;
        return withWind(cellAt(at), windSpeed);
    });
}
