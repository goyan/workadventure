import type { WeatherLocation } from "@workadventure/map-editor";
import { NIGHT_MAX_OPACITY, nightOpacityAt, trueSolarMinutes } from "./NightClock";

/** The moment of the day chosen for the sky of somewhere in the world. */
export enum WorldMoment {
    Morning = "morning",
    Noon = "noon",
    Evening = "evening",
    /** An hour chosen by the player. */
    Custom = "custom",
}

/** The local solar time of each moment, in minutes since midnight. */
export const WORLD_MOMENT_MINUTES: Record<Exclude<WorldMoment, WorldMoment.Custom>, number> = {
    [WorldMoment.Morning]: 9 * 60,
    [WorldMoment.Noon]: 12 * 60 + 30,
    [WorldMoment.Evening]: 18 * 60 + 30,
};

/** A city keeps being the sky shown while its solar time stays this close to the moment (minutes): no hopping. */
const KEEP_CITY_MINUTES = 50;

/**
 * Cities all around the world, a few degrees of longitude apart (an hour of the sun is 15°): whatever the time of the
 * server, one of them is near any moment of the day. Inhabited latitudes, for days and nights of a familiar length.
 */
export const WORLD_CITIES: readonly WeatherLocation[] = [
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
    { name: "Tokyo", latitude: 35.68, longitude: 139.69, timezone: "Asia/Tokyo" },
    { name: "Sydney", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney" },
    { name: "Nouméa", latitude: -22.28, longitude: 166.46, timezone: "Pacific/Noumea" },
    { name: "Auckland", latitude: -36.85, longitude: 174.76, timezone: "Pacific/Auckland" },
];

/**
 * The time of the sun at a longitude, at an instant, in minutes since midnight (noon: the sun at its highest): the true
 * solar time, the one the sun of the game keeps.
 */
export function solarMinutes(date: Date, longitude: number): number {
    return trueSolarMinutes(date, longitude);
}

/**
 * The city where it is now the moment wanted (`minutes`, its solar time): the one whose sun is nearest to it. The city
 * shown before is kept while it stays near enough, so that the sky does not hop from a city to the next.
 */
export function worldCityAt(date: Date, minutes: number, shown?: WeatherLocation): WeatherLocation {
    if (shown && dayGap(solarMinutes(date, shown.longitude), minutes) <= KEEP_CITY_MINUTES) return shown;
    let best = WORLD_CITIES[0];
    let bestGap = Infinity;
    for (const city of WORLD_CITIES) {
        const gap = dayGap(solarMinutes(date, city.longitude), minutes);
        if (gap < bestGap) {
            best = city;
            bestGap = gap;
        }
    }
    return best ?? WORLD_CITIES[0] ?? { name: "Paris", latitude: 48.86, longitude: 2.35 };
}

/** The moment chosen, in minutes since midnight (an hour chosen by the player, or that of a named moment). */
export function worldMomentMinutes(moment: WorldMoment, customMinutes: number): number {
    return moment === WorldMoment.Custom ? wrapDay(customMinutes) : WORLD_MOMENT_MINUTES[moment];
}

/** A point chosen on the map of the world. */
export interface WorldPoint {
    latitude: number;
    longitude: number;
}

/**
 * The place of a point of the world: its own latitude and longitude for the sun, the time zone and the name of the
 * nearest city of the list for the clock and the weather banner, however far it is.
 */
export function placeOfPoint(point: WorldPoint): WeatherLocation {
    let nearest = WORLD_CITIES[0];
    let distance = Infinity;
    for (const city of WORLD_CITIES) {
        const gap =
            (city.latitude - point.latitude) ** 2 +
            (lonGap(city.longitude, point.longitude) * Math.cos((point.latitude * Math.PI) / 180)) ** 2;
        if (gap < distance) {
            nearest = city;
            distance = gap;
        }
    }
    // Named after the nearest city of the list, wherever the point is (its weather is that of the point itself).
    const name = nearest?.name ?? `${Math.round(point.latitude)}°, ${Math.round(point.longitude)}°`;
    return { name, latitude: point.latitude, longitude: point.longitude, timezone: nearest?.timezone };
}

/**
 * How dark the night is over a point of the world at an instant, 0 (day) to 1 (full night): the night veil of the game
 * (nightOpacityAt) seen from that point, so that the map of the world shows the day and the night the game draws there.
 */
export function worldShadeAt(date: Date, latitude: number, longitude: number): number {
    return nightOpacityAt(date, { latitude, longitude }) / NIGHT_MAX_OPACITY;
}

/** Degrees between two longitudes, the short way round. */
function lonGap(a: number, b: number): number {
    const gap = Math.abs(a - b) % 360;
    return Math.min(gap, 360 - gap);
}

/** Minutes between two times of the day, the short way round midnight. */
function dayGap(a: number, b: number): number {
    const gap = Math.abs(wrapDay(a) - wrapDay(b));
    return Math.min(gap, 1440 - gap);
}

function wrapDay(minutes: number): number {
    return ((minutes % 1440) + 1440) % 1440;
}
