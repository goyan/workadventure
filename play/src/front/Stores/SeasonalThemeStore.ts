import { get, writable, type Writable } from "svelte/store";
import { migrateChristmasMode, SeasonalThemeMode } from "../Phaser/Game/Seasonal/SeasonalTheme";

const SEASONAL_THEME_KEY = "seasonalTheme";
/** Former settings replaced by the seasonal theme: the Christmas choice carries over, the ground choice goes. */
const CHRISTMAS_THEME_KEY = "christmasTheme";
const GROUND_MODE_KEY = "groundMode";

function readSavedMode(): SeasonalThemeMode {
    const saved = localStorage.getItem(SEASONAL_THEME_KEY);
    const current = Object.values(SeasonalThemeMode).find((mode) => mode === saved);
    const migrated = current ?? migrateChristmasMode(localStorage.getItem(CHRISTMAS_THEME_KEY));
    localStorage.removeItem(CHRISTMAS_THEME_KEY);
    localStorage.removeItem(GROUND_MODE_KEY);
    if (migrated && !current) localStorage.setItem(SEASONAL_THEME_KEY, migrated);
    return migrated ?? SeasonalThemeMode.Auto;
}

/** Personal choice, kept in this browser: the whole team is admin, so there is no map-wide setting. */
function createSeasonalThemeModeStore(): Writable<SeasonalThemeMode> {
    const store = writable(readSavedMode());
    const set = (value: SeasonalThemeMode): void => {
        localStorage.setItem(SEASONAL_THEME_KEY, value);
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

export const seasonalThemeModeStore = createSeasonalThemeModeStore();
