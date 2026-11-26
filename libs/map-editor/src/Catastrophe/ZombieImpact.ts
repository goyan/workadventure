import { TERRAIN_CELL } from "../types";
import { METEOR_FALL_MS, meteorShape } from "./Meteor";
import { ZOMBIE_INPUT_DELAY_MS, zombieStepAt } from "./ZombieHorde";
import type { ZombieHorde } from "./ZombieHorde";

/**
 * A comet or a burning meteor that lands in a horde of zombies: the zombies in its crater are thrown up and away,
 * burning, and are gone, as by a grenade; those of a ring around it are shoved away, the more the nearer. The server
 * alone decides it (who launched it plays no part): it goes in the log of the horde, at the step it lands at, so that
 * the server and every browser kill the same zombies. Its water and its wave kill none: a zombie never dies in water.
 *
 * While a horde goes on, a meteor falls until a step every browser can still be told: the log is promised complete
 * ZOMBIE_INPUT_DELAY_MS ahead (safeStep), so it falls that long (about 2.5 s) instead of METEOR_FALL_MS, its water,
 * its fire and its drawing with it. Its fall follows the time of reality: should the speed of the map change while it
 * falls, the zombies fall a little before or after it lands (the same everywhere still).
 */
export interface ZombieImpact {
    /** Where it lands, map pixels (whole), and the radius of its crater in tiles (meteorShape). */
    x: number;
    y: number;
    radiusTiles: number;
}

/** The ring an impact shoves goes this many times the radius of its crater: as a grenade (15 m for 5 m). */
export const ZOMBIE_IMPACT_BLAST_TIMES = 3;

/** The impact of a meteor of that size at that point, as the log tells it: whole pixels, a crater a meteor may have. */
export function zombieImpactOf(x: number, y: number, radiusTiles: number): ZombieImpact {
    return { x: Math.round(x), y: Math.round(y), radiusTiles: meteorShape(radiusTiles).radiusTiles };
}

/** How far an impact kills (its crater, as the water takes it) and how far it shoves, map pixels. */
export function zombieImpactRadii(impact: Pick<ZombieImpact, "radiusTiles">): { lethal: number; blast: number } {
    const lethal = meteorShape(impact.radiusTiles).discCells * TERRAIN_CELL;
    return { lethal, blast: lethal * ZOMBIE_IMPACT_BLAST_TIMES };
}

/**
 * The longest a meteor falls into a horde (ms): the log is promised further only for a while after the map was slowed
 * down (the steps promised at ten times the speed of reality then last ten times longer).
 */
export const ZOMBIE_IMPACT_LONGEST_FALL_MS = ZOMBIE_INPUT_DELAY_MS + 1000;

/**
 * When a meteor launched at `now` (ms, the time of the server) lands in a horde: the step of the log it is applied
 * at, never one already promised (after safeStep), and how long it falls (ms), to the time of that step. A step is
 * applied when its time comes (ZombieCrowd.step), so the zombies fall as the meteor lands. Undefined when it would
 * fall longer than ZOMBIE_IMPACT_LONGEST_FALL_MS: it then falls as usual, and kills no zombie.
 */
export function zombieImpactFall(
    horde: Pick<ZombieHorde, "anchorStep" | "anchorAt" | "msPerStep" | "safeStep">,
    now: number,
): { applyStep: number; fallMs: number } | undefined {
    const landsAt = now + Math.max(METEOR_FALL_MS, ZOMBIE_INPUT_DELAY_MS);
    const applyStep = Math.max(Math.ceil(zombieStepAt(horde, landsAt)), horde.safeStep + 1);
    const at = horde.anchorAt + (applyStep - horde.anchorStep) * horde.msPerStep;
    const fallMs = Math.max(METEOR_FALL_MS, Math.ceil(at - now));
    return fallMs <= ZOMBIE_IMPACT_LONGEST_FALL_MS ? { applyStep, fallMs } : undefined;
}
