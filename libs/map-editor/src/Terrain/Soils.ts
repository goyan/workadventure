/**
 * The soils of the ground of a map, painted cell by cell with the relief tool. A soil is kept in the map as its rank
 * here plus one; 0 is a cell that was not painted, which behaves as the ground did before the soils.
 */
export const SOILS = ["earth", "meadow", "clay", "sand", "rock", "gravel"] as const;
export type SoilName = (typeof SOILS)[number];

/** The number a soil is kept as in a map. */
export function soilCode(name: SoilName): number {
    return SOILS.indexOf(name) + 1;
}

/** The soil kept as this number; undefined for a cell not painted, or a number no soil has. */
export function soilName(code: number): SoilName | undefined {
    return Number.isInteger(code) && code >= 1 ? SOILS[code - 1] : undefined;
}

/** The largest number a soil is kept as. */
export const MAX_SOIL_CODE = SOILS.length;

/**
 * How much of the absorption of the map a soil drinks from the water lying on it: on the flat (the sheet of a flood)
 * and in a hollow (a pond, a lake). Rock drinks nothing and clay nearly nothing: a flood stands on them. Sand and
 * gravel drink fast, in a hollow too: a pond dug in them does not hold.
 */
const DRINKS: Record<SoilName, { flat: number; hollow: number }> = {
    earth: { flat: 1, hollow: 0 },
    meadow: { flat: 1, hollow: 0 },
    clay: { flat: 0.1, hollow: 0 },
    sand: { flat: 5, hollow: 5 },
    rock: { flat: 0, hollow: 0 },
    gravel: { flat: 5, hollow: 5 },
};

/** The share of the absorption of the map the soil of a cell drinks. A cell not painted: all of it on the flat, nothing in a hollow. */
export function soilDrinks(code: number, hollow: boolean): number {
    const name = soilName(code);
    if (!name) return hollow ? 0 : 1;
    return hollow ? DRINKS[name].hollow : DRINKS[name].flat;
}
