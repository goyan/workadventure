import { get } from "svelte/store";
import LL, { locale } from "../../../../i18n/i18n-svelte";
import type { PointWords } from "./WorldDaylight";

/** The words a point of the world far from any city is named with, in the language of the player. */
export function pointWords(): PointWords {
    const words = get(LL).menu.settings.night;
    const language = get(locale) || undefined;
    const kilometres = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
    const countries = new Intl.DisplayNames(language, { type: "region", fallback: "code" });
    return {
        north: words.pointNorth(),
        south: words.pointSouth(),
        east: words.pointEast(),
        west: words.pointWest(),
        far: (point, city, distance) => words.pointFar({ point, city, distance }),
        short: (city, distance) => words.pointShort({ city, distance }),
        country: (code) => countries.of(code) ?? code,
        kilometres: (km) => kilometres.format(km),
    };
}
