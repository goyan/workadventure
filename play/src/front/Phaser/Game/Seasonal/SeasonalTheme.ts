import { Season } from "@workadventure/map-editor";

/** Personal choice: follow the calendar, force one theme, or none. */
export enum SeasonalThemeMode {
    Auto = "auto",
    Autumn = "autumn",
    Christmas = "christmas",
    None = "none",
}

export enum SeasonalTheme {
    Autumn = "autumn",
    Christmas = "christmas",
}

/**
 * The winter (Christmas) theme is switched off: its snowy ground is a plain white that hides the textures of the tiles.
 * Its code stays as it is; turn this on again once the snowy ground has its textures. While it is off, auto shows
 * nothing from December 1st to January 6th, and a saved Christmas choice is kept but behaves and shows as auto.
 */
export const WINTER_THEME_ENABLED: boolean = false;

/** The choice that applies: a saved Christmas choice counts as auto while the winter theme is off. */
export function shownSeasonalThemeMode(
    mode: SeasonalThemeMode,
    winterThemeEnabled = WINTER_THEME_ENABLED,
): SeasonalThemeMode {
    return mode === SeasonalThemeMode.Christmas && !winterThemeEnabled ? SeasonalThemeMode.Auto : mode;
}

const parisMonthDay = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", month: "numeric", day: "numeric" });

/**
 * Auto follows the Paris calendar, like the seasonal trees, so the whole team switches at the same time: autumn from
 * September 1st to November 30th, Christmas from December 1st to January 6th included. Without the server time yet,
 * auto shows nothing rather than switching right after loading.
 */
export function activeSeasonalTheme(
    savedMode: SeasonalThemeMode,
    serverDate: Date | undefined,
    winterThemeEnabled = WINTER_THEME_ENABLED,
): SeasonalTheme | undefined {
    const mode = shownSeasonalThemeMode(savedMode, winterThemeEnabled);
    if (mode === SeasonalThemeMode.Autumn) return SeasonalTheme.Autumn;
    if (mode === SeasonalThemeMode.Christmas) return SeasonalTheme.Christmas;
    if (mode === SeasonalThemeMode.None || !serverDate || !Number.isFinite(serverDate.getTime())) return undefined;
    const parts = parisMonthDay.formatToParts(serverDate);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (month >= 9 && month <= 11) return SeasonalTheme.Autumn;
    if (winterThemeEnabled && (month === 12 || (month === 1 && day <= 6))) return SeasonalTheme.Christmas;
    return undefined;
}

/** The theme shows its season on the seasonal trees, for this person only. */
export function forcedTreeSeason(theme: SeasonalTheme | undefined): Season | undefined {
    if (theme === SeasonalTheme.Autumn) return Season.Autumn;
    if (theme === SeasonalTheme.Christmas) return Season.Winter;
    return undefined;
}

/**
 * Whether the snow of the map weather may whiten the ground and the trees for this person: only with the weather shown
 * and the theme following the calendar (auto). A chosen theme keeps its look whatever the weather: autumn stays orange,
 * none stays green, and Christmas draws its own snow.
 */
export function mapSnowShown(
    mode: SeasonalThemeMode,
    weatherShown: boolean,
    winterThemeEnabled = WINTER_THEME_ENABLED,
): boolean {
    return weatherShown && shownSeasonalThemeMode(mode, winterThemeEnabled) === SeasonalThemeMode.Auto;
}

/** The former "Christmas theme" setting (auto, always, never) carries over to the seasonal theme. */
export function migrateChristmasMode(saved: string | null): SeasonalThemeMode | undefined {
    if (saved === "always") return SeasonalThemeMode.Christmas;
    if (saved === "never") return SeasonalThemeMode.None;
    if (saved === "auto") return SeasonalThemeMode.Auto;
    return undefined;
}
