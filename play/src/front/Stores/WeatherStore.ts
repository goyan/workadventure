import { get, writable, type Writable } from "svelte/store";
import { createPersistedNumberStore, createPersistedSwitchStore } from "./PersistedSwitchStore";

const WEATHER_ENABLED_KEY = "weatherEffectsEnabled";

function createWeatherEffectsStore(): Writable<boolean> {
    const store = writable(localStorage.getItem(WEATHER_ENABLED_KEY) !== "false");
    const set = (enabled: boolean): void => {
        localStorage.setItem(WEATHER_ENABLED_KEY, String(enabled));
        store.set(enabled);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const weatherEffectsEnabledStore = createWeatherEffectsStore();

/**
 * Personal switch for the clouds of the map weather and their shadows: on until turned off, kept in the browser. It
 * never changes the weather of the map for the others.
 */
export const cloudsShownStore = createPersistedSwitchStore("weatherCloudsShown", true);

/**
 * Personal height of the clouds, 0 to 1, kept in the browser: zooming in passes under them (they fade out, their
 * shadows stay on the ground); higher clouds need a closer zoom, and at 1 one never passes under them. 0 by default.
 */
export const cloudsHeightStore = createPersistedNumberStore("weatherCloudsHeight", 0, 0, 1);

/**
 * Personal settings of the rain, kept in the browser, 1 by default (the rain as designed); they never change the
 * weather of the map for the others. How many drops fall, how much they lean with the wind, how many splash on the
 * ground, how big the puddles get (0: none), and how much more it rains under the clouds than between them (0: the same
 * everywhere).
 */
export const rainAmountStore = createPersistedNumberStore("weatherRainAmount", 1, 0.25, 2);
export const rainLeanStore = createPersistedNumberStore("weatherRainLean", 1, 0, 2);
export const rainSplashesStore = createPersistedNumberStore("weatherRainSplashes", 1, 0, 2);
export const rainPuddlesStore = createPersistedNumberStore("weatherRainPuddles", 1, 0, 2);
export const rainCloudsStore = createPersistedNumberStore("weatherRainClouds", 1, 0, 1);
