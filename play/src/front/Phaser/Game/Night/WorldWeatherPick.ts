import { WeatherType, realWeatherAt, snowShare, weatherFromWmoCode } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import { WORLD_WEATHER_PLACES } from "../../../../common/WorldWeather";
import type { WorldPlaceWeather, WorldWeatherReport } from "../../../../common/WorldWeather";
import type { RealWeatherSlot } from "../../../../common/RealWeather";

/** What a player looks for in the world: a place where it rains, or one where it snows, now. */
export enum WorldFall {
    Rain = "rain",
    Snow = "snow",
}

/** From this share of snow (snowShare) what falls is drawn mostly as flakes: it snows there, else it rains. */
const SNOW_FROM_SHARE = 0.5;

/** A place where it rains or snows now, and how hard (mm of water an hour; 0 when Open-Meteo counts no water yet). */
export interface WorldFallPlace {
    city: WeatherLocation;
    fall: WorldFall;
    rainRate: number;
    isDay: boolean;
}

/**
 * Whether it rains or snows at a place, read as the game draws the weather of a place followed: something falls when
 * its WMO code is a rain, a snow or a storm (weatherFromWmoCode, whatever water Open-Meteo counts for the quarter hour:
 * the game draws a light rain then), and it falls as snow from half of snow by the wet bulb of its air (snowShare),
 * not by the code (a code of snow in a mild air is drawn as rain). Undefined when nothing falls.
 */
export function fallOf(weather: WorldPlaceWeather): WorldFall | undefined {
    if (weather.weatherCode === null) return undefined;
    const kind = weatherFromWmoCode(weather.weatherCode);
    if (kind !== WeatherType.Rain && kind !== WeatherType.Storm) return undefined;
    const share =
        weather.temperature === null || weather.humidity === null
            ? 0
            : snowShare(weather.temperature, weather.humidity);
    return share >= SNOW_FROM_SHARE ? WorldFall.Snow : WorldFall.Rain;
}

/**
 * The places of the list where it falls as asked, in the order they are offered: by day first (the rain and the snow
 * are seen), then the strongest, then by name, so that the order holds from one click to the next.
 */
export function fallingPlaces(report: WorldWeatherReport, fall: WorldFall): WorldFallPlace[] {
    const places: WorldFallPlace[] = [];
    for (const weather of report.places) {
        if (fallOf(weather) !== fall) continue;
        const city = WORLD_WEATHER_PLACES.find((place) => place.name === weather.name);
        if (!city) continue;
        places.push({ city, fall, rainRate: weather.rainRate ?? 0, isDay: weather.isDay });
    }
    return places.sort(
        (a, b) =>
            Number(b.isDay) - Number(a.isDay) || b.rainRate - a.rainRate || a.city.name.localeCompare(b.city.name),
    );
}

/** The place offered at a click: the first, or the one after the place shown when it is among them (a tour). */
export function nextFallPlace(
    places: readonly WorldFallPlace[],
    shown: string | undefined,
): WorldFallPlace | undefined {
    const index = places.findIndex((place) => place.city.name === shown);
    return places[index < 0 ? 0 : (index + 1) % places.length];
}

/** The weather of the world is asked again after this long at the soonest, whatever the clicks (minutes). */
const CLIENT_CACHE_MS = 5 * 60 * 1000;

/** The weather now of the places of the world, asked of the pusher at a click, kept a few minutes. */
export class WorldWeatherClient {
    private known: { report: WorldWeatherReport; at: number } | undefined;
    private pending: Promise<WorldWeatherReport> | undefined;

    public constructor(
        private readonly fetcher: () => Promise<WorldWeatherReport>,
        private readonly now: () => number = Date.now,
    ) {}

    public get(): Promise<WorldWeatherReport> {
        if (this.known && this.now() - this.known.at < CLIENT_CACHE_MS) return Promise.resolve(this.known.report);
        this.pending ??= this.fetcher()
            .then((report) => {
                this.known = { report, at: this.now() };
                return report;
            })
            .finally(() => {
                this.pending = undefined;
            });
        return this.pending;
    }
}

export type WorldFallPick = { status: "picked"; place: WorldFallPlace } | { status: "none" } | { status: "failed" };

/** A place where it falls as asked, the next one after the place shown (`shown`, its name) at another click. */
export async function pickWorldFall(
    fall: WorldFall,
    client: Pick<WorldWeatherClient, "get">,
    shown: string | undefined,
): Promise<WorldFallPick> {
    let report: WorldWeatherReport;
    try {
        report = await client.get();
    } catch {
        return { status: "failed" };
    }
    const place = nextFallPlace(fallingPlaces(report, fall), shown);
    return place ? { status: "picked", place } : { status: "none" };
}

/**
 * Whether what was picked still falls at the place followed, by its weather timeline at `epoch` (the same reading as
 * fallOf, on the quarter hour under way); undefined while the timeline does not cover it.
 */
export function stillFalls(fall: WorldFall, slots: readonly RealWeatherSlot[], epoch: number): boolean | undefined {
    const now = realWeatherAt(slots, epoch);
    if (!now) return undefined;
    if (now.weather !== WeatherType.Rain && now.weather !== WeatherType.Storm) return false;
    const share = now.temperature === null || now.humidity === undefined ? 0 : snowShare(now.temperature, now.humidity);
    return (share >= SNOW_FROM_SHARE ? WorldFall.Snow : WorldFall.Rain) === fall;
}
