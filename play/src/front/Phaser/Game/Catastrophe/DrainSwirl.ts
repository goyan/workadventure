/** How long the arms of the whirl of a drain take to turn once, in milliseconds. */
export const DRAIN_TURN_MS = 1500;
export const DRAIN_ARMS = 5;
const POINTS_PER_ARM = 16;
/** How far an arm winds around the middle from the rim, in turns. */
const WINDING_TURNS = 1.1;
/** How close to the middle an arm and a streak of water end, in shares of the radius: the eye is beyond. */
const EYE = 0.08;

/**
 * The arms of foam of the whirl over a drain, seen from above: each a line of points from the rim to the eye, in
 * shares of the radius of the disc (-1 to 1). They turn together, once every `DRAIN_TURN_MS`; still for who asked
 * for less motion.
 */
export function drainSwirl(elapsedMs: number, reduced: boolean): { x: number; y: number }[][] {
    const turned = reduced ? 0 : ((elapsedMs % DRAIN_TURN_MS) / DRAIN_TURN_MS) * Math.PI * 2;
    const arms: { x: number; y: number }[][] = [];
    for (let arm = 0; arm < DRAIN_ARMS; arm++) {
        const from = turned + (arm / DRAIN_ARMS) * Math.PI * 2;
        const points: { x: number; y: number }[] = [];
        for (let step = 0; step < POINTS_PER_ARM; step++) {
            const along = step / (POINTS_PER_ARM - 1);
            const radius = 1 - along * (1 - EYE);
            const angle = from + along * WINDING_TURNS * Math.PI * 2;
            points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        arms.push(points);
    }
    return arms;
}

/** How long a streak of water takes from the rim of a drain to its eye, in milliseconds. */
const STREAK_FALL_MS = 1800;
/** The golden ratio and angle: streaks set apart by them never line up, in time nor around the disc. */
const GOLDEN_SHARE = 0.6180339887498949;
const GOLDEN_TURN = 2.399963229728653;
/** How much of its fall a streak leaves behind it as a tail. */
const STREAK_TAIL = 0.05;
/** How far a streak turns around the middle on its way in: slowly at the rim, ever faster as it falls. */
const STREAK_RIM_TURNS = 0.4;
const STREAK_EYE_TURNS = 1.8;

function streakAt(start: number, fall: number): { x: number; y: number } {
    const radius = 1 - fall * (1 - EYE);
    const angle = start + (STREAK_RIM_TURNS * fall + STREAK_EYE_TURNS * fall * fall) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * The water that turns around a drain and falls into it: `count` short streaks, each where it is `elapsedMs` after
 * the drain opened, with the place it just left (its tail) and how bright it is. In shares of the radius of the
 * disc. A streak is born at the rim, turns faster and faster as it nears the eye, fades there and is born again at
 * the rim. Always the same for the same time; still for who asked for less motion.
 */
export function drainStreaks(
    elapsedMs: number,
    count: number,
    reduced: boolean,
): { x: number; y: number; tailX: number; tailY: number; alpha: number }[] {
    const time = reduced ? 0 : elapsedMs / STREAK_FALL_MS;
    const streaks: { x: number; y: number; tailX: number; tailY: number; alpha: number }[] = [];
    for (let index = 0; index < count; index++) {
        const fall = (time + index * GOLDEN_SHARE) % 1;
        const start = index * GOLDEN_TURN;
        const head = streakAt(start, fall);
        const tail = streakAt(start, Math.max(0, fall - STREAK_TAIL));
        streaks.push({
            x: head.x,
            y: head.y,
            tailX: tail.x,
            tailY: tail.y,
            alpha: Math.min(1, fall * 8) * Math.min(1, (1 - fall) * 5),
        });
    }
    return streaks;
}

/**
 * The funnel of a drain seen from above: discs laid one over the other from the rim to the eye, each a share of
 * the radius and how dark it is. The water looks deeper and deeper towards the middle.
 */
export function drainRings(): { radius: number; alpha: number }[] {
    return [
        { radius: 1, alpha: 0.14 },
        { radius: 0.78, alpha: 0.2 },
        { radius: 0.56, alpha: 0.28 },
        { radius: 0.36, alpha: 0.38 },
        { radius: 0.18, alpha: 0.55 },
    ];
}

/**
 * The ragged rim of foam of a drain: how far from the middle the rim is at each of `points` points evenly spaced
 * around it, in shares of the radius. It ripples with the time; still for who asked for less motion.
 */
export function drainRim(elapsedMs: number, points: number, reduced: boolean): number[] {
    const phase = reduced ? 0 : elapsedMs / 400;
    const rim: number[] = [];
    for (let point = 0; point < points; point++) {
        const around = (point / points) * Math.PI * 2;
        rim.push(1 + 0.035 * Math.sin(around * 7 + phase) + 0.02 * Math.sin(around * 13 - phase * 1.7));
    }
    return rim;
}
