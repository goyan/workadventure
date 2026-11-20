import { Season } from "@workadventure/map-editor";

/**
 * Personal choice: follow the calendar, force autumn, or none. The Christmas theme is gone (2026-11-20): it spread a
 * scripted snow over the whole outside; snow now only comes from the weather of the map. A saved "christmas" reads as
 * auto (SeasonalThemeStore).
 */
export enum SeasonalThemeMode {
    Auto = "auto",
    Autumn = "autumn",
    None = "none",
}

/**
 * What the seasonal manager draws outdoors. Autumn is the only theme; the snow decor (still named Christmas, as its
 * code in Christmas/) is drawn only under the snow of the map weather, fading in as it builds up.
 */
export enum SeasonalTheme {
    Autumn = "autumn",
    Christmas = "christmas",
}

const parisMonth = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", month: "numeric" });

/**
 * Auto follows the Paris calendar, like the seasonal trees, so the whole team switches at the same time: autumn from
 * September 1st to November 30th. Without the server time yet, auto shows nothing rather than switching right after
 * loading.
 */
export function activeSeasonalTheme(mode: SeasonalThemeMode, serverDate: Date | undefined): SeasonalTheme | undefined {
    if (mode === SeasonalThemeMode.Autumn) return SeasonalTheme.Autumn;
    if (mode === SeasonalThemeMode.None || !serverDate || !Number.isFinite(serverDate.getTime())) return undefined;
    const month = Number(parisMonth.formatToParts(serverDate).find((part) => part.type === "month")?.value);
    return month >= 9 && month <= 11 ? SeasonalTheme.Autumn : undefined;
}

/** The theme shows its season on the seasonal trees, for this person only. */
export function forcedTreeSeason(theme: SeasonalTheme | undefined): Season | undefined {
    return theme === SeasonalTheme.Autumn ? Season.Autumn : undefined;
}

/**
 * Whether the snow of the map weather may whiten the ground and the trees for this person: only with the weather shown
 * and the theme following the calendar (auto). A chosen theme keeps its look whatever the weather: autumn stays orange,
 * none stays green.
 */
export function mapSnowShown(mode: SeasonalThemeMode, weatherShown: boolean): boolean {
    return weatherShown && mode === SeasonalThemeMode.Auto;
}

/**
 * The former "Christmas theme" setting (auto, always, never) carries over to the seasonal theme; "always" has no theme
 * left to force and follows the calendar.
 */
export function migrateChristmasMode(saved: string | null): SeasonalThemeMode | undefined {
    if (saved === "never") return SeasonalThemeMode.None;
    if (saved === "auto" || saved === "always") return SeasonalThemeMode.Auto;
    return undefined;
}
