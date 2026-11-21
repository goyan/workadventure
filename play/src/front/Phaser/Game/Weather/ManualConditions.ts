import { snowShareOf, WeatherType } from "@workadventure/map-editor";
import type { FireConditionsMessage } from "@workadventure/messages";
import { namedPrecipitation } from "./WeatherForecast";
import type { ForecastCell } from "./WeatherForecast";

/**
 * The weather the scene shows, with the wind set by hand in the room when there is one: the clouds, the trees and the
 * flames then all go by that one wind. Untouched while the conditions of the room are the real ones.
 */
export function withManualWind<T extends { windFrom?: number; windSpeed?: number }>(
    settings: T | undefined,
    conditions: FireConditionsMessage | undefined,
): T | { windFrom: number; windSpeed: number } | undefined {
    if (!conditions?.manual) return settings;
    return { ...settings, windFrom: conditions.windFrom, windSpeed: conditions.windSpeed };
}

/**
 * The weather of now as the banner shows it: with the heat and the wind set by hand in the room when they are, and
 * the humidity of the air the room goes by (undefined until the server told it). With conditions set by hand, a rain
 * is named a snow when they make it fall as snow, whatever the forecast said: what the sky then draws
 * (precipitationAirNow).
 */
export function nowCellWithConditions(
    cell: ForecastCell,
    conditions: FireConditionsMessage | undefined,
): { cell: ForecastCell; humidity: number | undefined; manual: boolean } {
    if (!conditions) return { cell, humidity: undefined, manual: false };
    if (!conditions.manual) return { cell, humidity: conditions.humidity, manual: false };
    const weather = namedPrecipitation(unnamed(cell.weather), snowShareOf(conditions));
    const speed = Math.round(conditions.windSpeed);
    const shown: ForecastCell = { ...cell, weather, temperature: conditions.temperature, windSpeed: speed };
    // A direction only with a wind, as for the real one.
    if (speed > 0) shown.windFrom = conditions.windFrom;
    else delete shown.windFrom;
    return {
        cell: shown,
        humidity: conditions.humidity,
        manual: true,
    };
}

/** The weather of a cell without the name its forecast gave its precipitation: the conditions of the room name it. */
function unnamed(weather: WeatherType | undefined): WeatherType | undefined {
    return weather === WeatherType.Snow ? WeatherType.Rain : weather;
}
