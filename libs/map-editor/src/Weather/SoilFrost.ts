import type { PrecipitationAir } from "./Precipitation";

/** At and under this air temperature (°C) the top of the soil is wholly frozen. */
export const SOIL_FROZEN_UNDER = -1;
/** At and above this air temperature (°C) the soil is not frozen at all; it freezes gradually in between. */
export const SOIL_THAWED_FROM = 1;

/**
 * How frozen the top of the soil is, from 0 (thawed) to 1 (frozen), for an air temperature in °C. Frozen water stays
 * where it is: it neither evaporates, nor seeps away, nor feeds the grass, which lies dormant. A ramp rather than a
 * switch at 0 °C, so that an air hovering around the freezing point does not flip the soil at every step. Not frozen
 * when the temperature is not a number.
 */
export function soilFrost(temperature: number | undefined): number {
    if (temperature === undefined || !Number.isFinite(temperature)) return 0;
    return Math.min(1, Math.max(0, (SOIL_THAWED_FROM - temperature) / (SOIL_THAWED_FROM - SOIL_FROZEN_UNDER)));
}

/** How frozen the soil is under the conditions of a room; not frozen while they are not known. */
export function soilFrostOf(air: PrecipitationAir | undefined): number {
    return air ? soilFrost(air.temperature) : 0;
}
