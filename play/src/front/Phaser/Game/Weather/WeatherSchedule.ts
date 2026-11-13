import { DEFAULT_AUTO_WEATHER, Season, WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherFrequency, AutoWeatherSettings } from "@workadventure/map-editor";
import { seasonAt, snowPossibleAt } from "../Nature/SeasonClock";

/** Weathers the automatic schedule can draw, clear being the remainder. */
type DrawnWeather = WeatherType.Clear | WeatherType.Rain | WeatherType.Storm | WeatherType.Snow | WeatherType.Fog;
type BadWeather = Exclude<DrawnWeather, WeatherType.Clear>;

const BAD_WEATHERS: readonly BadWeather[] = [WeatherType.Rain, WeatherType.Storm, WeatherType.Snow, WeatherType.Fog];

/** Normal-frequency shares (in %) per season; clear is what remains of 100. */
export const SEASON_WEIGHTS: Readonly<Record<Season, Readonly<Record<DrawnWeather, number>>>> = {
    [Season.Winter]: { clear: 45, rain: 25, storm: 0, snow: 20, fog: 10 },
    [Season.Spring]: { clear: 55, rain: 30, storm: 8, snow: 2, fog: 5 },
    [Season.Summer]: { clear: 70, rain: 12, storm: 15, snow: 0, fog: 3 },
    [Season.Autumn]: { clear: 45, rain: 30, storm: 5, snow: 5, fog: 15 },
};

/** Multiplier applied to every non-clear weather. */
export const FREQUENCY_FACTORS: Readonly<Record<AutoWeatherFrequency, number>> = {
    calm: 0.5,
    normal: 1,
    stormy: 1.6,
};

/** Probability that a 30-minute slot keeps the weather of the previous one. */
export const PERSISTENCE = 0.6;
/** Fog only exists before this Paris hour. */
export const FOG_UNTIL_HOUR = 11;
/** Storms only happen in [start, end) Paris hours. */
export const STORM_HOURS: readonly [number, number] = [13, 21];

const SLOTS_PER_DAY = 48;
const SLOT_MS = 30 * 60 * 1000;
const CACHE_SIZE = 4;

const parisFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

const dayCache = new Map<string, WeatherType[]>();
let computations = 0;

/** Number of day schedules computed so far (cache misses), for tests. */
export function scheduleComputations(): number {
    return computations;
}

/** Real instant at which the current 30-minute Paris slot began (Paris offsets are whole hours). */
export function slotStart(date: Date): Date {
    return new Date(Math.floor(date.getTime() / SLOT_MS) * SLOT_MS);
}

/** Automatic weather at `date`, identical for every client with the same settings. */
export function autoWeatherAt(date: Date, auto: AutoWeatherSettings = DEFAULT_AUTO_WEATHER): WeatherType {
    const time = date.getTime();
    if (!Number.isFinite(time)) return WeatherType.Clear;
    const settings = normalise(auto);
    // Called several times per frame (current and previous slot): the weather is constant within a slot,
    // so skip the Paris-time formatting.
    const index = Math.floor(time / SLOT_MS);
    const key = `${index}|${settings.frequency}|${settings.include.join(",")}`;
    const known = slotMemo.get(key);
    if (known !== undefined) return known;
    slotComputations++;
    const { day, slot } = parisSlot(date);
    const weather = daySchedule(day, settings)[slot];
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

/** Number of Paris-slot lookups computed so far (memo misses), for tests. */
export function parisSlotComputations(): number {
    return slotComputations;
}

/**
 * Next weather changes after `date` (at most `count`), looking at the current Paris day and the next one.
 */
export function autoWeatherChanges(
    date: Date,
    auto: AutoWeatherSettings | undefined,
    count: number,
): { at: Date; weather: WeatherType }[] {
    const changes: { at: Date; weather: WeatherType }[] = [];
    if (!Number.isFinite(date.getTime()) || count <= 0) return changes;
    const settings = auto ?? DEFAULT_AUTO_WEATHER;
    const lastDay = shiftDay(parisSlot(date).day, 1);
    let current = autoWeatherAt(date, settings);
    for (let t = slotStart(date).getTime() + SLOT_MS; changes.length < count; t += SLOT_MS) {
        const at = new Date(t);
        if (parisSlot(at).day > lastDay) break;
        const weather = autoWeatherAt(at, settings);
        if (weather !== current) {
            changes.push({ at, weather });
            current = weather;
        }
    }
    return changes;
}

type Normalised = { frequency: AutoWeatherFrequency; include: BadWeather[] };

/** Keep only drawable bad weathers, without duplicates, in a stable order (seed independent of order). */
function normalise(auto: AutoWeatherSettings): Normalised {
    const include = BAD_WEATHERS.filter((weather) => auto.include.includes(weather)).sort();
    return { frequency: auto.frequency, include };
}

function parisSlot(date: Date): { day: string; slot: number } {
    const parts: Record<string, string> = {};
    for (const part of parisFormat.formatToParts(date)) parts[part.type] = part.value;
    const slot = Number(parts.hour) * 2 + (Number(parts.minute) >= 30 ? 1 : 0);
    return { day: `${parts.year}-${parts.month}-${parts.day}`, slot };
}

/** `YYYY-MM-DD` shifted by `days` calendar days. */
function shiftDay(day: string, days: number): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daySchedule(day: string, settings: Normalised): WeatherType[] {
    const key = `${day}|${settings.frequency}|${settings.include.join(",")}`;
    const cached = dayCache.get(key);
    if (cached) {
        dayCache.delete(key);
        dayCache.set(key, cached);
        return cached;
    }
    // The eve, computed from clear, gives the starting point. Since every slot consumes the same random
    // draws whatever the previous weather, the eve converges to its real schedule long before 23:30.
    const eve = computeDay(shiftDay(day, -1), settings, WeatherType.Clear);
    const schedule = computeDay(day, settings, eve[SLOTS_PER_DAY - 1]);
    dayCache.set(key, schedule);
    while (dayCache.size > CACHE_SIZE) {
        const oldest = dayCache.keys().next().value;
        if (oldest === undefined) break;
        dayCache.delete(oldest);
    }
    return schedule;
}

function computeDay(day: string, settings: Normalised, start: WeatherType): WeatherType[] {
    computations++;
    // Noon UTC is always inside the same Paris calendar day.
    const noon = new Date(`${day}T12:00:00Z`);
    const snowAllowed = snowPossibleAt(noon);
    const weights = drawWeights(seasonAt(noon), settings);
    const random = mulberry32(fnv1a(`${day}|${settings.frequency}|${settings.include.join(",")}`));
    const schedule: WeatherType[] = [];
    let previous = start;
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        // Always consume both draws so that schedules from different starts converge.
        const keep = random() < PERSISTENCE;
        const drawn = pick(weights, random());
        const candidate = keep ? previous : drawn;
        previous = applyRules(previous, candidate, Math.floor(slot / 2), snowAllowed, settings.include);
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
    snowAllowed: boolean,
    include: readonly BadWeather[],
): WeatherType {
    let weather = candidate;
    if (weather === WeatherType.Snow && !snowAllowed) weather = WeatherType.Rain;
    // A storm starts only after clear or rain (an ongoing storm may go on).
    if (
        weather === WeatherType.Storm &&
        previous !== WeatherType.Storm &&
        previous !== WeatherType.Clear &&
        previous !== WeatherType.Rain
    ) {
        weather = WeatherType.Rain;
    }
    if (weather === WeatherType.Snow && previous === WeatherType.Storm) weather = WeatherType.Rain;
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
