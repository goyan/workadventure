import { z } from "zod";

/**
 * An animal of the water of the relief, as the server keeps and saves it. Positions are in map pixels, so an animal
 * stays where it is when the grid of the water is rebuilt; times are absolute (milliseconds).
 */
export const Animal = z.object({
    id: z.number().int().min(1),
    kind: z.enum(["fish", "dolphin"]),
    /** Fish only: males are blue, females pink. */
    sex: z.enum(["male", "female"]).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    bornAt: z.number().finite(),
    /** How long it lives; a dolphin does not die of age. */
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
    /** Until when it wanders instead of going to a mate or a prey it could not reach in a straight line. */
    wanderUntil: z.number().finite().optional(),
});
export type Animal = z.infer<typeof Animal>;
