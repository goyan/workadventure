import { TILE_PX } from "../types";
import { waterSaturationPressure } from "../Weather/HoarFrost";

/** The radius of a mass of cold air, in tiles: what a player chooses, from a frozen puddle to a frozen bay. */
export const COLD_MIN_TILES = 1;
export const COLD_MAX_TILES = 16;
export const COLD_DEFAULT_TILES = 3;
/**
 * The temperature of its air, in °C: what a player chooses. -80 by default, colder than the coldest air ever
 * measured at the ground (-89.2 °C, Vostok, 1983), down to -120; no warmer than -5, under which ice takes.
 */
export const COLD_MIN_CELSIUS = -120;
export const COLD_MAX_CELSIUS = -5;
export const COLD_DEFAULT_CELSIUS = -80;
/** How long a mass of cold air is held after the last message of its player, in milliseconds: it follows a held click. */
export const COLD_LASTS_MS = 1000;
/** How many masses of cold air can be held at once in a room. */
export const COLDS_PER_ROOM = 8;
/** Within this share of its radius the air of a mass is its own; from there it fades to the air of the map at its rim. */
export const COLD_CORE_SHARE = 0.5;
/**
 * A mass of cold air nobody holds any more stays where it is and comes back to the air of the map: what parts it
 * from that air is divided by e every this many minutes of the time of the map, in a calm (the clock of its ice and
 * its snow, so that the cold goes as fast as what it froze). A pool of cold air that nothing feeds does not last: it
 * is heavier than the air around it and pours away along the ground at about the square root of g x its depth x
 * its share of density in excess (a few metres a second for a pool a couple of metres deep, a hundred degrees
 * colder), and mixes with the warm air it runs under. Minutes, not hours: an order of magnitude, not a law measured.
 */
export const COLD_WARMS_MINUTES = 1;
/** The wind (km/h) that halves that time: it stirs the cold air into the air of the map. */
export const COLD_MIXING_WIND_KMH = 10;
/** Within this of the air of the map (°C) a mass of cold air is that air: it is gone. */
export const COLD_GONE_DEGREES = 0.5;

/** A mass of cold air lying on a map: around a point (map pixels), `radiusTiles` wide, its air at `temperature` °C. */
export interface ColdMass {
    id: number;
    x: number;
    y: number;
    radiusTiles: number;
    temperature: number;
}

/** The radius of a mass of that size: one out of range is the nearest; a size that is none is the usual one. */
export function coldTiles(radiusTiles: number): number {
    if (!Number.isFinite(radiusTiles) || radiusTiles === 0) return COLD_DEFAULT_TILES;
    return Math.min(COLD_MAX_TILES, Math.max(COLD_MIN_TILES, Math.round(radiusTiles)));
}

/** The temperature of a mass, in whole °C: one out of range is the nearest; none (or 0) is the usual one. */
export function coldCelsius(temperature: number | undefined): number {
    if (temperature === undefined || !Number.isFinite(temperature) || temperature === 0) return COLD_DEFAULT_CELSIUS;
    return Math.min(COLD_MAX_CELSIUS, Math.max(COLD_MIN_CELSIUS, Math.round(temperature)));
}

/**
 * How much of the cold of a mass a point has, from 1 in its core to 0 at its rim and beyond, for a point `away` from
 * its middle in shares of its radius: a smooth edge, the cold air mixing with the air around it.
 */
export function coldShare(away: number): number {
    if (!(away > COLD_CORE_SHARE)) return 1;
    if (away >= 1) return 0;
    const edge = (1 - away) / (1 - COLD_CORE_SHARE);
    return edge * edge * (3 - 2 * edge);
}

/**
 * The temperature of the air at a point of the map (pixels) where the air of the map is at `mapCelsius`: that air
 * outside every mass, brought towards the air of the mass inside one, the coldest where several meet. A mass no
 * colder than the air of the map cools nothing.
 */
export function coldAirAt(masses: Iterable<ColdMass>, x: number, y: number, mapCelsius: number): number {
    let coldest = mapCelsius;
    for (const mass of masses) {
        if (!(mass.temperature < mapCelsius) || !(mass.radiusTiles > 0)) continue;
        const share = coldShare(Math.hypot(x - mass.x, y - mass.y) / (mass.radiusTiles * TILE_PX));
        if (share <= 0) continue;
        const here = mapCelsius + (mass.temperature - mapCelsius) * share;
        if (here < coldest) coldest = here;
    }
    return coldest;
}

/** The air of a point: its temperature (°C), its relative humidity (%) when known, its wind (km/h) when known. */
export interface ColdAir {
    temperature: number;
    humidity?: number;
    windSpeed?: number;
}

/**
 * An air brought to `celsius` without any vapour added: its relative humidity is that of the same vapour at the new
 * temperature, 100 % at most (cooled under its dew point, an air sheds what it cannot hold, as frost or as mist).
 * Its wind is unchanged. The air itself when the temperature is the same, or not a number.
 */
export function airBroughtTo<A extends ColdAir>(air: A, celsius: number): A {
    if (!Number.isFinite(celsius) || celsius === air.temperature) return air;
    const humidity =
        air.humidity !== undefined && Number.isFinite(air.humidity) && Number.isFinite(air.temperature)
            ? Math.min(
                  100,
                  (air.humidity * waterSaturationPressure(air.temperature)) / waterSaturationPressure(celsius),
              )
            : air.humidity;
    return { ...air, temperature: celsius, humidity };
}

/**
 * The air of a point of the map (pixels) under the masses of cold air lying there: the air of the map (`air`)
 * brought to the temperature the masses give that point (coldAirAt). The air of the map itself outside every mass.
 * What the frost of the ground, the frost of the soil and the ice of that point go by: the server reads the same
 * temperature tile by tile (Meadow.readCold), and a browser reads it here from the masses it was told.
 */
export function coldAirOver<A extends ColdAir>(masses: Iterable<ColdMass>, x: number, y: number, air: A): A {
    return airBroughtTo(air, coldAirAt(masses, x, y, air.temperature));
}

/** The time a mass of cold air let go takes to come e times nearer the air of the map, in minutes of the map, in that wind. */
export function coldWarmsMinutes(windSpeed = 0): number {
    const wind = Number.isFinite(windSpeed) && windSpeed > 0 ? windSpeed : 0;
    return COLD_WARMS_MINUTES / (1 + wind / COLD_MIXING_WIND_KMH);
}

/**
 * The air of a mass nobody holds, `mapMinutes` of the time of the map later, under an air of the map at
 * `mapCelsius` and a wind of `windSpeed` km/h: it mixes with it, what parts them divided by e every
 * coldWarmsMinutes. The air of the map itself once it is within COLD_GONE_DEGREES of it; not a number under an air
 * that is not known.
 */
export function warmedCold(temperature: number, mapCelsius: number, mapMinutes: number, windSpeed = 0): number {
    if (!Number.isFinite(mapCelsius) || !Number.isFinite(temperature)) return Number.NaN;
    const minutes = Number.isFinite(mapMinutes) && mapMinutes > 0 ? mapMinutes : 0;
    const warmed = mapCelsius + (temperature - mapCelsius) * Math.exp(-minutes / coldWarmsMinutes(windSpeed));
    return mapCelsius - warmed <= COLD_GONE_DEGREES ? mapCelsius : warmed;
}

/**
 * How long a mass of cold air let go still lies on the map before it is the air of the map again, in minutes of
 * the map: none for one that is no colder than that air, or under an air that is not known.
 */
export function coldGoneInMinutes(temperature: number, mapCelsius: number, windSpeed = 0): number {
    if (!Number.isFinite(mapCelsius) || !Number.isFinite(temperature)) return 0;
    const apart = mapCelsius - temperature;
    return apart <= COLD_GONE_DEGREES ? 0 : coldWarmsMinutes(windSpeed) * Math.log(apart / COLD_GONE_DEGREES);
}
