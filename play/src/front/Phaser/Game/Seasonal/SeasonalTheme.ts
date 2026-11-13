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

const parisMonthDay = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", month: "numeric", day: "numeric" });

/**
 * Auto follows the Paris calendar, like the seasonal trees, so the whole team switches at the same time: autumn from
 * September 1st to November 30th, Christmas from December 1st to January 6th included. Without the server time yet,
 * auto shows nothing rather than switching right after loading.
 */
export function activeSeasonalTheme(mode: SeasonalThemeMode, serverDate: Date | undefined): SeasonalTheme | undefined {
    if (mode === SeasonalThemeMode.Autumn) return SeasonalTheme.Autumn;
    if (mode === SeasonalThemeMode.Christmas) return SeasonalTheme.Christmas;
    if (mode === SeasonalThemeMode.None || !serverDate || !Number.isFinite(serverDate.getTime())) return undefined;
    const parts = parisMonthDay.formatToParts(serverDate);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (month >= 9 && month <= 11) return SeasonalTheme.Autumn;
    if (month === 12 || (month === 1 && day <= 6)) return SeasonalTheme.Christmas;
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
export function mapSnowShown(mode: SeasonalThemeMode, weatherShown: boolean): boolean {
    return weatherShown && mode === SeasonalThemeMode.Auto;
}

/** The former "Christmas theme" setting (auto, always, never) carries over to the seasonal theme. */
export function migrateChristmasMode(saved: string | null): SeasonalThemeMode | undefined {
    if (saved === "always") return SeasonalThemeMode.Christmas;
    if (saved === "never") return SeasonalThemeMode.None;
    if (saved === "auto") return SeasonalThemeMode.Auto;
    return undefined;
}
