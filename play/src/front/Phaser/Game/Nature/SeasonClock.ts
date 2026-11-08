import { Season } from "@workadventure/map-editor";

const parisMonth = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", month: "numeric" });

/** Northern meteorological seasons, shared with Paris server time regardless of personal night settings. */
export function seasonAt(serverDate: Date): Season {
    const month = Number(parisMonth.format(serverDate));
    if (month >= 3 && month <= 5) return Season.Spring;
    if (month >= 6 && month <= 8) return Season.Summer;
    if (month >= 9 && month <= 11) return Season.Autumn;
    return Season.Winter;
}
