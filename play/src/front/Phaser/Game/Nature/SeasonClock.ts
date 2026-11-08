import { Season, WeatherType } from "@workadventure/map-editor";

const parisMonth = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", month: "numeric" });

/** Northern meteorological seasons, shared with Paris server time regardless of personal night settings. */
export function seasonAt(serverDate: Date): Season {
    const month = Number(parisMonth.format(serverDate));
    if (month >= 3 && month <= 5) return Season.Spring;
    if (month >= 6 && month <= 8) return Season.Summer;
    if (month >= 9 && month <= 11) return Season.Autumn;
    return Season.Winter;
}

/** Paris cold months: late autumn, winter and early spring can have snowfall. */
export function snowPossibleAt(serverDate: Date): boolean {
    if (!Number.isFinite(serverDate.getTime())) return false;
    const month = Number(parisMonth.format(serverDate));
    return month >= 11 || month <= 3;
}

/** The available white winter artwork is snow cover, not a permanent calendar state. */
export function treeSeasonAt(serverDate: Date, weather: WeatherType, coverage: number): Season {
    if (weather === WeatherType.Snow || coverage > 0) return Season.Winter;
    const season = seasonAt(serverDate);
    return season === Season.Winter ? Season.Summer : season;
}
