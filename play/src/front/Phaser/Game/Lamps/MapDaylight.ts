import { WeatherType } from "@workadventure/map-editor";
import { sunPositionAt } from "../Night/NightClock";
import { skyWeatherFactor } from "../Night/SkyLight";
import { mapWeatherSettings, shownMapPlace } from "../Weather/RealWeatherClient";
import type { MapSnowSettings } from "../Weather/SnowCover";
import { weatherAtTime } from "../Weather/WeatherFrame";
import { daylightOf } from "./EnergySaving";

/**
 * How much daylight the sky of the map gives at an instant (daylightOf), the same for everyone: the sun of the place
 * of the map and the weather of the map. Not the weather of the city a player follows on their clock (personal), so
 * that the lamps outdoors are in the same state for everyone, whatever the night each one chose.
 */
export function mapDaylightAt(settings: MapSnowSettings | undefined, date: Date): number {
    const shown = mapWeatherSettings(settings, date);
    const weather = weatherAtTime(
        shown?.weather ?? WeatherType.Clear,
        date,
        shown?.weatherAuto,
        shown?.weatherLocation,
    );
    const sun = sunPositionAt(date, shownMapPlace(settings));
    return daylightOf(sun.elevation, skyWeatherFactor(weather, shown?.cloudiness ?? 0));
}
