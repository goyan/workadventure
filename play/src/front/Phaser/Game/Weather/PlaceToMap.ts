import { PARIS_LATITUDE, PARIS_LONGITUDE, roundedCoordinate, Weather, WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import type { FireConditionsMessage, SetFireConditionsMessage } from "@workadventure/messages";
import { writable } from "svelte/store";
import type { WorldPlace } from "../Night/WorldDaylight";
import type { RealForecastState } from "./RealWeather";

/**
 * What the button "Apply to the map" of this player's own weather card can do:
 * - ready: the map may follow the place this player follows;
 * - already: the map follows it, in real weather;
 * - noRight: this player may not change the weather of the map;
 * - pending: the weather of the place is being read;
 * - noData: no real weather for it (the map would have none to follow).
 */
export type PlaceToMapState = "ready" | "already" | "noRight" | "pending" | "noData";

/** The weather of the map before a player made it follow their place: what "Back to …" brings back. */
export interface MapWeatherBefore {
    weather: WeatherType;
    location: WeatherLocation | undefined;
}

/** The place the map was made to follow by this player, and what it had before; for this session only. */
export interface AppliedPlace {
    applied: WeatherLocation;
    before: MapWeatherBefore;
}

/** Remembered for the session, so the player who applied a place can bring the map back. */
export const appliedPlaceStore = writable<AppliedPlace | undefined>(undefined);

/** Two places are the same for the weather when they are the same once rounded as the server reads them. */
export function sameWeatherPlace(a: WeatherLocation | undefined, b: WeatherLocation | undefined): boolean {
    const latitude = (place: WeatherLocation | undefined) => roundedCoordinate(place?.latitude ?? PARIS_LATITUDE);
    const longitude = (place: WeatherLocation | undefined) => roundedCoordinate(place?.longitude ?? PARIS_LONGITUDE);
    return latitude(a) === latitude(b) && longitude(a) === longitude(b);
}

/** What the button can do now; the map without a place is in Paris. */
export function placeToMapState(input: {
    canEdit: boolean;
    place: WorldPlace;
    mapPlace: WeatherLocation | undefined;
    mapWeather: WeatherType | undefined;
    data: RealForecastState;
}): PlaceToMapState {
    if (input.mapWeather === WeatherType.Real && sameWeatherPlace(input.place, input.mapPlace)) return "already";
    if (!input.canEdit) return "noRight";
    if (input.data.status === "pending") return "pending";
    if (input.data.status === "unavailable" || input.data.slots.length === 0) return "noData";
    return "ready";
}

/**
 * The place saved in the map, shared by every player: a city by its name, a point far from any city by its
 * coordinates (not by its distance to a city written in one player's language, and never with a comma, which the
 * weather chip cuts a place at).
 */
export function mapLocationOf(place: WorldPlace): WeatherLocation {
    const location: WeatherLocation = {
        name: place.coordinates ?? place.name,
        latitude: place.latitude,
        longitude: place.longitude,
    };
    return place.timezone ? { ...location, timezone: place.timezone } : location;
}

/** What the map follows the place with: its real weather at that place. */
export function followPlaceMessage(place: WorldPlace) {
    return {
        $case: "updateWeatherSettingMessage" as const,
        updateWeatherSettingMessage: {
            weather: Weather.parse(WeatherType.Real),
            location: mapLocationOf(place),
            // The automatic weather is not sent: the map keeps its own, should it go back to it.
            autoInclude: [],
        },
    };
}

/** What brings the map back to its weather and its place of before (the default place when it had none). */
export function revertMessage(before: MapWeatherBefore) {
    return {
        $case: "updateWeatherSettingMessage" as const,
        updateWeatherSettingMessage: {
            weather: Weather.parse(before.weather),
            ...(before.location ? { location: before.location } : { clearLocation: true }),
            autoInclude: [],
        },
    };
}

/** The real conditions again, the thresholds of the room kept: what "Back to the real conditions" sends. */
export function realConditionsMessage(conditions: FireConditionsMessage): SetFireConditionsMessage {
    return { ...conditions, manual: false };
}
