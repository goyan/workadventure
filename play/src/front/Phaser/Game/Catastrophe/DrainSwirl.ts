/** How long the water at the rim of a drain takes to turn once around it, in milliseconds. */
export const DRAIN_TURN_MS = 2400;
/** How many times faster the water turns next to the eye than at the rim. */
const EYE_SPEED = 4;
/** How close to the middle the water is drawn, in shares of the radius: the eye is beyond. */
const EYE = 0.1;
/** The golden ratio and angle: strands set apart by them never line up, around the disc nor across it. */
const GOLDEN_SHARE = 0.6180339887498949;
const GOLDEN_TURN = 2.399963229728653;
const POINTS_PER_STRAND = 10;

/** A wisp of water turning in a drain: a curved line, a tone from 0 (deep blue) to 3 (white foam), and its looks. */
export interface DrainStrand {
    /** From its outer end to its inner end, in shares of the radius of the disc (-1 to 1). */
    points: { x: number; y: number }[];
    tone: number;
    alpha: number;
    /** How wide it is drawn, in shares of the radius. */
    width: number;
}

/** A share from 0 to 1 that only depends on a strand and on which of its traits is asked. */
function traitOf(index: number, trait: number): number {
    return (index * GOLDEN_SHARE * (trait + 1) + trait * 0.37) % 1;
}

/**
 * The water of a drain seen from above, like a whirlpool: `count` wisps that curl around the eye, each a piece of a
 * spiral falling inwards. They are spread over the whole disc, the outer ones long, wide and faint, the inner ones
 * short, thin and bright. Each turns around the middle at the pace of where it is: once every `DRAIN_TURN_MS` at
 * the rim, `EYE_SPEED` times faster next to the eye. Always the same for the same time; still for who asked for less
 * motion.
 */
export function drainStrands(elapsedMs: number, count: number, reduced: boolean): DrainStrand[] {
    const strands: DrainStrand[] = [];
    for (let index = 0; index < count; index++) {
        // Where the strand begins, from the eye to the rim, and how far it falls and turns along its length.
        const outer = EYE + 0.12 + (1 - EYE - 0.12) * traitOf(index, 0);
        const inner = Math.max(EYE, outer * (0.45 + 0.3 * traitOf(index, 1)));
        const winds = (0.22 + 0.4 * traitOf(index, 2)) * Math.PI * 2;
        const middle = (outer + inner) / 2;
        const pace = 1 + (EYE_SPEED - 1) * (1 - middle);
        const turned = reduced ? 0 : (elapsedMs / DRAIN_TURN_MS) * Math.PI * 2 * pace;
        const from = index * GOLDEN_TURN + turned;
        const points: { x: number; y: number }[] = [];
        for (let step = 0; step < POINTS_PER_STRAND; step++) {
            const along = step / (POINTS_PER_STRAND - 1);
            const radius = outer + (inner - outer) * along;
            const angle = from + winds * along;
            points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        strands.push({
            points,
            tone: Math.min(3, Math.floor(traitOf(index, 3) * 4)),
            // Soft at the rim: the whirl has no edge, it fades into the water around.
            alpha: (0.35 + 0.5 * traitOf(index, 4)) * Math.min(1, (1.02 - outer) * 3.5),
            width: 0.025 + 0.07 * middle,
        });
    }
    return strands;
}

/**
 * The funnel of a drain seen from above: discs laid one over the other from the rim to the eye, each a share of
 * the radius and how dark it is. Hardly anything at the rim, so that the whirl has no edge, and the water looks
 * deeper and deeper towards the middle.
 */
export function drainRings(): { radius: number; alpha: number }[] {
    return [
        { radius: 1, alpha: 0.05 },
        { radius: 0.86, alpha: 0.09 },
        { radius: 0.7, alpha: 0.14 },
        { radius: 0.54, alpha: 0.2 },
        { radius: 0.38, alpha: 0.3 },
        { radius: 0.24, alpha: 0.45 },
        { radius: 0.13, alpha: 0.7 },
    ];
}
