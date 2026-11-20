import { Season } from "@workadventure/map-editor";

/** A colour: red, green, blue, 0 to 255. */
export type Rgb = readonly [number, number, number];
/** Four shades of a material, from the darkest to the lightest. */
export type Ramp = readonly [Rgb, Rgb, Rgb, Rgb];
/** What covers the ground at a point. */
export type Material =
    | "grass"
    | "earth"
    | "meadow"
    | "clay"
    | "sand"
    | "rock"
    | "gravel"
    | "straw"
    | "ash"
    | "ember"
    | "snow"
    | "mud";

function ramp(...shades: [string, string, string, string]): Ramp {
    const [a, b, c, d] = shades.map((shade): Rgb => {
        const value = parseInt(shade.slice(1), 16);
        return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
    });
    return [a, b, c, d];
}

const ASH = ramp("#1c1916", "#2b2621", "#3d362f", "#524940");

/** The shades of each material and of the face of a drop: the ones of the mock-ups, to tune in the game. */
export const RAMPS: Record<Material | "wall" | "water", Ramp> = {
    grass: ramp("#3b6431", "#4f833c", "#69a046", "#89bd58"),
    meadow: ramp("#5a5a2e", "#74743c", "#90904c", "#aeab62"),
    earth: ramp("#4e3524", "#6a4a32", "#865f42", "#a27a57"),
    clay: ramp("#7a4a33", "#96603f", "#b0784e", "#c89263"),
    sand: ramp("#a98c58", "#c9ab70", "#e0c78e", "#f0dfae"),
    rock: ramp("#3e3c3a", "#5e5b57", "#7e7a74", "#a29d95"),
    gravel: ramp("#5c5650", "#7a736b", "#989088", "#b8b0a6"),
    straw: ramp("#a88c3a", "#c4a64a", "#dcc066", "#ecd88a"),
    ash: ASH,
    // Embers are ash with glowing points (GroundPixel).
    ember: ASH,
    snow: ramp("#b9c6d6", "#d3dde8", "#e8eef5", "#fbfdff"),
    wall: ramp("#463b33", "#5e5146", "#7a6a5a", "#9c8a74"),
    // Wet clay, where the walk slows down (reflections of water: GroundPixel).
    mud: ramp("#2f2018", "#45301f", "#5c4129", "#735437"),
    // The water of the relief, from the deep to the shallow (WaterPixel); its shades change with the season.
    water: ramp("#244f78", "#2f6596", "#3f7fb3", "#5b9bcc"),
};

/** What changes with the season (the mock-ups of the seasons): the grass, and the sand of the summer. */
const SEASON_RAMPS: Record<Season, Partial<Record<Material | "water", Ramp>>> = {
    [Season.Spring]: { grass: ramp("#3f7032", "#55923d", "#72b34b", "#98d065") },
    [Season.Summer]: {
        grass: ramp("#4a6a2c", "#64883a", "#86a849", "#b3c36a"),
        sand: ramp("#b39860", "#d4b97c", "#ead39c", "#f7e9c0"),
        water: ramp("#1f5c7c", "#2a7598", "#3b93b4", "#5fb5cf"),
    },
    [Season.Autumn]: {
        grass: ramp("#4a5a2a", "#647036", "#848a45", "#a8a35a"),
        water: ramp("#1f4466", "#295a84", "#38709c", "#5288b8"),
    },
    [Season.Winter]: {
        grass: ramp("#4f6a48", "#6b8460", "#8aa07c", "#a9ba9a"),
        water: ramp("#2c5677", "#3b6e93", "#5288ad", "#8db5d0"),
    },
};
const seasonRamps = new Map<Season, Record<Material | "wall" | "water", Ramp>>();

/** The shades of the materials in a season; without a season, RAMPS. */
export function rampsFor(season: Season | undefined): Record<Material | "wall" | "water", Ramp> {
    if (season === undefined) return RAMPS;
    let ramps = seasonRamps.get(season);
    if (!ramps) {
        ramps = { ...RAMPS, ...SEASON_RAMPS[season] };
        seasonRamps.set(season, ramps);
    }
    return ramps;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The threshold of the 4 × 4 ordered dither at a pixel, in (0, 1). */
export function bayer(x: number, y: number): number {
    return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** The shade of a ramp for a value (0 dark to 1 light) at a pixel: between two shades, the dither picks one. */
export function shadeAt(shades: Ramp, value: number, x: number, y: number): Rgb {
    return shades[Math.max(0, Math.min(3, Math.round(value * 3 + bayer(x, y) - 0.5)))];
}
