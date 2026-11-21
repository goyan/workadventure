import type { WeatherLocation } from "@workadventure/map-editor";
import { NIGHT_MAX_OPACITY, nightOpacityAt, sunPositionAt, trueSolarMinutes } from "./NightClock";

/** The moment of the day chosen for the sky of somewhere in the world. */
export enum WorldMoment {
    Morning = "morning",
    Noon = "noon",
    Evening = "evening",
    /** An hour chosen by the player. */
    Custom = "custom",
}

/**
 * The morning and the evening are told by the height of the sun, not by an hour: 18:30 is the deep night of a winter
 * and the full day of a northern summer. Morning: the sun has risen and climbs, 10° above the horizon; evening: it
 * goes down, 8° above it, before the dusk. At these heights the sun of the game casts its shadows in full (they fade
 * from 6° to 2°, cloudSunlight), at their longest (an object casts one six to seven times its height, cut at the
 * length set for shadows), in a golden light (the sun turns white from 5° to 35°, SkyLight). The evening is a little
 * lower, its light warmer: the last hour of the day.
 */
export const MORNING_SUN_ELEVATION = 10;
export const EVENING_SUN_ELEVATION = 8;
/**
 * A city keeps being the sky of the morning or of the evening while its sun stays this close to the height wanted
 * (degrees) and goes the same way: about 40 minutes to an hour at the latitudes of the list, no hopping. Evening:
 * kept from 14° down to 2°, never after sunset.
 */
const KEEP_ELEVATION_DEGREES = 6;
/**
 * The lowest sun of a morning or an evening (degrees): under it the shadows of the sun are gone (cloudSunlight), the
 * light is that of the dusk. Chosen and kept alike only above it.
 */
const LOWEST_MOMENT_ELEVATION = 2;
/**
 * A morning ends, an evening starts, this long from the solar noon (minutes): a sun near its highest, even low in a
 * winter of the north (7° at noon in Anchorage in November), no longer climbs nor goes down: it is a noon.
 */
const MOMENT_FROM_NOON_MINUTES = 60;
/** A city keeps being the sky of noon while its true solar time stays this close to its noon (minutes). */
const KEEP_NOON_MINUTES = 50;
/** Noon: the sun at its highest, in true solar time. */
const SOLAR_NOON_MINUTES = 12 * 60;
/** An hour chosen keeps its city while the city's solar time stays this close to it (minutes): no hopping. */
const KEEP_CITY_MINUTES = 50;

/**
 * Cities all around the world, a few degrees of longitude apart (an hour of the sun is 15°): whatever the time of the
 * server, one of them is near any moment of the day. Inhabited latitudes, for days and nights of a familiar length.
 * A few cities of the north fill what a longitude alone does not (Unalaska, St. John's, Khabarovsk, Petropavlovsk,
 * Anadyr): the sun of a northern summer climbs through the height of the morning hours before that of a temperate
 * city at the same longitude, the sun of a northern winter goes down through the height of the evening early in the
 * afternoon. Without them, for an hour or two of some days, no city of the list had a low sun the right way (a sun
 * of 45° for a morning of June, of 36° for an evening of November).
 */
export const WORLD_CITIES: readonly WeatherLocation[] = [
    { name: "Unalaska", latitude: 53.89, longitude: -166.53, timezone: "America/Anchorage" },
    { name: "Honolulu", latitude: 21.31, longitude: -157.86, timezone: "Pacific/Honolulu" },
    { name: "Anchorage", latitude: 61.22, longitude: -149.9, timezone: "America/Anchorage" },
    { name: "Vancouver", latitude: 49.28, longitude: -123.12, timezone: "America/Vancouver" },
    { name: "San Francisco", latitude: 37.77, longitude: -122.42, timezone: "America/Los_Angeles" },
    { name: "Denver", latitude: 39.74, longitude: -104.99, timezone: "America/Denver" },
    { name: "Mexico", latitude: 19.43, longitude: -99.13, timezone: "America/Mexico_City" },
    { name: "Chicago", latitude: 41.88, longitude: -87.63, timezone: "America/Chicago" },
    { name: "Bogotá", latitude: 4.71, longitude: -74.07, timezone: "America/Bogota" },
    { name: "New York", latitude: 40.71, longitude: -74.01, timezone: "America/New_York" },
    { name: "Montréal", latitude: 45.5, longitude: -73.57, timezone: "America/Toronto" },
    { name: "Santiago", latitude: -33.45, longitude: -70.67, timezone: "America/Santiago" },
    { name: "Buenos Aires", latitude: -34.6, longitude: -58.38, timezone: "America/Argentina/Buenos_Aires" },
    { name: "St. John's", latitude: 47.56, longitude: -52.71, timezone: "America/St_Johns" },
    { name: "Rio de Janeiro", latitude: -22.91, longitude: -43.17, timezone: "America/Sao_Paulo" },
    { name: "Praia", latitude: 14.93, longitude: -23.51, timezone: "Atlantic/Cape_Verde" },
    { name: "Reykjavik", latitude: 64.15, longitude: -21.94, timezone: "Atlantic/Reykjavik" },
    { name: "Dakar", latitude: 14.72, longitude: -17.47, timezone: "Africa/Dakar" },
    { name: "Lisbonne", latitude: 38.72, longitude: -9.14, timezone: "Europe/Lisbon" },
    { name: "Casablanca", latitude: 33.57, longitude: -7.59, timezone: "Africa/Casablanca" },
    { name: "Paris", latitude: 48.86, longitude: 2.35, timezone: "Europe/Paris" },
    { name: "Rome", latitude: 41.9, longitude: 12.5, timezone: "Europe/Rome" },
    { name: "Le Cap", latitude: -33.92, longitude: 18.42, timezone: "Africa/Johannesburg" },
    { name: "Athènes", latitude: 37.98, longitude: 23.73, timezone: "Europe/Athens" },
    { name: "Le Caire", latitude: 30.04, longitude: 31.24, timezone: "Africa/Cairo" },
    { name: "Nairobi", latitude: -1.29, longitude: 36.82, timezone: "Africa/Nairobi" },
    { name: "Moscou", latitude: 55.76, longitude: 37.62, timezone: "Europe/Moscow" },
    { name: "Dubaï", latitude: 25.2, longitude: 55.27, timezone: "Asia/Dubai" },
    { name: "Karachi", latitude: 24.86, longitude: 67.0, timezone: "Asia/Karachi" },
    { name: "Bombay", latitude: 19.08, longitude: 72.88, timezone: "Asia/Kolkata" },
    { name: "Katmandou", latitude: 27.72, longitude: 85.32, timezone: "Asia/Kathmandu" },
    { name: "Bangkok", latitude: 13.76, longitude: 100.5, timezone: "Asia/Bangkok" },
    { name: "Hong Kong", latitude: 22.32, longitude: 114.17, timezone: "Asia/Hong_Kong" },
    { name: "Perth", latitude: -31.95, longitude: 115.86, timezone: "Australia/Perth" },
    { name: "Séoul", latitude: 37.57, longitude: 126.98, timezone: "Asia/Seoul" },
    { name: "Khabarovsk", latitude: 48.48, longitude: 135.08, timezone: "Asia/Vladivostok" },
    { name: "Tokyo", latitude: 35.68, longitude: 139.69, timezone: "Asia/Tokyo" },
    { name: "Sydney", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney" },
    { name: "Petropavlovsk-Kamtchatski", latitude: 53.02, longitude: 158.65, timezone: "Asia/Kamchatka" },
    { name: "Nouméa", latitude: -22.28, longitude: 166.46, timezone: "Pacific/Noumea" },
    { name: "Auckland", latitude: -36.85, longitude: 174.76, timezone: "Pacific/Auckland" },
    { name: "Anadyr", latitude: 64.73, longitude: 177.52, timezone: "Asia/Anadyr" },
];

/**
 * The time of the sun at a longitude, at an instant, in minutes since midnight (noon: the sun at its highest): the true
 * solar time, the one the sun of the game keeps.
 */
export function solarMinutes(date: Date, longitude: number): number {
    return trueSolarMinutes(date, longitude);
}

/**
 * The city where it is now an hour chosen (`minutes`, its true solar time): the one whose sun is nearest to it. The city
 * shown before is kept while it stays near enough, so that the sky does not hop from a city to the next.
 */
export function worldCityAt(date: Date, minutes: number, shown?: WeatherLocation): WeatherLocation {
    if (shown && dayGap(solarMinutes(date, shown.longitude), minutes) <= KEEP_CITY_MINUTES) return shown;
    return nearestCity((city) => dayGap(solarMinutes(date, city.longitude), minutes));
}

/**
 * The city whose sky is shown for the moment chosen: for an hour chosen by the player, the city where it is that solar
 * time (worldCityAt); for noon, the city nearest to its true solar noon; for the morning and the evening, the city
 * whose sun stands nearest to the height of that moment (MORNING_SUN_ELEVATION, EVENING_SUN_ELEVATION) among those
 * where it stands above LOWEST_MOMENT_ELEVATION and climbs (an hour or more before its solar noon) or goes down (an
 * hour or more after it). When no
 * city of the list is in that phase (not met with the cities of the list), the nearest in height among those whose sun
 * goes the right way, then among all. The city shown before is kept while it stays near enough, so that the sky does not hop.
 */
export function worldCityOf(
    date: Date,
    moment: WorldMoment,
    customMinutes: number,
    shown?: WeatherLocation,
): WeatherLocation {
    if (moment === WorldMoment.Custom) return worldCityAt(date, wrapDay(customMinutes), shown);
    if (moment === WorldMoment.Noon) {
        if (shown && dayGap(solarMinutes(date, shown.longitude), SOLAR_NOON_MINUTES) <= KEEP_NOON_MINUTES) {
            return shown;
        }
        return nearestCity((city) => dayGap(solarMinutes(date, city.longitude), SOLAR_NOON_MINUTES));
    }
    const morning = moment === WorldMoment.Morning;
    const target = morning ? MORNING_SUN_ELEVATION : EVENING_SUN_ELEVATION;
    /** How far the sun of a city is from the height wanted, in degrees, whether it goes the right way, and is up. */
    const sunOf = (city: WeatherLocation): { gap: number; climbsRightWay: boolean; inPhase: boolean } => {
        const elevation = sunPositionAt(date, city).elevation;
        const fromNoon = solarMinutes(date, city.longitude) - SOLAR_NOON_MINUTES;
        const climbsRightWay = morning ? fromNoon <= -MOMENT_FROM_NOON_MINUTES : fromNoon >= MOMENT_FROM_NOON_MINUTES;
        return {
            gap: Math.abs(elevation - target),
            climbsRightWay,
            inPhase: climbsRightWay && elevation > LOWEST_MOMENT_ELEVATION,
        };
    };
    if (shown) {
        const sun = sunOf(shown);
        if (sun.inPhase && sun.gap <= KEEP_ELEVATION_DEGREES) return shown;
    }
    // The nearest in height among the cities in the phase of the moment; failing any, among those whose sun goes the
    // right way, whatever its height (a morning stays a morning); failing any, the nearest in height.
    const suns = WORLD_CITIES.map((city) => ({ city, sun: sunOf(city) }));
    const choices = [suns.filter(({ sun }) => sun.inPhase), suns.filter(({ sun }) => sun.climbsRightWay), suns].find(
        (cities) => cities.length > 0,
    );
    const allowed = new Set(choices?.map(({ city }) => city));
    const gaps = new Map(suns.map(({ city, sun }) => [city, sun.gap]));
    return nearestCity((city) => (allowed.has(city) ? (gaps.get(city) ?? Infinity) : Infinity));
}

/** The city of the list for which `gap` is the smallest. */
function nearestCity(gap: (city: WeatherLocation) => number): WeatherLocation {
    let best = WORLD_CITIES[0];
    let bestGap = Infinity;
    for (const city of WORLD_CITIES) {
        const cityGap = gap(city);
        if (cityGap < bestGap) {
            best = city;
            bestGap = cityGap;
        }
    }
    return best ?? WORLD_CITIES[0] ?? { name: "Paris", latitude: 48.86, longitude: 2.35 };
}

/** A point chosen on the map of the world. */
export interface WorldPoint {
    latitude: number;
    longitude: number;
}

/**
 * A point is named after the nearest city of the list only this close to it (km): a few suburbs away. Farther, a
 * town of the list would name the middle of an ocean or the ice of Antarctica, often the very place of the map (two
 * "Auckland" at 14 °C and −34 °C); the point then says its own coordinates.
 */
export const NAMED_POINT_RADIUS_KM = 150;
/**
 * Up to this far from the nearest city of the list (km), a point keeps the time zone of that city: the civil hour of
 * its region, summer time included. Farther (an ocean, the poles), the zone of its longitude (Etc/GMT±N, an hour every
 * 15°): the nearest city may be hours away.
 */
export const CITY_TIME_ZONE_RADIUS_KM = 1000;
/** The mean radius of the Earth (km). */
const EARTH_RADIUS_KM = 6371;

/** The place of a point of the world: its name for a short line (clock, chip) and, when it differs, a longer one. */
export interface WorldPlace extends WeatherLocation {
    /** The name where there is room for more (weather card, sky menu, weather board); absent: `name`. */
    longName?: string;
}

/** The words a point far from any city is named with, in the language of the player. */
export interface PointWords {
    north: string;
    south: string;
    east: string;
    west: string;
    /** The point and the city it is told against, the distance written: "72° S 170° E · Auckland à 4 000 km". */
    far: (point: string, city: string, distance: string) => string;
    /** The short name: the city it is told against and how far, "Auckland 4 000 km" (chip, clock). */
    short: (city: string, distance: string) => string;
    /** A number of kilometres written for the player ("4 000"). */
    kilometres: (km: number) => string;
}

/**
 * The most characters of a city in the short name of a point: the chip and the clock share one line with the floors.
 * "Rio de Janeiro" is kept whole, "Petropavlovsk-Kamtchatski" becomes "Petropavlovsk…".
 */
export const SHORT_CITY_NAME_LENGTH = 14;

/** A city name for the short name of a point: cut with an ellipsis past SHORT_CITY_NAME_LENGTH characters. */
export function shortCityName(name: string): string {
    const characters = Array.from(name);
    if (characters.length <= SHORT_CITY_NAME_LENGTH) return name;
    return `${characters
        .slice(0, SHORT_CITY_NAME_LENGTH - 1)
        .join("")
        .trimEnd()}…`;
}

/** The nearest city of the list to a point, the great-circle way, and how far it is (km). */
export function nearestCityOf(point: WorldPoint): { city: WeatherLocation; distanceKm: number } {
    let city: WeatherLocation = WORLD_CITIES[0] ?? { name: "Paris", latitude: 48.86, longitude: 2.35 };
    let distanceKm = Infinity;
    for (const candidate of WORLD_CITIES) {
        const distance = greatCircleKm(candidate, point);
        if (distance < distanceKm) {
            city = candidate;
            distanceKm = distance;
        }
    }
    return { city, distanceKm };
}

/**
 * A point written in whole degrees, its hemispheres after them: "72° S 170° E". The hemisphere is that of the rounded
 * value: no "0° N", no "180° E".
 */
export function pointCoordinates(point: WorldPoint, words: PointWords): string {
    const latitude = Math.round(point.latitude);
    const longitude = Math.round(wrapLongitude(point.longitude));
    const ns = latitude > 0 ? ` ${words.north}` : latitude < 0 ? ` ${words.south}` : "";
    const ew =
        longitude > 0 && longitude < 180 ? ` ${words.east}` : longitude < 0 && longitude > -180 ? ` ${words.west}` : "";
    return `${Math.abs(latitude)}°${ns} ${Math.abs(longitude)}°${ew}`;
}

/** A distance rounded for reading: to 10 km under 1 000 km, to 100 km beyond. */
export function roundedDistanceKm(km: number): number {
    const step = km < 1000 ? 10 : 100;
    return Math.max(step, Math.round(km / step) * step);
}

/**
 * The time zone of a point: that of the nearest city of the list within CITY_TIME_ZONE_RADIUS_KM, else the zone of
 * its longitude. Etc/GMT counts the other way round: Etc/GMT-11 is UTC+11.
 */
export function pointTimeZone(
    point: WorldPoint,
    nearest: { city: WeatherLocation; distanceKm: number },
): string | undefined {
    if (nearest.distanceKm <= CITY_TIME_ZONE_RADIUS_KM) return nearest.city.timezone;
    const hours = Math.max(-12, Math.min(12, Math.round(wrapLongitude(point.longitude) / 15)));
    return hours === 0 ? "Etc/GMT" : `Etc/GMT${hours > 0 ? "-" : "+"}${Math.abs(hours)}`;
}

/**
 * The place of a point of the world: its own latitude and longitude for the sun and the weather. Within
 * NAMED_POINT_RADIUS_KM of a city of the list it is named after it; farther its short name is the nearest city and
 * how far ("Auckland 4 000 km"), its long name adds its coordinates ("72° S 170° E · Auckland à 4 000 km"). Its time zone: pointTimeZone.
 */
export function placeOfPoint(point: WorldPoint, words: PointWords): WorldPlace {
    const nearest = nearestCityOf(point);
    const timezone = pointTimeZone(point, nearest);
    if (nearest.distanceKm <= NAMED_POINT_RADIUS_KM) {
        return { name: nearest.city.name, latitude: point.latitude, longitude: point.longitude, timezone };
    }
    const coordinates = pointCoordinates(point, words);
    const distance = words.kilometres(roundedDistanceKm(nearest.distanceKm));
    return {
        // The city speaks to the player more than coordinates; its distance tells it is not the city itself.
        name: words.short(shortCityName(nearest.city.name), distance),
        longName: words.far(coordinates, nearest.city.name, distance),
        latitude: point.latitude,
        longitude: point.longitude,
        timezone,
    };
}

/**
 * How dark the night is over a point of the world at an instant, 0 (day) to 1 (full night): the night veil of the game
 * (nightOpacityAt) seen from that point, so that the map of the world shows the day and the night the game draws there.
 */
export function worldShadeAt(date: Date, latitude: number, longitude: number): number {
    return nightOpacityAt(date, { latitude, longitude }) / NIGHT_MAX_OPACITY;
}

/** Kilometres between two points of the Earth, the great-circle way (haversine). */
function greatCircleKm(a: WorldPoint, b: WorldPoint): number {
    const radians = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * radians;
    const dLon = (b.longitude - a.longitude) * radians;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A longitude brought within −180° to 180°. */
function wrapLongitude(longitude: number): number {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** Minutes between two times of the day, the short way round midnight. */
function dayGap(a: number, b: number): number {
    const gap = Math.abs(wrapDay(a) - wrapDay(b));
    return Math.min(gap, 1440 - gap);
}

function wrapDay(minutes: number): number {
    return ((minutes % 1440) + 1440) % 1440;
}
