import { get } from "svelte/store";
import { hoarFrost, WeatherType } from "@workadventure/map-editor";
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
}

/** The shallows freeze under this, °C... */
const ICE_START_C = 0;
/** ...and the whole water at this. */
const FULL_ICE_C = -15;
/** Depth of water (map pixels) that freezes last: deeper freezes with it. */
export const DEEP_ICE_PX = 64;
/** A pool freezes from its surface, as still water this deep, whatever the depth of its basin. */
export const POOL_ICE_DEPTH_PX = 32;
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

let cycle: WaterCycle = { frost: 0, ice: 0, wet: 0 };
let lastSecond: number | undefined;

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
    const air = airNow(settings, date);
    const celsius = air?.temperature;
    const weather = shownWeatherSettings(settings, date)?.weather;
    const raining = weather === WeatherType.Rain || weather === WeatherType.Storm;
    const target = {
        frost: air?.humidity === undefined ? 0 : hoarFrost({ ...air, humidity: air.humidity }),
        ice: celsius === undefined ? 0 : iceAt(celsius),
        wet: raining && (celsius === undefined || celsius > 0) ? 1 : 0,
    };
    cycle = Number.isFinite(elapsed)
        ? {
              frost: towards(cycle.frost, target.frost, elapsed, FROST_RATE, FROST_RATE),
              ice: towards(cycle.ice, target.ice, elapsed, ICE_RATE, ICE_RATE),
              wet: towards(cycle.wet, target.wet, elapsed, WET_RATE, DRY_RATE),
          }
        : // The first look at a map: the cycle is already where the weather is.
          target;
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

/**
 * The air now at the place shown, the one the frost of the ground goes by: this player's own city, else the map's
 * (the heat, the humidity and the wind set by hand in the room first, as the banner says them). A humidity not known
 * gives no frost: none is made up.
 */
function airNow(settings: MapSnowSettings | undefined, date: Date): AirNow | undefined {
    const { place, state } = chosenWeatherNow();
    if (place) return timelineAirAt(state, date.getTime());
    const conditions = get(fireConditionsStore);
    if (conditions?.manual) {
        return { temperature: conditions.temperature, humidity: conditions.humidity, windSpeed: conditions.windSpeed };
    }
    return timelineAirAt(shownPlaceTimeline(settings), date.getTime());
}

function clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
}
