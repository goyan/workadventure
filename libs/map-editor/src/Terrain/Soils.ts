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

/** Water lying on clay from which it is mud, in pixels; and the moisture of its soil from which it is mud too. */
export const MUD_WATER_PX = 0.5;
export const MUD_MOISTURE = 0.6;
/** How much of one's speed is left on sand, and in the mud of a wet clay. */
export const SAND_PACE = 0.8;
export const MUD_PACE = 0.55;

/**
 * How fast one walks on a soil, as a share of the usual speed: slower on sand, much slower in the mud of a clay the
 * water lies on, or whose soil is wet through. `waterPx` is the water over the cell, `moisture` the moisture of its
 * soil (0 to 1). Every other soil, and a cell not painted: the usual speed.
 */
export function soilPace(code: number, waterPx: number, moisture = 0): number {
    const name = soilName(code);
    if (name === "sand") return SAND_PACE;
    if (name === "clay" && (waterPx >= MUD_WATER_PX || moisture >= MUD_MOISTURE)) return MUD_PACE;
    return 1;
}

/**
 * How rough the ground of a soil is under running water: the n of Manning (s/m^(1/3)), as the tables of hydraulics
 * give it for natural beds. The rougher, the more the ground holds back the water that runs fast or thin over it.
 */
const ROUGHNESS: Record<SoilName, number> = {
    earth: 0.03,
    meadow: 0.045,
    clay: 0.022,
    sand: 0.025,
    rock: 0.04,
    gravel: 0.03,
};
/** The roughness of a cell that was not painted: bare earth. */
export const DEFAULT_SOIL_ROUGHNESS = 0.03;

/** The roughness (Manning's n) of the soil kept as this number. */
export function soilRoughness(code: number): number {
    const name = soilName(code);
    return name ? ROUGHNESS[name] : DEFAULT_SOIL_ROUGHNESS;
}
