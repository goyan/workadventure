import { get } from "svelte/store";
import LL, { locale } from "../../../../i18n/i18n-svelte";
import type { PointWords } from "./WorldDaylight";

/** The words a point of the world far from any city is named with, in the language of the player. */
export function pointWords(): PointWords {
    const words = get(LL).menu.settings.night;
    const kilometres = new Intl.NumberFormat(get(locale) || undefined, { maximumFractionDigits: 0 });
    return {
        north: words.pointNorth(),
        south: words.pointSouth(),
        east: words.pointEast(),
        west: words.pointWest(),
        far: (point, city, distance) => words.pointFar({ point, city, distance }),
        short: (city, distance) => words.pointShort({ city, distance }),
        kilometres: (km) => kilometres.format(km),
    };
}
