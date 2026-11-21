import { DEFAULT_AUTO_WEATHER, Season, WeatherType } from "../types";
import type { AutoWeatherFrequency, AutoWeatherSettings } from "../types";
import { calendarTimeZone, placeCalendar, seasonOfMonth, southernPlace } from "./SeasonClock";
import type { SeasonPlace } from "./SeasonClock";

/**
 * Weathers the automatic schedule can draw, clear being the remainder. No snow: a precipitation is drawn as a rain,
 * and falls as snow when the air is cold enough (Precipitation.ts). A snow asked for by a map saved before counts for
 * nothing.
 */
type DrawnWeather = WeatherType.Clear | WeatherType.Rain | WeatherType.Storm | WeatherType.Fog;
type BadWeather = Exclude<DrawnWeather, WeatherType.Clear>;

const BAD_WEATHERS: readonly BadWeather[] = [WeatherType.Rain, WeatherType.Storm, WeatherType.Fog];

/**
 * Normal-frequency shares (in %) per season; clear is what remains of 100. The share the snow had when it was a
 * weather (winter 20, spring 2, autumn 5) went to the rain: as many precipitations as before.
 */
export const SEASON_WEIGHTS: Readonly<Record<Season, Readonly<Record<DrawnWeather, number>>>> = {
    [Season.Winter]: { clear: 45, rain: 45, storm: 0, fog: 10 },
    [Season.Spring]: { clear: 55, rain: 32, storm: 8, fog: 5 },
    [Season.Summer]: { clear: 70, rain: 12, storm: 15, fog: 3 },
    [Season.Autumn]: { clear: 45, rain: 35, storm: 5, fog: 15 },
};

/** Multiplier applied to every non-clear weather. */
export const FREQUENCY_FACTORS: Readonly<Record<AutoWeatherFrequency, number>> = {
    calm: 0.5,
    normal: 1,
    stormy: 1.6,
};

/**
 * Normal-frequency share (in %) of the clear slots that carry clouds, per season (game values chosen by the user, not
 * climate statistics). Scaled by the frequency like the other weathers.
 */
export const CLOUD_SHARES: Readonly<Record<Season, number>> = {
    [Season.Winter]: 50,
    [Season.Spring]: 35,
    [Season.Summer]: 20,
    [Season.Autumn]: 40,
};
/** How cloudy a clouded slot of the automatic weather is (0 to 1). */
export const AUTO_CLOUDINESS = 0.5;
/** Clouds come and go over the first three minutes of a slot. */
export const CLOUD_FADE_MS = 3 * 60 * 1000;

/** Probability that a 30-minute slot keeps the weather of the previous one. */
export const PERSISTENCE = 0.6;
/** Fog only exists before this hour at the place of the map (Paris without a place). */
export const FOG_UNTIL_HOUR = 11;
/** Storms only happen in [start, end) hours at the place of the map (Paris without a place). */
export const STORM_HOURS: readonly [number, number] = [13, 21];

const SLOTS_PER_DAY = 48;
const SLOT_MS = 30 * 60 * 1000;
const CACHE_SIZE = 4;

const dayCache = new Map<string, WeatherType[]>();
let computations = 0;

/** Number of day schedules computed so far (cache misses), for tests. */
export function scheduleComputations(): number {
    return computations;
}

/**
 * Real instant at which the current 30-minute slot began. Slots are cut on the clock of the world: at a place whose
 * offset is whole or half hours (Paris, Sydney, Adelaide, India) they begin on the hour and the half hour there too;
 * at a quarter-hour one (Nepal, Chatham) a quarter of an hour off.
 */
export function slotStart(date: Date): Date {
    return new Date(Math.floor(date.getTime() / SLOT_MS) * SLOT_MS);
}

/**
 * Automatic weather at `date`, identical for every client with the same settings and place: the day, its season and
 * the hours of its fog and storms are those of the place of the map (`place`, Paris without one).
 */
export function autoWeatherAt(
    date: Date,
    auto: AutoWeatherSettings = DEFAULT_AUTO_WEATHER,
    place?: SeasonPlace,
): WeatherType {
    const time = date.getTime();
    if (!Number.isFinite(time)) return WeatherType.Clear;
    const settings = normalise(auto);
    // Called several times per frame (current and previous slot): the weather is constant within a slot,
    // so skip the local-time formatting.
    const index = Math.floor(time / SLOT_MS);
    const key = `${index}|${settings.frequency}|${settings.include.join(",")}|${placeKey(place)}`;
    const known = slotMemo.get(key);
    if (known !== undefined) return known;
    slotComputations++;
    const { day, slot } = placeSlot(date, place);
    const weather = daySchedule(day, settings, southernPlace(place))[slot];
    slotMemo.set(key, weather);
    while (slotMemo.size > MEMO_SIZE) {
        const oldest = slotMemo.keys().next().value;
        if (oldest === undefined) break;
        slotMemo.delete(oldest);
    }
    return weather;
}

const MEMO_SIZE = 8;
const slotMemo = new Map<string, WeatherType>();
let slotComputations = 0;

/** Number of slot lookups computed so far (memo misses), for tests. */
export function parisSlotComputations(): number {
    return slotComputations;
}

/**
 * Next weather changes after `date` (at most `count`), looking at the current day of the place and the next one.
 */
export function autoWeatherChanges(
    date: Date,
    auto: AutoWeatherSettings | undefined,
    count: number,
    place?: SeasonPlace,
): { at: Date; weather: WeatherType }[] {
    const changes: { at: Date; weather: WeatherType }[] = [];
    if (!Number.isFinite(date.getTime()) || count <= 0) return changes;
    const settings = auto ?? DEFAULT_AUTO_WEATHER;
    const lastDay = shiftDay(placeSlot(date, place).day, 1);
    let current = autoWeatherAt(date, settings, place);
    for (let t = slotStart(date).getTime() + SLOT_MS; changes.length < count; t += SLOT_MS) {
        const at = new Date(t);
        if (placeSlot(at, place).day > lastDay) break;
        const weather = autoWeatherAt(at, settings, place);
        if (weather !== current) {
            changes.push({ at, weather });
            current = weather;
        }
    }
    return changes;
}

/** The cloudiness from `previous` to `current`, `elapsed` ms into a slot: the change takes CLOUD_FADE_MS. */
export function fadedCloudiness(previous: number, current: number, elapsed: number): number {
    const progress = Math.max(0, Math.min(1, elapsed / CLOUD_FADE_MS));
    return previous + (current - previous) * progress;
}

/**
 * How cloudy the automatic weather is at `date`, 0 to 1, identical for every client with the same settings and place
 * (the season of the place sets how often the clear slots are clouded). Clouds are
 * a chain of their own over the clear slots of the schedule: the schedule itself (rain, storms, fog) is the same
 * with or without them. None when the map turns them off (`clouds: false`).
 */
export function cloudinessAt(
    date: Date,
    auto: AutoWeatherSettings = DEFAULT_AUTO_WEATHER,
    place?: SeasonPlace,
): number {
    const time = date.getTime();
    if (!Number.isFinite(time) || auto.clouds === false) return 0;
    const start = slotStart(date).getTime();
    return fadedCloudiness(
        slotCloudiness(new Date(start - 1), auto, place),
        slotCloudiness(date, auto, place),
        time - start,
    );
}

// Asked several times per image: the clouds are constant within a slot, so skip the local-time formatting.
const cloudSlotMemo = new Map<string, number>();

function slotCloudiness(date: Date, auto: AutoWeatherSettings, place: SeasonPlace | undefined): number {
    if (autoWeatherAt(date, auto, place) !== WeatherType.Clear) return 0;
    const key = `${Math.floor(date.getTime() / SLOT_MS)}|${auto.frequency}|${placeKey(place)}`;
    const known = cloudSlotMemo.get(key);
    if (known !== undefined) return known;
    const { day, slot } = placeSlot(date, place);
    const cloudiness = cloudDay(day, auto.frequency, southernPlace(place))[slot] ? AUTO_CLOUDINESS : 0;
    cloudSlotMemo.set(key, cloudiness);
    while (cloudSlotMemo.size > MEMO_SIZE) {
        const oldest = cloudSlotMemo.keys().next().value;
        if (oldest === undefined) break;
        cloudSlotMemo.delete(oldest);
    }
    return cloudiness;
}

const cloudCache = new Map<string, boolean[]>();

/** Which slots of a day of the place have clouds; like the schedule, the day starts from the end of its eve. */
function cloudDay(day: string, frequency: AutoWeatherFrequency, south: boolean): boolean[] {
    const key = `${day}|${frequency}|${south ? "south" : "north"}`;
    const cached = cloudCache.get(key);
    if (cached) {
        cloudCache.delete(key);
        cloudCache.set(key, cached);
        return cached;
    }
    const eve = computeCloudDay(shiftDay(day, -1), frequency, south, false);
    const clouds = computeCloudDay(day, frequency, south, eve[SLOTS_PER_DAY - 1]);
    cloudCache.set(key, clouds);
    while (cloudCache.size > CACHE_SIZE) {
        const oldest = cloudCache.keys().next().value;
        if (oldest === undefined) break;
        cloudCache.delete(oldest);
    }
    return clouds;
}

function computeCloudDay(day: string, frequency: AutoWeatherFrequency, south: boolean, start: boolean): boolean[] {
    const chance = Math.min(1, (CLOUD_SHARES[seasonOfDay(day, south)] * FREQUENCY_FACTORS[frequency]) / 100);
    // A seed of its own: the clouds never consume the draws of the schedule.
    const random = mulberry32(fnv1a(`${day}|${frequency}|clouds`));
    const clouds: boolean[] = [];
    let previous = start;
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        const keep = random() < PERSISTENCE;
        const drawn = random() < chance;
        previous = keep ? previous : drawn;
        clouds.push(previous);
    }
    return clouds;
}

type Normalised = { frequency: AutoWeatherFrequency; include: BadWeather[] };

/** Keep only drawable bad weathers, without duplicates, in a stable order (seed independent of order). */
function normalise(auto: AutoWeatherSettings): Normalised {
    const include = BAD_WEATHERS.filter((weather) => auto.include.includes(weather)).sort();
    return { frequency: auto.frequency, include };
}

/**
 * The day of the place and the slot of that day `date` falls in, read at the start of its slot (constant within it).
 */
function placeSlot(date: Date, place: SeasonPlace | undefined): { day: string; slot: number } {
    const { day, hour, minute } = placeCalendar(slotStart(date), place);
    return { day, slot: hour * 2 + (minute >= 30 ? 1 : 0) };
}

/** What sets the schedule of a place: its clock and its hemisphere. */
function placeKey(place: SeasonPlace | undefined): string {
    return `${calendarTimeZone(place)}|${southernPlace(place) ? "south" : "north"}`;
}

/** The season of a `YYYY-MM-DD` day of the place, from its month alone. */
function seasonOfDay(day: string, south: boolean): Season {
    return seasonOfMonth(Number(day.slice(5, 7)), south ? -1 : undefined);
}

/** `YYYY-MM-DD` shifted by `days` calendar days. */
function shiftDay(day: string, days: number): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daySchedule(day: string, settings: Normalised, south: boolean): WeatherType[] {
    const key = `${day}|${settings.frequency}|${settings.include.join(",")}|${south ? "south" : "north"}`;
    const cached = dayCache.get(key);
    if (cached) {
        dayCache.delete(key);
        dayCache.set(key, cached);
        return cached;
    }
    // The eve, computed from clear, gives the starting point. Since every slot consumes the same random
    // draws whatever the previous weather, the eve converges to its real schedule long before 23:30.
    const eve = computeDay(shiftDay(day, -1), settings, south, WeatherType.Clear);
    const schedule = computeDay(day, settings, south, eve[SLOTS_PER_DAY - 1]);
    dayCache.set(key, schedule);
    while (dayCache.size > CACHE_SIZE) {
        const oldest = dayCache.keys().next().value;
        if (oldest === undefined) break;
        dayCache.delete(oldest);
    }
    return schedule;
}

function computeDay(day: string, settings: Normalised, south: boolean, start: WeatherType): WeatherType[] {
    computations++;
    // The season of the day of the place, read in its month: the seed stays the day itself.
    const weights = drawWeights(seasonOfDay(day, south), settings);
    const random = mulberry32(fnv1a(`${day}|${settings.frequency}|${settings.include.join(",")}`));
    const schedule: WeatherType[] = [];
    let previous = start;
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        // Always consume both draws so that schedules from different starts converge.
        const keep = random() < PERSISTENCE;
        const drawn = pick(weights, random());
        const candidate = keep ? previous : drawn;
        previous = applyRules(previous, candidate, Math.floor(slot / 2), settings.include);
        schedule.push(previous);
    }
    return schedule;
}

function drawWeights(season: Season, settings: Normalised): [WeatherType, number][] {
    const factor = FREQUENCY_FACTORS[settings.frequency];
    const bad = BAD_WEATHERS.map((weather): [WeatherType, number] => [
        weather,
        settings.include.includes(weather) ? SEASON_WEIGHTS[season][weather] * factor : 0,
    ]);
    const total = bad.reduce((sum, [, weight]) => sum + weight, 0);
    if (total > 100) return bad.map(([weather, weight]) => [weather, (weight * 100) / total]);
    return [[WeatherType.Clear, 100 - total], ...bad];
}

function pick(weights: [WeatherType, number][], value: number): WeatherType {
    let threshold = value * 100;
    for (const [weather, weight] of weights) {
        if (threshold < weight) return weather;
        threshold -= weight;
    }
    return WeatherType.Clear;
}

function applyRules(
    previous: WeatherType,
    candidate: WeatherType,
    hour: number,
    include: readonly BadWeather[],
): WeatherType {
    let weather = candidate;
    // A storm starts only after clear or rain (an ongoing storm may go on).
    if (
        weather === WeatherType.Storm &&
        previous !== WeatherType.Storm &&
        previous !== WeatherType.Clear &&
        previous !== WeatherType.Rain
    ) {
        weather = WeatherType.Rain;
    }
    if (weather === WeatherType.Fog && hour >= FOG_UNTIL_HOUR) weather = WeatherType.Clear;
    if (weather === WeatherType.Storm && (hour < STORM_HOURS[0] || hour >= STORM_HOURS[1])) {
        weather = WeatherType.Rain;
    }
    if (weather !== WeatherType.Clear && !(include as readonly WeatherType[]).includes(weather)) {
        weather = WeatherType.Clear;
    }
    return weather;
}

function fnv1a(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function mulberry32(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
