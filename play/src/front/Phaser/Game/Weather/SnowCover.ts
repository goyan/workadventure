import { WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings, LastSnow, WeatherLocation } from "@workadventure/map-editor";
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
    lastSnow?: LastSnow,
): number {
    if (!Number.isFinite(epoch)) return 0;
    const leftover = lastSnowLeft(lastSnow, epoch);
    if (configured === WeatherType.Automatic) {
        // The ground follows the schedule: it builds up during a snowy slot and melts in the next one.
        const date = new Date(epoch);
        const start = slotStart(date).getTime();
        const elapsed = epoch - start;
        const snowing = autoWeatherAt(date, auto) === WeatherType.Snow;
        const wasSnowing = autoWeatherAt(new Date(start - 1), auto) === WeatherType.Snow;
        if (snowing) return wasSnowing ? 1 : Math.min(1, Math.max(leftover, elapsed / SNOW_ACCUMULATION_MS));
        return Math.max(leftover, wasSnowing ? Math.max(0, 1 - elapsed / SNOW_MELT_MS) : 0);
    }
    if (!snowPossibleAt(new Date(epoch))) return 0;
    // A real snow that stopped melts as an automatic one does.
    if (configured !== WeatherType.Snow) {
        const realMelt = meltFrom === undefined ? 0 : Math.max(0, Math.min(1, 1 - (epoch - meltFrom) / SNOW_MELT_MS));
        return Math.max(realMelt, leftover);
    }
    // Legacy maps without an episode date keep their snowy ground until their weather is edited.
    if (startedAt === undefined) return 1;
    // A snow that comes back while the last one melts builds up on what is left of it.
    const left = lastSnowLeft(lastSnow, startedAt);
    return Math.max(0, Math.min(1, left + (epoch - startedAt) / SNOW_ACCUMULATION_MS));
}

/**
 * What is left at `epoch` of the last snow of the map (0 to 1): the ground it covered when it stopped, melting from
 * then at the pace of an automatic thaw.
 */
export function lastSnowLeft(lastSnow: LastSnow | undefined, epoch: number): number {
    if (!lastSnow || !Number.isFinite(epoch)) return 0;
    const held =
        lastSnow.startedAt === undefined
            ? 1
            : Math.max(0, Math.min(1, (lastSnow.endedAt - lastSnow.startedAt) / SNOW_ACCUMULATION_MS));
    return Math.max(0, Math.min(held, held - (epoch - lastSnow.endedAt) / SNOW_MELT_MS));
}

/** The map settings the snow cover depends on. */
export interface MapSnowSettings {
    weather?: WeatherType;
    weatherStartedAt?: number;
    /** The last snow of a fixed weather, melting once another weather took its place. */
    lastSnow?: LastSnow;
    weatherAuto?: AutoWeatherSettings;
    /** Place of the map, for its real weather. */
    weatherLocation?: WeatherLocation;
    /** Real weather only (never saved): end of the weather under way, when a fog fades out. */
    weatherEndsAt?: number;
    /** Real weather only (never saved): when the last snow stopped, the ground melting from then. */
    snowMeltFrom?: number;
    /** Shown weather only (never saved): clouds of a clear sky, 0 to 1 (shownWeatherSettings). */
    cloudiness?: number;
    /** Real weather only (never saved): cloud cover of a rain or a storm, 0 to 1. */
    cloudCover?: number;
    /** Real weather only (never saved): where the wind comes from (degrees, 0 north), which moves the clouds. */
    windFrom?: number;
    /** Real weather only (never saved): wind speed (km/h), which sets how fast the clouds go. */
    windSpeed?: number;
    /** Real weather only (never saved): since when it has been raining, rain and storm together. */
    rainSince?: number;
    /** Real weather only (never saved): when the last rain stopped, the puddles drying from then. */
    rainDryFrom?: number;
    /** Real weather only (never saved): how hard it rains, mm an hour (rainIntensity). */
    rainRate?: number;
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
        settings?.lastSnow,
    );
}
