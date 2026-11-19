import type { FireConditionsMessage } from "@workadventure/messages";
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
 * the humidity of the air the room goes by (undefined until the server told it).
 */
export function nowCellWithConditions(
    cell: ForecastCell,
    conditions: FireConditionsMessage | undefined,
): { cell: ForecastCell; humidity: number | undefined; manual: boolean } {
    if (!conditions) return { cell, humidity: undefined, manual: false };
    if (!conditions.manual) return { cell, humidity: conditions.humidity, manual: false };
    const speed = Math.round(conditions.windSpeed);
    const shown: ForecastCell = { ...cell, temperature: conditions.temperature, windSpeed: speed };
    // A direction only with a wind, as for the real one.
    if (speed > 0) shown.windFrom = conditions.windFrom;
    else delete shown.windFrom;
    return {
        cell: shown,
        humidity: conditions.humidity,
        manual: true,
    };
}
