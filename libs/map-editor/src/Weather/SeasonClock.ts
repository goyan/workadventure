import { Season } from "../types";
import type { WeatherLocation } from "../types";

/**
 * Where a map is, for its calendar: its latitude says the hemisphere, its time zone when its day begins. A map without
 * a place is in Paris; a place chosen before it carried a time zone keeps its hemisphere and the day of Paris.
 */
export type SeasonPlace = Pick<WeatherLocation, "latitude" | "timezone">;

/** The calendar of a map without a place. */
export const DEFAULT_CALENDAR_TIME_ZONE = "Europe/Paris";

/** The date and time at the place of a map, read on its own clock. */
export interface PlaceCalendar {
    /** `YYYY-MM-DD`. */
    day: string;
    year: number;
    month: number;
    date: number;
    hour: number;
    minute: number;
}

const calendars = new Map<string, Intl.DateTimeFormat>();

function calendarOf(timeZone: string): Intl.DateTimeFormat | undefined {
    let calendar = calendars.get(timeZone);
    if (!calendar) {
        try {
            calendar = new Intl.DateTimeFormat("en-GB", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            });
        } catch {
            return undefined;
        }
        calendars.set(timeZone, calendar);
    }
    return calendar;
}

/** The time zone the calendar of the place is read in: its own, or Paris without one it knows. */
export function calendarTimeZone(place: SeasonPlace | undefined): string {
    const zone = place?.timezone;
    return zone && calendarOf(zone) ? zone : DEFAULT_CALENDAR_TIME_ZONE;
}

/** The date and time of `date` at the place of the map (Paris without a place). */
export function placeCalendar(date: Date, place?: SeasonPlace): PlaceCalendar {
    const calendar = calendarOf(calendarTimeZone(place)) ?? calendarOf(DEFAULT_CALENDAR_TIME_ZONE);
    const parts: Record<string, string> = {};
    for (const part of calendar?.formatToParts(date) ?? []) parts[part.type] = part.value;
    return {
        day: `${parts.year}-${parts.month}-${parts.day}`,
        year: Number(parts.year),
        month: Number(parts.month),
        date: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    };
}

/** Whether the seasons of the place are those of the south: six months off the north. The equator counts as north. */
export function southernPlace(place: SeasonPlace | undefined): boolean {
    return place !== undefined && place.latitude < 0;
}

/**
 * Meteorological season of a month (1 to 12), the north by default: March to May is spring there, autumn in the
 * south. The tropics get the four seasons by the sign of their latitude too, not a dry and a wet one.
 */
export function seasonOfMonth(month: number, latitude?: number): Season {
    const northern = latitude !== undefined && latitude < 0 ? ((month + 5) % 12) + 1 : month;
    if (northern >= 3 && northern <= 5) return Season.Spring;
    if (northern >= 6 && northern <= 8) return Season.Summer;
    if (northern >= 9 && northern <= 11) return Season.Autumn;
    return Season.Winter;
}

/**
 * Season of the map at `serverDate`: the month at its place, turned over in the southern hemisphere. Shared by the
 * server (the meadow) and every player (trees, snow of the heights, decor) for the same map. Paris without a place.
 */
export function seasonAt(serverDate: Date, place?: SeasonPlace): Season {
    return seasonOfMonth(placeCalendar(serverDate, place).month, place?.latitude);
}

/** The available white winter artwork is snow cover, not a permanent calendar state. */
export function treeSeasonAt(serverDate: Date, coverage: number, place?: SeasonPlace): Season {
    if (coverage > 0) return Season.Winter;
    const season = seasonAt(serverDate, place);
    return season === Season.Winter ? Season.Summer : season;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far into its autumn the map is, from the first day of autumn at its place (just above 0) to the last (1): the
 * leaves under the trees pile up with it. September to November in the north, March to May in the south. Half way
 * out of autumn, where only a personal autumn theme shows them.
 */
export function autumnProgressAt(serverDate: Date, place?: SeasonPlace): number {
    if (!Number.isFinite(serverDate.getTime()) || seasonAt(serverDate, place) !== Season.Autumn) return 0.5;
    const { year, month, date } = placeCalendar(serverDate, place);
    const first = southernPlace(place) ? 3 : 9;
    const start = Date.UTC(year, first - 1, 1);
    const length = (Date.UTC(year, first + 2, 1) - start) / DAY_MS;
    return (Math.round((Date.UTC(year, month - 1, date) - start) / DAY_MS) + 1) / length;
}
