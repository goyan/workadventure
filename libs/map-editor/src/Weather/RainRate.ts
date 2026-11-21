import { precipitationWeather, WeatherType } from "../types";
import type { WAMSettings } from "../types";
import { realWeatherAt } from "./RealWeather";
import type { RealWeatherSlot } from "./RealWeather";
import { autoWeatherAt } from "./WeatherSchedule";

/**
 * How hard a rain and a storm fall when their rate is not known (a fixed or automatic weather), in mm an hour: what
 * the drawn rain shows for them (rainIntensity in the front: a steady rain, a storm always hard).
 */
export const USUAL_RAIN_RATE = 2;
export const STORM_RAIN_RATE = 10;

function usualRate(weather: WeatherType): number {
    return weather === WeatherType.Rain ? USUAL_RAIN_RATE : weather === WeatherType.Storm ? STORM_RAIN_RATE : 0;
}

/**
 * How hard it rains on a map at an instant, in mm of water an hour (0 in dry weather), whatever falls: rain or, in
 * cold air, snow (liquidRainRate gives the part that runs as water). From its weather settings: the same
 * figure for the back, which fills the hollows of the relief, as what the players see falling. `slots` is the real
 * weather timeline at the place of the map, when known (a map in Real only).
 */
export function rainRateAt(
    settings: Pick<WAMSettings, "weather" | "weatherAuto" | "weatherLocation"> | undefined,
    epoch: number,
    slots: readonly RealWeatherSlot[] | undefined,
): number {
    const configured = precipitationWeather(settings?.weather ?? WeatherType.Clear);
    const date = new Date(epoch);
    switch (configured) {
        case WeatherType.Rain:
        case WeatherType.Storm:
            return usualRate(configured);
        case WeatherType.Automatic:
            return usualRate(autoWeatherAt(date, settings?.weatherAuto, settings?.weatherLocation));
        case WeatherType.Real: {
            const now = slots && Number.isFinite(epoch) ? realWeatherAt(slots, epoch) : undefined;
            // Outside the timeline the map shows its automatic weather.
            if (!now) return usualRate(autoWeatherAt(date, settings?.weatherAuto, settings?.weatherLocation));
            const rate = now.rainRate;
            return rate !== undefined && Number.isFinite(rate) ? Math.max(0, rate) : usualRate(now.weather);
        }
        default:
            return 0;
    }
}
