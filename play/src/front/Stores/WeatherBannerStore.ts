import { get, writable, type Writable } from "svelte/store";

const WEATHER_BANNER_KEY = "weatherBannerShown";

/**
 * Whether this person shows the weather banner (now, in one hour, in four hours) next to the clock. Off until turned on
 * from the apps menu, and kept in the browser.
 */
function createWeatherBannerStore(): Writable<boolean> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(WEATHER_BANNER_KEY);
    } catch {
        // Storage refused (private browsing): the choice lasts until the page is closed.
    }
    const store = writable(stored === "true");
    const set = (shown: boolean): void => {
        try {
            localStorage.setItem(WEATHER_BANNER_KEY, String(shown));
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

export const weatherBannerStore = createWeatherBannerStore();
