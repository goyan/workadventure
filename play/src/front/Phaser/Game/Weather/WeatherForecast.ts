import { snowShare, WeatherType } from "@workadventure/map-editor";
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
    /** Where that wind comes from (degrees, 0 north, 90 east); absent without a wind speed above 0 km/h. */
    windFrom?: number;
}

/**
 * What a weather is called once the air it falls through is known: a rain of which at least half falls as snow
 * (snowShare) is a snow. Only a name, for the banner: the map has no snow weather, and a storm stays a storm.
 */
export function namedPrecipitation<T extends WeatherType | undefined>(weather: T, snow: number): T | WeatherType.Snow {
    return weather === WeatherType.Rain && snow >= 0.5 ? WeatherType.Snow : weather;
}

function withClouds(cell: ForecastCell, cloudiness: number): ForecastCell {
    return cloudiness > 0 ? { ...cell, cloudiness } : cell;
}

function withWind(cell: ForecastCell, windSpeed: number | undefined, windFrom: number | undefined): ForecastCell {
    if (windSpeed === undefined || !Number.isFinite(windSpeed)) return cell;
    const speed = Math.round(windSpeed);
    // A direction alone, or that of a calm, says nothing: it is only given with a wind.
    return speed > 0 && windFrom !== undefined && Number.isFinite(windFrom)
        ? { ...cell, windSpeed: speed, windFrom }
        : { ...cell, windSpeed: speed };
}

/**
 * The weather the map will show at each of `hours` from `epoch`, as the game draws it: the real timeline (blank past
 * its end, nothing before the first answer), the seasonal schedule in Automatic or while the real weather is unavailable
 * (the same fallback as the sky), the fixed weather otherwise. A rain forecast in air cold enough is named a snow
 * (namedPrecipitation: from the real temperature and humidity of the place at that quarter hour, whatever weather the
 * map shows); a Cloudy map is a clear sky with clouds. The temperature and the wind (speed and direction) are the real ones of the
 * place whenever its timeline is known, even under a weather of the schedule or a fixed one.
 */
export function weatherForecast(
    settings: MapSnowSettings | undefined,
    epoch: number,
    real: RealForecastState,
    hours: readonly number[] = FORECAST_HOURS,
): ForecastCell[] {
    const weather = settings?.weather ?? WeatherType.Clear;
    const realNow = real.status === "known" ? realWeatherAt(real.slots, epoch) : undefined;
    // The air forecast at the place says how a rain will fall, whatever weather the map shows.
    const snowAt = (at: number): number => {
        const then = real.status === "known" ? realWeatherAt(real.slots, at) : undefined;
        return snowShare(then?.temperature ?? Number.NaN, then?.humidity ?? Number.NaN);
    };
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
                weather: then ? namedPrecipitation(weatherAtTime(then.weather, new Date(at)), snowAt(at)) : undefined,
                temperature: then?.temperature ?? undefined,
            };
            return withClouds(cell, then?.cloudiness ?? 0);
        }
        if (weather === WeatherType.Real || weather === WeatherType.Automatic) {
            const date = new Date(at);
            const drawn = namedPrecipitation(
                autoWeatherAt(date, settings?.weatherAuto, settings?.weatherLocation),
                snowAt(at),
            );
            const cell = { at, weather: drawn, temperature };
            return withClouds(cell, cloudinessAt(date, settings?.weatherAuto, settings?.weatherLocation));
        }
        const cell = { at, weather: namedPrecipitation(weatherAtTime(weather, new Date(at)), snowAt(at)), temperature };
        return withClouds(cell, weather === WeatherType.Cloudy ? AUTO_CLOUDINESS : 0);
    };
    return hours.map((hour): ForecastCell => {
        const at = epoch + hour * HOUR_MS;
        const wind = real.status === "known" ? realWeatherAt(real.slots, at) : undefined;
        return withWind(cellAt(at), wind?.windSpeed, wind?.windFrom);
    });
}
