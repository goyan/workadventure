import { get } from "svelte/store";
import { WeatherType } from "@workadventure/map-editor";
import { LL } from "../../../../i18n/i18n-svelte";
import { fireConditionsStore } from "../../../Stores/FireConditionsStore";
import { gameManager } from "../GameManager";
import { chosenPlaceForecast, chosenPlaceStore, chosenWeatherNow } from "../Weather/ChosenPlaceWeather";
import { nowCellWithConditions } from "../Weather/ManualConditions";
import { mapPlaceNames } from "../Weather/MapPlaceName";
import { pointWords } from "../Night/PointWords";
import { shownMapPlace, shownWeatherForecast, showsChosenPlaceWeather } from "../Weather/RealWeatherClient";

/**
 * What the dashboard of the water says of the rain it counts: the rain of the map (the air of the server), the only
 * one that brings water, and the rain a player sees on their screen from their own city, which brings none.
 */
export interface DashboardRain {
    /** The town the weather of the map follows; absent for a weather chosen as a tile. */
    place?: string;
    /** The conditions of the room are set by hand (their air decides rain or snow). */
    manual: boolean;
    /** It snows on the map now: the snow lies, only the share of rain is counted. */
    mapSnows: boolean;
    /** What falls on this player's screen from the city they follow; absent when nothing falls there. */
    own?: { city: string; snow: boolean };
}

/** Whether a weather of a forecast is a precipitation, and which one. */
function fallOf(weather: WeatherType | undefined): "rain" | "snow" | undefined {
    if (weather === WeatherType.Snow) return "snow";
    return weather === WeatherType.Rain || weather === WeatherType.Storm ? "rain" : undefined;
}

/**
 * What the dashboard says, from the weather of the map now (`real`: it follows `city`; `now`: its weather named
 * once the air is known) and from what falls in the city the player follows on their clock (`own`), if any.
 */
export function dashboardRain(
    map: { real: boolean; city: string | undefined; now: WeatherType | undefined; manual: boolean },
    own: { city: string; now: WeatherType | undefined } | undefined,
): DashboardRain {
    const fall = fallOf(own?.now);
    return {
        ...(map.real && map.city ? { place: map.city } : {}),
        manual: map.manual,
        mapSnows: fallOf(map.now) === "snow",
        ...(own && fall ? { own: { city: own.city, snow: fall === "snow" } } : {}),
    };
}

/**
 * The rain of the dashboard at `date`, read as the weather chip reads it (WeatherForecastBanner): the town of the map
 * (Paris by default), its weather now with the conditions of the room, and the city the player follows.
 */
export function readDashboardRain(date: Date): DashboardRain {
    const settings = gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings;
    const conditions = get(fireConditionsStore);
    const forecast = shownWeatherForecast(settings, date);
    const now = forecast[0] ? nowCellWithConditions(forecast[0], conditions).cell.weather : undefined;
    const city =
        mapPlaceNames(shownMapPlace(settings), pointWords)?.long ?? get(LL).actionbar.weatherBanner.defaultCity();
    // The city followed and its weather as last known, as the chip shows them (pending while another place is asked).
    const place = get(chosenPlaceStore);
    const known = chosenWeatherNow();
    const same = known.place?.latitude === place?.latitude && known.place?.longitude === place?.longitude;
    const own =
        place && showsChosenPlaceWeather()
            ? {
                  // Its long name where it has one: a point far from any city tells the city and how far.
                  city: place.longName ?? (place.name.split(",")[0]?.trim() || place.name),
                  now: same ? chosenPlaceForecast(place, known.state, date)[0]?.weather : undefined,
              }
            : undefined;
    return dashboardRain(
        { real: settings?.weather === WeatherType.Real, city, now, manual: conditions?.manual === true },
        own,
    );
}
