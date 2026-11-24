import {
    DOLPHIN_SPEED_FACTOR,
    MAX_ANIMALS,
    MAX_ANTELOPES,
    MAX_DOLPHINS,
    MAX_GULLS,
    MAX_LAND_PREDATORS,
    MEALS_FOR_CALF,
    STARVE_HUNTS,
} from "./LifeConstants";
import { DRY_LAND_PX, WADE_DEPTH_PX } from "./LandPlaces";
import type { GroupKind } from "./Groups";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX } from "./WaterBodies";

/** The species the life of a map knows, in the order its rules go through them. */
export const SPECIES_IDS = ["fish", "dolphin", "antelope", "lion", "tiger", "gull"] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

/** The number of a species in the messages. Never reuse one: the browsers and the saved histories keep them. */
export const SPECIES_WIRE: Record<SpeciesId, number> = {
    fish: 0,
    dolphin: 1,
    antelope: 2,
    lion: 3,
    tiger: 4,
    gull: 5,
};

/** What the rules of the life need to know of a species. */
export interface Species {
    id: SpeciesId;
    habitat: "water" | "land" | "air";
    /** The least water it lives in, in pixels (0 on land). */
    minDepthPx: number;
    /** On land: the water it does not go into, in pixels. */
    maxDepthPx?: number;
    /** The predators it runs from when one comes within `fleeRadiusPx` (as from an avatar). */
    flees: readonly SpeciesId[];
    fleeRadiusPx: number;
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
    /** Whether a player may tame one (see Taming): it then lets an avatar come close while it is fed. */
    tamable: boolean;
    /** How its kind lives together (see Groups); undefined for a species whose animals live each on its own. */
    group?: GroupKind;
}

export const SPECIES: Record<SpeciesId, Species> = {
    fish: {
        id: "fish",
        habitat: "water",
        minDepthPx: FISH_DEPTH_PX,
        prey: [],
        flees: ["lion", "tiger"],
        fleeRadiusPx: 96,
        speedFactor: 1,
        litter: [2, 4],
        mealsForYoung: 0,
        starveHunts: undefined,
        roomCap: MAX_ANIMALS,
        tamable: false,
    },
    dolphin: {
        id: "dolphin",
        habitat: "water",
        minDepthPx: DOLPHIN_DEPTH_PX,
        prey: ["fish"],
        flees: [],
        fleeRadiusPx: 0,
        speedFactor: DOLPHIN_SPEED_FACTOR,
        litter: [1, 1],
        mealsForYoung: MEALS_FOR_CALF,
        starveHunts: STARVE_HUNTS,
        roomCap: MAX_DOLPHINS,
        tamable: false,
    },
    antelope: {
        id: "antelope",
        habitat: "land",
        minDepthPx: 0,
        maxDepthPx: DRY_LAND_PX,
        prey: [],
        flees: ["lion", "tiger"],
        fleeRadiusPx: 96,
        speedFactor: 1.2,
        litter: [1, 2],
        mealsForYoung: 0,
        starveHunts: undefined,
        roomCap: MAX_ANTELOPES,
        tamable: false,
        group: "herd",
    },
    lion: {
        id: "lion",
        habitat: "land",
        minDepthPx: 0,
        maxDepthPx: WADE_DEPTH_PX,
        // A gull only while it is landed (see Gulls): the tiger leaves them alone.
        prey: ["antelope", "fish", "gull"],
        flees: [],
        fleeRadiusPx: 0,
        speedFactor: 1.6,
        litter: [1, 1],
        mealsForYoung: 2,
        starveHunts: STARVE_HUNTS,
        roomCap: MAX_LAND_PREDATORS,
        tamable: true,
        group: "pride",
    },
    tiger: {
        id: "tiger",
        habitat: "land",
        minDepthPx: 0,
        maxDepthPx: WADE_DEPTH_PX,
        prey: ["antelope", "fish"],
        flees: [],
        fleeRadiusPx: 0,
        speedFactor: 1.6,
        litter: [1, 1],
        mealsForYoung: 2,
        starveHunts: STARVE_HUNTS,
        roomCap: MAX_LAND_PREDATORS,
        tamable: true,
    },
    gull: {
        id: "gull",
        // Over the water and the land alike: nothing stops it (see Gulls).
        habitat: "air",
        minDepthPx: 0,
        prey: ["fish"],
        flees: [],
        fleeRadiusPx: 0,
        speedFactor: 2,
        litter: [1, 2],
        mealsForYoung: 3,
        starveHunts: STARVE_HUNTS,
        roomCap: MAX_GULLS,
        tamable: false,
    },
};

export const isPredator = (species: Species): boolean => species.prey.length > 0;

/** The kind of an animal in the messages: two for each species, the male then the female. */
export const wireKindOf = (species: SpeciesId, sex: "male" | "female"): number =>
    2 * SPECIES_WIRE[species] + (sex === "female" ? 1 : 0);
