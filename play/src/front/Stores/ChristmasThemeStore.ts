import { get, writable, type Writable } from "svelte/store";
import { ChristmasThemeMode } from "../Phaser/Game/Christmas/ChristmasSeason";

const CHRISTMAS_THEME_KEY = "christmasTheme";

/** Personal choice, kept in this browser: the whole team is admin, so there is no map-wide setting. */
function createChristmasThemeModeStore(): Writable<ChristmasThemeMode> {
    const saved = localStorage.getItem(CHRISTMAS_THEME_KEY);
    const store = writable(Object.values(ChristmasThemeMode).find((mode) => mode === saved) ?? ChristmasThemeMode.Auto);
    const set = (value: ChristmasThemeMode): void => {
        localStorage.setItem(CHRISTMAS_THEME_KEY, value);
        store.set(value);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => {
            set(updater(get(store)));
        },
    };
}

export const christmasThemeModeStore = createChristmasThemeModeStore();
