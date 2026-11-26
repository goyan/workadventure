import { z } from "zod";
import { SPECIES_IDS } from "./Species";

/**
 * An animal of the water of the relief, as the server keeps and saves it. Positions are in map pixels, so an animal
 * stays where it is when the grid of the water is rebuilt; times are absolute (milliseconds).
 */
export const Animal = z.object({
    id: z.number().int().min(1),
    kind: z.enum(SPECIES_IDS),
    /** Males and females; fish are blue and pink. A dolphin kept from before dolphins had a sex gets one. */
    sex: z.enum(["male", "female"]).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    bornAt: z.number().finite(),
    /** How long it lives. */
    lifespanMs: z.number().positive(),
    /** When it may next mate (fish) or hunt (dolphin). */
    readyAt: z.number().finite(),
    /** Where it swims to, and how fast (map pixels a second). */
    targetX: z.number().finite().optional(),
    targetY: z.number().finite().optional(),
    speed: z.number().finite().optional(),
    /** Since when its cell holds too little water. */
    dryAt: z.number().finite().optional(),
    /** Dolphin: since when it hunts without a catch. */
    huntSince: z.number().finite().optional(),
    /** Dolphin: when it may next have a calf, when it last ate, and how many fish it ate since its last calf. */
    mateAt: z.number().finite().optional(),
    ateAt: z.number().finite().optional(),
    meals: z.number().int().min(0).optional(),
    /** Until when it wanders instead of going to a mate or a prey it could not reach in a straight line. */
    wanderUntil: z.number().finite().optional(),
    /** Lion, tiger: the tree it lives around, in map pixels. */
    homeX: z.number().finite().optional(),
    homeY: z.number().finite().optional(),
    /** On land: when it next goes to drink, until when it drinks, and since when it looks for water. */
    drinkAt: z.number().finite().optional(),
    drinkUntil: z.number().finite().optional(),
    thirstySince: z.number().finite().optional(),
    /** Antelope of a herd: until when it stands and grazes before its next few steps. */
    restUntil: z.number().finite().optional(),
    /** Gull: since when it stands on a shore; undefined while it flies. */
    perchedAt: z.number().finite().optional(),
    /**
     * The player it follows (their user id, which lasts as long as their connection): it is then out of the life
     * (see Taming). Never kept over a restart of the server.
     */
    tamedBy: z.number().int().optional(),
});
export type Animal = z.infer<typeof Animal>;

/** The times an animal keeps, each a moment of the clock of the room. */
const CLOCKS = [
    "bornAt",
    "readyAt",
    "dryAt",
    "huntSince",
    "mateAt",
    "ateAt",
    "wanderUntil",
    "drinkAt",
    "drinkUntil",
    "thirstySince",
    "restUntil",
    "perchedAt",
] as const satisfies readonly (keyof Animal)[];

/**
 * The animal as if `ms` of the clock had not passed for it: its age, its hunger, its next calf, all that long later.
 * The time a room missed beyond what it lives again (AquaticLifeManager) leaves its animals as they were.
 */
export function delayAnimal(animal: Animal, ms: number): void {
    for (const clock of CLOCKS) {
        const at = animal[clock];
        if (at !== undefined) animal[clock] = at + ms;
    }
}
