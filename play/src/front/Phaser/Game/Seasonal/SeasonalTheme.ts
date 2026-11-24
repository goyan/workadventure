import { Season, seasonAt } from "@workadventure/map-editor";
import type { SeasonPlace } from "@workadventure/map-editor";

/**
 * Personal choice: follow the calendar, force autumn, force winter, or none. The winter is never shown by itself (auto
 * has none): only for who chose it, and for as long as they keep it. It is back since 2026-11-22: the Christmas theme
 * had been taken away (2026-11-20) because its snowy ground was a plain white hiding the textures of the map; the
 * ground now has a texture of snow. A "christmas" saved before still reads as auto (SeasonalThemeStore): nobody gets
 * the winter back without choosing it.
 */
export enum SeasonalThemeMode {
    Auto = "auto",
    Autumn = "autumn",
    Winter = "winter",
    None = "none",
}

/**
 * What the seasonal manager draws outdoors: the autumn, or the winter (still named Christmas, as its code in
 * Christmas/): snow caps on what stands outside, footprints, a snowy ground. The winter decor is drawn for who chose
 * the winter theme, all of it; and, fading in as it builds up, under the snow of the map where the manager is told of it.
 */
export enum SeasonalTheme {
    Autumn = "autumn",
    Christmas = "christmas",
}

/**
 * Auto follows the season of the map, like its seasonal trees, so everyone on it switches at the same time: autumn
 * from September 1st to November 30th at its place (Paris without one), from March 1st to May 31 in the south.
 * Without the server time yet, auto shows nothing rather than switching right after loading.
 */
export function activeSeasonalTheme(
    mode: SeasonalThemeMode,
    serverDate: Date | undefined,
    place?: SeasonPlace,
): SeasonalTheme | undefined {
    if (mode === SeasonalThemeMode.Autumn) return SeasonalTheme.Autumn;
    if (mode === SeasonalThemeMode.Winter) return SeasonalTheme.Christmas;
    if (mode === SeasonalThemeMode.None || !serverDate || !Number.isFinite(serverDate.getTime())) return undefined;
    return seasonAt(serverDate, place) === Season.Autumn ? SeasonalTheme.Autumn : undefined;
}

/** The theme shows its season on the seasonal trees, for this person only. */
export function forcedTreeSeason(theme: SeasonalTheme | undefined): Season | undefined {
    if (theme === SeasonalTheme.Autumn) return Season.Autumn;
    if (theme === SeasonalTheme.Christmas) return Season.Winter;
    return undefined;
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
