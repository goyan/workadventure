import { ICE_BEARS_MM } from "@workadventure/map-editor";
import { get } from "svelte/store";
import {
    hoarFrost,
    rainRateAt,
    SNOW_MAX_MM,
    snowMeltMmPerHour,
    snowShare,
    snowSublimationMmPerHour,
    freezeThawTimesOf,
    waterTimesOf,
    WeatherType,
} from "@workadventure/map-editor";
import { realWeatherAt } from "@wa/common/RealWeather";
import { nightDateStore } from "@wa/front/Stores/NightStore";
import { fireConditionsStore } from "@wa/front/Stores/FireConditionsStore";
import { chosenWeatherNow } from "./ChosenPlaceWeather";
import type { RealForecastState } from "./RealWeather";
import { shownPlaceTimeline, shownWeatherSettings } from "./RealWeatherClient";
import type { MapSnowSettings } from "./SnowCover";

/**
 * The cycle of the water as this player sees it, from the air and the weather of the place shown (their own city, or
 * the map's): hoar frost on the ground from the vapour of a damp air under 0 °C (hoarFrost), ice spreading on the water from its shallows as it gets colder
 * (all of it frozen at -15 °C), outdoors only, the ground wet after a rain, drying again. Drawn by the shaders of the ground and the
 * water, and the frozen water is skated on: nothing is sent to the server, whose water keeps flowing.
 *
 * Nothing jumps: the ice grows and melts, the ground dries, over minutes of the game clock.
 */
export interface WaterCycle {
    /** Frost on the ground, 0 to 1. */
    frost: number;
    /** How far the ice reaches into the water, 0 (none) to 1 (all of it, the deepest too). */
    ice: number;
    /** How wet the ground is from the rain, 0 to 1. */
    wet: number;
    /**
     * The snow lying on the ground of a player who follows a place of their own, in mm of water (see ownSnowAfter):
     * the snow of their city, for them alone. None for a player who follows the server, whose snow the server keeps.
     */
    snowMm: number;
}

/** The shallows freeze under this, °C... */
const ICE_START_C = 0;
/** ...and the whole water at this. */
const FULL_ICE_C = -15;
/** Depth of water (map pixels) that freezes last: deeper freezes with it. */
export const DEEP_ICE_PX = 64;
/**
 * A pool freezes from its surface, as still water this deep, whatever the depth of its basin: a skin of ice from about
 * -3 °C (still water outdoors takes a film of ice after a few hours of frost; at 32 px it waited for -8 °C).
 */
export const POOL_ICE_DEPTH_PX = 8;
/**
 * The ice of a player who follows a place of their own has no history (the server's grows by the frost of the past
 * days, Ice.ts): its thickness is read from the cold of now, as if it had lasted. It bears a walker (ICE_BEARS_MM)
 * from -7.5 °C: between the first ice and that, it cracks and gives way under them.
 */
export const OWN_ICE_BEARS_AT = 0.5;
export function ownIceMm(ice: number): number {
    return (ICE_BEARS_MM * clamp(ice)) / OWN_ICE_BEARS_AT;
}
/** How fast it goes towards the weather of now, a share a second of the game clock: about two minutes each way. */
const ICE_RATE = 1 / 120;
const FROST_RATE = 1 / 60;
/** The ground soaks in a few seconds of rain and dries in about five minutes. */
const WET_RATE = 1 / 8;
const DRY_RATE = 1 / 300;

/** How far the ice reaches into the water at this temperature, 0 to 1. */
export function iceAt(celsius: number): number {
    return clamp((ICE_START_C - celsius) / (ICE_START_C - FULL_ICE_C));
}

/** Whether water this deep (map pixels) is frozen when the ice reaches this far: the shallows first. */
export function isFrozen(depthPx: number, ice: number): boolean {
    return depthPx > 0 && ice > 0 && ice >= 0.1 + 0.9 * Math.min(1, depthPx / DEEP_ICE_PX);
}

/** One step of `value` towards `target` over `seconds`, at `upRate` going up and `downRate` going down. */
export function towards(value: number, target: number, seconds: number, upRate: number, downRate: number): number {
    if (target > value) return Math.min(target, value + seconds * upRate);
    return Math.max(target, value - seconds * downRate);
}

/**
 * The snow of a player's own city after `seconds` of the game clock, from `snowMm` of water lying on their ground:
 * what falls there (`fallingMmPerHour` of water) lies by its share of snow (snowShare), and what lies melts and goes
 * in a dry wind as the snow the server keeps does (Snow.ts), on the same clock: `times` the real one, the speed of
 * the water of the map (waterTimesOf; reality when absent). Local to this browser:
 * it gives no water, the water is the server's. Unchanged while the air of the city is not known.
 */
export function ownSnowAfter(
    snowMm: number,
    seconds: number,
    fallingMmPerHour: number,
    air: AirNow | undefined,
    times = 1,
    /** The clock the snow melts and goes by: the speed of the freeze and the thaw over `times` (freezeThawTimesOf). */
    meltTimes = times,
): number {
    if (!Number.isFinite(seconds) || seconds <= 0 || !air || air.humidity === undefined) return snowMm;
    const weather = { temperature: air.temperature, humidity: air.humidity, windSpeed: air.windSpeed ?? 0 };
    const hoursOf = (clock: number): number => (seconds * (Number.isFinite(clock) && clock > 0 ? clock : 1)) / 3600;
    const falling = Number.isFinite(fallingMmPerHour) ? Math.max(0, fallingMmPerHour) : 0;
    const gained = falling * snowShare(weather.temperature, weather.humidity) * hoursOf(times);
    const lost = (snowMeltMmPerHour(weather) + snowSublimationMmPerHour(weather)) * hoursOf(meltTimes);
    return Math.min(SNOW_MAX_MM, Math.max(0, snowMm + gained - lost));
}

/**
 * A cycle kept from an absence (the player left the map, or the page was reloaded) moved on by the time away, `seconds`
 * of the clock of the world: the frost, the ice and the wet towards the air of now at their own pace, the snow of the
 * city fallen and melted as if the air of now had held all along (the browser knows no weather of the past).
 */
export function cycleAfterAbsence(
    kept: WaterCycle,
    seconds: number,
    target: Omit<WaterCycle, "snowMm">,
    fallingMmPerHour: number,
    air: AirNow | undefined,
    times = 1,
    meltTimes = times,
): WaterCycle {
    return {
        frost: towards(kept.frost, target.frost, seconds, FROST_RATE, FROST_RATE),
        ice: towards(kept.ice, target.ice, seconds, ICE_RATE, ICE_RATE),
        wet: towards(kept.wet, target.wet, seconds, WET_RATE, DRY_RATE),
        snowMm: ownSnowAfter(kept.snowMm, seconds, fallingMmPerHour, air, times, meltTimes),
    };
}

/** The cycle of a player's own city, kept in the browser: back on the map, it goes on from there. */
const OWN_CYCLE_KEY = "ownWaterCycle";
const OWN_CYCLE_SAVE_MS = 15_000;
/** Beyond this absence, the kept cycle is too old to go on from: the weather of the city now is taken instead. */
const OWN_CYCLE_MAX_ABSENCE_S = 7 * 24 * 3600;

interface KeptCycle extends WaterCycle {
    /** The city it is the cycle of (placeKey). */
    place: string;
    /** When it was kept (ms, the clock of the computer). */
    at: number;
}

function placeKey(place: { name: string; latitude: number; longitude: number }): string {
    return `${place.name}@${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
}

function readKeptCycle(place: string): KeptCycle | undefined {
    try {
        const kept: unknown = JSON.parse(localStorage.getItem(OWN_CYCLE_KEY) ?? "null");
        if (typeof kept !== "object" || kept === null) return undefined;
        const value = kept as Partial<KeptCycle>;
        const numbers = [value.frost, value.ice, value.wet, value.snowMm, value.at];
        if (value.place !== place || !numbers.every((n) => typeof n === "number" && Number.isFinite(n)))
            return undefined;
        return value as KeptCycle;
    } catch {
        return undefined;
    }
}

let lastKept = 0;
function keepCycle(place: string, kept: WaterCycle): void {
    const now = Date.now();
    if (now - lastKept < OWN_CYCLE_SAVE_MS) return;
    lastKept = now;
    try {
        localStorage.setItem(OWN_CYCLE_KEY, JSON.stringify({ ...kept, place, at: now }));
    } catch {
        // Storage refused: the cycle starts again from the weather of now next time.
    }
}

let cycle: WaterCycle = { frost: 0, ice: 0, wet: 0, snowMm: 0 };
let lastSecond: number | undefined;
/** A cycle restored from the browser, held until the weather of its city is known, then moved on by the absence. */
let restored: KeptCycle | undefined;

/**
 * The water cycle at the game clock, moved on once a second at most (read at each image by the shaders and by each
 * character on the water). Undefined settings: a map not loaded yet, nothing moves.
 */
export function waterCycleNow(settings: MapSnowSettings | undefined): WaterCycle {
    const date = get(nightDateStore);
    if (!date) return cycle;
    const second = Math.floor(date.getTime() / 1000);
    if (lastSecond === second) return cycle;
    const elapsed = lastSecond === undefined ? Number.POSITIVE_INFINITY : Math.min(60, second - lastSecond);
    lastSecond = second;
    const air = frostAirNow(settings, date);
    // The clock of the snow of the map, that of its water: the snow of the city of the player goes by it too.
    const times = waterTimesOf(settings?.water);
    // ...and the speed of the freeze and the thaw of the map over it for its melt.
    const meltTimes = freezeThawTimesOf(settings?.water);
    const celsius = air?.temperature;
    const weather = shownWeatherSettings(settings, date)?.weather;
    const raining = weather === WeatherType.Rain || weather === WeatherType.Storm;
    const target = {
        frost: frostOf(air),
        ice: iceOf(air),
        wet: raining && (celsius === undefined || celsius > 0) ? 1 : 0,
    };
    // The snow of their own city, for a player who follows one: what falls there, as their sky shows it.
    const { place, state } = chosenWeatherNow();
    const falling = place
        ? rainRateAt(
              { weather: WeatherType.Real, weatherLocation: place },
              date.getTime(),
              state.status === "known" ? state.slots : undefined,
          )
        : 0;
    const city = place ? placeKey(place) : undefined;
    if (!Number.isFinite(elapsed)) {
        // The first look at a map: the cycle of the player's city kept from last time, or the weather of now. No
        // snow lies yet then: it has to fall.
        restored = city ? readKeptCycle(city) : undefined;
        cycle = restored
            ? { frost: restored.frost, ice: restored.ice, wet: restored.wet, snowMm: restored.snowMm }
            : { ...target, snowMm: 0 };
    } else if (restored && restored.place === city) {
        // Held as it was until the air of the city is known, then moved on by the time away.
        if (state.status === "known") {
            const away = Math.min(OWN_CYCLE_MAX_ABSENCE_S, Math.max(0, (Date.now() - restored.at) / 1000));
            cycle = cycleAfterAbsence(cycle, away, target, falling, air, times, meltTimes);
            restored = undefined;
        }
    } else {
        restored = undefined;
        cycle = {
            frost: towards(cycle.frost, target.frost, elapsed, FROST_RATE, FROST_RATE),
            ice: towards(cycle.ice, target.ice, elapsed, ICE_RATE, ICE_RATE),
            wet: towards(cycle.wet, target.wet, elapsed, WET_RATE, DRY_RATE),
            snowMm: place ? ownSnowAfter(cycle.snowMm, elapsed, falling, air, times, meltTimes) : 0,
        };
    }
    if (city && !restored) keepCycle(city, cycle);
    return cycle;
}

/** The air now at a place: its temperature (°C), its relative humidity (%) and its wind (km/h), when given. */
export interface AirNow {
    temperature: number;
    humidity: number | undefined;
    windSpeed: number | undefined;
}

/** The air of the quarter hour under way of a timeline; undefined without a temperature. */
export function timelineAirAt(state: RealForecastState, epoch: number): AirNow | undefined {
    if (state.status !== "known") return undefined;
    const now = realWeatherAt(state.slots, epoch);
    if (!now || now.temperature === null) return undefined;
    return { temperature: now.temperature, humidity: now.humidity, windSpeed: now.windSpeed };
}

/** The frost the ground goes towards under an air, 0 to 1 (hoarFrost): none while its humidity is not known. */
export function frostOf(air: AirNow | undefined): number {
    return air?.humidity === undefined ? 0 : hoarFrost({ ...air, humidity: air.humidity });
}

/** How far the ice goes towards under an air, 0 to 1 (iceAt): none while its temperature is not known. */
export function iceOf(air: AirNow | undefined): number {
    return air === undefined ? 0 : iceAt(air.temperature);
}

/**
 * The air now at the place shown, the one the frost of the ground goes by: this player's own city, else the map's
 * (mapFrostAirNow). A humidity not known gives no frost: none is made up.
 */
export function frostAirNow(settings: MapSnowSettings | undefined, date: Date): AirNow | undefined {
    const { place, state } = chosenWeatherNow();
    if (place) return timelineAirAt(state, date.getTime());
    return mapFrostAirNow(settings, date);
}

/**
 * The air of the map the frost goes by for every player who follows the server: the heat, the humidity and the wind
 * set by hand in the room first, as the banner says them, else the real air at the place of the map.
 */
export function mapFrostAirNow(settings: MapSnowSettings | undefined, date: Date): AirNow | undefined {
    const conditions = get(fireConditionsStore);
    if (conditions?.manual) {
        return { temperature: conditions.temperature, humidity: conditions.humidity, windSpeed: conditions.windSpeed };
    }
    return timelineAirAt(shownPlaceTimeline(settings), date.getTime());
}

function clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
}
