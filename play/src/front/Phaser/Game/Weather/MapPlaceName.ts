import type { WeatherLocation } from "@workadventure/map-editor";
import { placeOfPoint } from "../Night/WorldDaylight";
import type { PointWords } from "../Night/WorldDaylight";

/**
 * The name a point of the world is saved with as the place of the map: its coordinates in whole degrees, as
 * pointCoordinates writes them ("24° N 122° E", "0° 180°"). No town found by the search is named so.
 */
const POINT_NAME = /^\d{1,2}°(?: \S{1,3})? \d{1,3}°(?: \S{1,3})?$/u;

export function isPointName(name: string): boolean {
    return POINT_NAME.test(name.trim());
}

/**
 * How the place of the map is named, short (the weather chip) and long (the cards, the weather board, the settings):
 * a town without its region and country; a point of the world as the place a player follows on their clock is
 * ("Hong Kong 770 km", "24° N 122° E · Hong Kong à 770 km"), in the language of the reader (`words`, asked only for
 * a point). Undefined: no place (Paris by default).
 */
export function mapPlaceNames(
    place: WeatherLocation | undefined,
    words: () => PointWords,
): { short: string; long: string; where?: string } | undefined {
    if (!place) return undefined;
    if (isPointName(place.name)) {
        const point = placeOfPoint({ latitude: place.latitude, longitude: place.longitude }, words());
        return {
            short: point.name,
            long: point.longName ?? point.name,
            ...(point.where ? { where: point.where } : {}),
        };
    }
    // "Nice, Provence-Alpes-Côte d'Azur, France", as the search names a town: the town, then where it is. A place
    // saved before the search named its region and country has no "where": nothing is made up.
    const [first, ...rest] = place.name.split(",");
    const town = first?.trim() || place.name;
    const where = rest
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
    return { short: town, long: town, ...(where ? { where } : {}) };
}
