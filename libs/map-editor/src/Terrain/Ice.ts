import { snowMeltMmPerHour } from "./Snow";
import type { SnowWeather } from "./Snow";

/**
 * The ice that takes on the water of a map in the frost: how fast it thickens, how fast it thaws, and what it bears.
 * Kept in millimetres of ice over the water of a tile, by the server, so that every player who follows its weather
 * skates on the same ice. The ice is the top of the water under it: freezing and thawing change no volume of water.
 * Pure rules, shared by the back (which keeps the ice) and the front.
 */

/** From this thickness (mm) the ice bears someone walking on it: under it, on water deep enough to swim, it gives way. */
export const ICE_BEARS_MM = 50;
/**
 * From this thickness (mm) an ice fishing shack may go up on the ice (Life/IceShack): a light shelter hauled by hand,
 * with one angler in it. The Minnesota DNR guidelines for new, clear ice ("Recommended Minimum Ice Thickness",
 * https://files.dnr.state.mn.us/education_safety/safety/ice/ice-tickness-guidelines-poster.pdf) ask for 4 inches
 * "on foot" and say "keep off" under it; a shelter hauled by a truck ("wheelhouse") asks for 20 inches and more.
 * 4 inches are 101.6 mm.
 */
export const ICE_SHACK_MM = 102;
/** From this thickness (mm) the ice is slipped on, as a rink: a frozen puddle, black ice on a flooded ground. */
export const ICE_SLIPS_MM = 5;
/**
 * How many times faster than the clock of the snow (the speed of the water of the map) the ice thickens than Stefan's
 * law alone gives: in real time it bears a walker after about 14 h at -3 °C, 4 h at -10 °C, 1 h 25 at -30 °C. Its
 * thaw keeps the clock of the snow.
 */
export const ICE_GROWTH_TIMES = 2;
/**
 * The current keeps the water from freezing over: in running water the cold makes frazil, crystals carried and mixed
 * by the flow, not a sheet of ice that grows in place. Gosink and Osterkamp (1983, "Measurements and analyses of
 * velocity profiles and frazil ice-crystal rise velocities during periods of frazil-ice formation in rivers", Annals
 * of Glaciology 4, p. 79, https://doi.org/10.3189/S0260305500005279) cite the rule of thumb of the rivers of Norway
 * (Carstens 1971): "the water surface is usually covered with moving frazil slush if the water velocity is >0.6 and
 * <1.2 m s-1, and open if the water velocity is >1.2 m s-1"; on the Saint Lawrence (Starosolszky 1971) the surface
 * "usually remains free of ice" over 1.0 m/s. They add that these empirical velocities "are imprecise as the critical
 * velocity varies with water depth, bottom roughness and meteorological conditions".
 *
 * Up to ICE_CURRENT_SHEET_MS (m/s) the ice takes as on still water; from ICE_CURRENT_OPEN_MS none takes; between the
 * two the ice that takes in place thins as the water runs faster (a straight line between the two speeds: the sources
 * give the bounds of the regimes, not a law between them; the slush they describe there bears no one).
 */
export const ICE_CURRENT_SHEET_MS = 0.6;
export const ICE_CURRENT_OPEN_MS = 1.2;

/**
 * The share of the growth of the ice that takes on water running at `metresPerSecond`: 1 up to ICE_CURRENT_SHEET_MS,
 * 0 from ICE_CURRENT_OPEN_MS. A speed that is not known counts as still water. The current neither melts nor carries
 * away an ice that took before it ran (the heat of the water and the break-up of a cover are not modelled).
 */
export function iceCurrentShare(metresPerSecond: number): number {
    if (!(metresPerSecond > ICE_CURRENT_SHEET_MS)) return 1;
    if (metresPerSecond >= ICE_CURRENT_OPEN_MS) return 0;
    return (ICE_CURRENT_OPEN_MS - metresPerSecond) / (ICE_CURRENT_OPEN_MS - ICE_CURRENT_SHEET_MS);
}

/**
 * Under this rise of its water over what it held before a tsunami came (mm), a tile is not counted as lifted by the
 * tsunami (Meadow.stepIce): the ripples of a water the sea did not reach. Over it, the ice the sea lifts by more
 * than its own thickness breaks, and the snow on it goes into the flood.
 */
export const ICE_LIFTED_MM = 10;

/** The thickest ice a tile holds, in mm. */
export const ICE_MAX_MM = 1000;

/**
 * Stefan's law: the square of the thickness grows with the degree-days of frost, thickness² = α² × degree-days with
 * α = 2.7 cm, which gives a growth of α² / 2 = 365 mm² a day by degree under zero, divided by the thickness.
 */
const STEFAN_MM2_PER_DEGREE_DAY = 365;
/** A film of ice grows as an ice this thick (mm): the law has no growth without end at its start. */
const FIRST_ICE_MM = 10;
/** The wind (km/h) that doubles the growth: it takes the heat of the water away. */
const GROWTH_WIND_KMH = 30;
/** The snow (mm of water) lying on the ice that halves its growth: it keeps the cold off. */
const INSULATING_SNOW_MM = 50;

/**
 * How fast the ice thickens, in mm a day of the real clock, for an ice `thicknessMm` thick under `snowMm` of snow (mm
 * of water): by the degrees under zero, faster in the wind, slower as it thickens and under the snow. None at 0 °C
 * and above, nor in an air that is not known.
 */
export function iceGrowthMmPerDay(thicknessMm: number, weather: SnowWeather, snowMm: number): number {
    if (!Number.isFinite(weather.temperature) || weather.temperature >= 0) return 0;
    const wind = Number.isFinite(weather.windSpeed) ? Math.max(0, weather.windSpeed) : 0;
    const thickness = Math.max(FIRST_ICE_MM, Number.isFinite(thicknessMm) ? thicknessMm : 0);
    const snow = Number.isFinite(snowMm) ? Math.max(0, snowMm) : 0;
    return (
        (STEFAN_MM2_PER_DEGREE_DAY * -weather.temperature * (1 + wind / GROWTH_WIND_KMH)) /
        thickness /
        (1 + snow / INSULATING_SNOW_MM)
    );
}

/**
 * From this many hours a step (a fast clock: the speed of the freeze and the thaw), the ice that takes in it is the
 * exact solution of Stefan's law over those hours (iceAfterHours), not one step of its rate: a step of a day would
 * otherwise give the growth of the first instant all day long. Under it the steps go as they always did.
 */
export const ICE_EXACT_FROM_HOURS = 1;

/**
 * The ice that took after `hours` of the real clock on an ice `thicknessMm` thick under `snowMm` of snow, as
 * iceGrowthMmPerDay integrated exactly (ICE_GROWTH_TIMES faster, by the `share` the current leaves): straight up to
 * the first ice (FIRST_ICE_MM), then thickness² growing with the time. The air and the snow are taken as they are
 * over the whole step.
 */
export function iceAfterHours(
    thicknessMm: number,
    weather: SnowWeather,
    snowMm: number,
    hours: number,
    share = 1,
): number {
    const start = Number.isFinite(thicknessMm) ? Math.max(0, thicknessMm) : 0;
    // The growth a day of a film, times its thickness: what the law divides by the thickness (mm² an hour here).
    const rate = (iceGrowthMmPerDay(0, weather, snowMm) * FIRST_ICE_MM * ICE_GROWTH_TIMES * share) / 24;
    if (!(rate > 0) || !(hours > 0)) return start;
    let left = hours;
    let thick = start;
    if (thick < FIRST_ICE_MM) {
        // A film grows as an ice FIRST_ICE_MM thick: at a steady rate up to it.
        const toFirst = ((FIRST_ICE_MM - thick) * FIRST_ICE_MM) / rate;
        if (left <= toFirst) return thick + (rate / FIRST_ICE_MM) * left;
        left -= toFirst;
        thick = FIRST_ICE_MM;
    }
    return Math.sqrt(thick * thick + 2 * rate * left);
}

/** How fast the ice thaws, in mm an hour of the real clock: as the snow melts under the same air. */
export function iceThawMmPerHour(weather: SnowWeather): number {
    return snowMeltMmPerHour(weather);
}

/** The ice of a tile in a byte: by its square root, to tell a thin ice from none. */
export function iceByte(mm: number): number {
    if (!Number.isFinite(mm) || mm <= 0) return 0;
    return Math.max(1, Math.round(255 * Math.sqrt(Math.min(1, mm / ICE_MAX_MM))));
}

/** The ice (mm) a byte tells. */
export function iceMmOfByte(byte: number): number {
    return (byte / 255) ** 2 * ICE_MAX_MM;
}
