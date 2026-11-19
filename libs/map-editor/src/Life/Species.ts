import { DOLPHIN_SPEED_FACTOR, MAX_ANIMALS, MAX_DOLPHINS, MEALS_FOR_CALF, STARVE_HUNTS } from "./LifeConstants";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "./WaterBodies";

/** The species the life of a map knows, in the order its rules go through them. */
export const SPECIES_IDS = ["fish", "dolphin"] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

/** The number of a species in the messages. Never reuse one: the browsers and the saved histories keep them. */
export const SPECIES_WIRE: Record<SpeciesId, number> = { fish: 0, dolphin: 1 };

/** What the rules of the life need to know of a species. */
export interface Species {
    id: SpeciesId;
    habitat: "water" | "land" | "air";
    /** The least water it lives in, in pixels. */
    minDepthPx: number;
    /** The species it eats: none for a prey. */
    prey: readonly SpeciesId[];
    /** How many times faster than the speed of the map it goes at its fastest. */
    speedFactor: number;
    /** The smallest and the largest litter. */
    litter: readonly [number, number];
    /** How many meals it needs since its last young to have another. */
    mealsForYoung: number;
    /** It dies of hunger after this many hunting intervals without a catch; undefined when it never starves. */
    starveHunts: number | undefined;
    /** The most of them a room holds. */
    roomCap: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
    fish: {
        id: "fish",
        habitat: "water",
        minDepthPx: FISH_DEPTH_PX,
        prey: [],
        speedFactor: 1,
        litter: [2, 4],
        mealsForYoung: 0,
        starveHunts: undefined,
        roomCap: MAX_ANIMALS,
    },
    dolphin: {
        id: "dolphin",
        habitat: "water",
        minDepthPx: DOLPHIN_DEPTH_PX,
        prey: ["fish"],
        speedFactor: DOLPHIN_SPEED_FACTOR,
        litter: [1, 1],
        mealsForYoung: MEALS_FOR_CALF,
        starveHunts: STARVE_HUNTS,
        roomCap: MAX_DOLPHINS,
    },
};

export const isPredator = (species: Species): boolean => species.prey.length > 0;

/** The kind of an animal in the messages: two for each species, the male then the female. */
export const wireKindOf = (species: SpeciesId, sex: "male" | "female"): number =>
    2 * SPECIES_WIRE[species] + (sex === "female" ? 1 : 0);
