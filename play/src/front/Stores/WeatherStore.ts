import { get, writable, type Writable } from "svelte/store";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";

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
