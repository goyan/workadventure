import { WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings, WeatherLocation } from "@workadventure/map-editor";
import { snowPossibleAt } from "../Nature/SeasonClock";
import { autoWeatherAt, slotStart } from "./WeatherSchedule";

export const WEATHER_PHASE_MS = 30 * 60 * 1000;
export const SNOW_ACCUMULATION_MS = 10 * 60 * 1000;
export const SNOW_MELT_MS = 10 * 60 * 1000;

/** Server epochs keep coverage identical on reconnect and on every client. */
export function snowCoverage(
    configured: WeatherType,
    epoch: number,
    startedAt?: number,
    auto?: AutoWeatherSettings,
    meltFrom?: number,
): number {
    if (!Number.isFinite(epoch)) return 0;
    if (configured === WeatherType.Automatic) {
        // The ground follows the schedule: it builds up during a snowy slot and melts in the next one.
        const date = new Date(epoch);
        const start = slotStart(date).getTime();
        const elapsed = epoch - start;
        const snowing = autoWeatherAt(date, auto) === WeatherType.Snow;
        const wasSnowing = autoWeatherAt(new Date(start - 1), auto) === WeatherType.Snow;
        if (snowing) return wasSnowing ? 1 : Math.min(1, elapsed / SNOW_ACCUMULATION_MS);
        return wasSnowing ? Math.max(0, 1 - elapsed / SNOW_MELT_MS) : 0;
    }
    if (!snowPossibleAt(new Date(epoch))) return 0;
    // A real snow that stopped melts as an automatic one does.
    if (configured !== WeatherType.Snow) {
        return meltFrom === undefined ? 0 : Math.max(0, Math.min(1, 1 - (epoch - meltFrom) / SNOW_MELT_MS));
    }
    // Legacy maps without an episode date keep their snowy ground until their weather is edited.
    return startedAt === undefined ? 1 : Math.max(0, Math.min(1, (epoch - startedAt) / SNOW_ACCUMULATION_MS));
}

/** The map settings the snow cover depends on. */
export interface MapSnowSettings {
    weather?: WeatherType;
    weatherStartedAt?: number;
    weatherAuto?: AutoWeatherSettings;
    /** Place of the map, for its real weather. */
    weatherLocation?: WeatherLocation;
    /** Real weather only (never saved): end of the weather under way, when a fog fades out. */
    weatherEndsAt?: number;
    /** Real weather only (never saved): when the last snow stopped, the ground melting from then. */
    snowMeltFrom?: number;
}

/**
 * How much the map snow covers the ground for this person, 0 to 1. `shown` is false with a chosen theme or the weather
 * hidden (mapSnowShownStore): no map snow then, even while it snows on the map.
 */
export function mapSnowCoverage(
    shown: boolean,
    settings: MapSnowSettings | undefined,
    serverDate: Date | undefined,
): number {
    if (!shown || !serverDate) return 0;
    return snowCoverage(
        settings?.weather ?? WeatherType.Clear,
        serverDate.getTime(),
        settings?.weatherStartedAt,
        settings?.weatherAuto,
        settings?.snowMeltFrom,
    );
}
