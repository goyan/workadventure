import { get, writable, type Writable } from "svelte/store";

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

const CLOUDS_SHOWN_KEY = "weatherCloudsShown";

/**
 * Personal switch for the clouds of the map weather and their shadows: on until turned off, kept in the browser. It
 * never changes the weather of the map for the others.
 */
function createCloudsShownStore(): Writable<boolean> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(CLOUDS_SHOWN_KEY);
    } catch {
        // Storage refused (private browsing): the choice lasts until the page is closed.
    }
    const store = writable(stored !== "false");
    const set = (shown: boolean): void => {
        try {
            localStorage.setItem(CLOUDS_SHOWN_KEY, String(shown));
        } catch {
            // Same as above: kept in memory only.
        }
        store.set(shown);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const cloudsShownStore = createCloudsShownStore();
