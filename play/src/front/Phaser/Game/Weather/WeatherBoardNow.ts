import { WeatherType } from "@workadventure/map-editor";
import type { FireConditionsMessage } from "@workadventure/messages";
import { get } from "svelte/store";
import { fireConditionsStore } from "@wa/front/Stores/FireConditionsStore";
import { roomWaterTimes } from "../Terrain/FastWater";
import type { WorldPlace } from "../Night/WorldDaylight";
import { pointWords } from "../Night/PointWords";
import { chosenWeatherNow } from "./ChosenPlaceWeather";
import { frostAirNow, mapFrostAirNow, timelineAirAt, waterCycleNow } from "./Frost";
import { precipitationAirNow, roomPrecipitationAir } from "./PrecipitationAir";
import {
    mapWeatherSettings,
    shownMapPlace,
    shownPlaceTimeline,
    shownWeatherSettings,
    showsChosenPlaceWeather,
} from "./RealWeatherClient";
import type { MapSnowSettings } from "./SnowCover";
import { mapPlaceNames } from "./MapPlaceName";
import { explainWeather } from "./WeatherExplained";
import type { ShownAir, WeatherBoard } from "./WeatherExplained";
import { weatherAtTime } from "./WeatherFrame";

/** The snow of the ground as the server told it: what the board reads of the meadow of the map. */
export interface ToldGround {
    /** Changes whenever a state is received: 0 until the server told one. */
    version(): number;
    meanSnowCover(): number;
    snowCoverAt(x: number, y: number): number;
}

/** A place without its region and country, as the weather banner names it. */
function townOf(name: string | undefined): string | undefined {
    return name?.split(",")[0]?.trim() || name;
}

/** Whether these weather settings are a precipitation at `date`, as the sky draws it (WeatherManager). */
function fallsUnder(settings: MapSnowSettings | undefined, date: Date): boolean {
    const weather = weatherAtTime(
        settings?.weather ?? WeatherType.Clear,
        date,
        settings?.weatherAuto,
        settings?.weatherLocation,
    );
    return weather === WeatherType.Rain || weather === WeatherType.Storm;
}

/** The air of the map as the top of the board shows it: set by hand in the room, else the real one of its place. */
function mapAirShown(
    settings: MapSnowSettings | undefined,
    conditions: FireConditionsMessage | undefined,
    epoch: number,
): ShownAir {
    if (conditions?.manual) {
        return {
            temperature: conditions.temperature,
            humidity: conditions.humidity,
            windSpeed: conditions.windSpeed,
            byHand: true,
        };
    }
    return {
        ...timelineAirAt(shownPlaceTimeline(settings), epoch),
        byHand: false,
        // A point of the world as a place of the map: its long name, as a player's own point (MapPlaceName).
        place: mapPlaceNames(shownMapPlace(settings), pointWords)?.long,
    };
}

/**
 * The weather board of now (WeatherExplained): each air read by the reader the game draws from, at the game clock.
 * Asked once a second while the board is open, never otherwise.
 */
export function weatherBoardNow(
    settings: MapSnowSettings | undefined,
    date: Date,
    ground: ToldGround | undefined,
    avatar: { x: number; y: number } | undefined,
): WeatherBoard {
    const epoch = date.getTime();
    const conditions = get(fireConditionsStore);
    const chosen = chosenWeatherNow();
    // The place followed: a point far from any city says its coordinates, the nearest city and how far (longName).
    const place: WorldPlace | undefined = chosen.place;
    const placeName = place ? (place.longName ?? townOf(place.name)) : undefined;
    const cycle = waterCycleNow(settings);
    return explainWeather({
        city: placeName,
        drawsOwnWeather: showsChosenPlaceWeather(),
        mapAir: mapAirShown(settings, conditions, epoch),
        ownAir: chosen.place ? { ...timelineAirAt(chosen.state, epoch), byHand: false, place: placeName } : undefined,
        precipitationAir: precipitationAirNow(settings, date),
        roomAir: roomPrecipitationAir(settings, date),
        frostAir: frostAirNow(settings, date),
        mapFrostAir: mapFrostAirNow(settings, date),
        falling: fallsUnder(shownWeatherSettings(settings, date), date),
        mapFalling: fallsUnder(mapWeatherSettings(settings, date), date),
        drawn: { frost: cycle.frost, ice: cycle.ice },
        snow:
            ground && ground.version() > 0
                ? { map: ground.meanSnowCover(), here: avatar ? ground.snowCoverAt(avatar.x, avatar.y) : 0 }
                : undefined,
        roomWind: conditions?.windSpeed,
        snowTimes: roomWaterTimes(settings?.water),
    });
}
