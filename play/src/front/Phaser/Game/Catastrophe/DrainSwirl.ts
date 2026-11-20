/** How long the whirl of a drain takes to turn once, in milliseconds. */
export const DRAIN_TURN_MS = 1000;
const ARMS = 3;
const POINTS_PER_ARM = 12;
/** How far an arm winds around the middle from the rim, in turns. */
const WINDING_TURNS = 0.75;

/**
 * The arms of the whirl over a drain: each a line of points from the rim to the middle, in shares of the half side
 * of the square (-1 to 1). It turns once every `DRAIN_TURN_MS`; still for who asked for less motion.
 */
export function drainSwirl(elapsedMs: number, reduced: boolean): { x: number; y: number }[][] {
    const turned = reduced ? 0 : ((elapsedMs % DRAIN_TURN_MS) / DRAIN_TURN_MS) * Math.PI * 2;
    const arms: { x: number; y: number }[][] = [];
    for (let arm = 0; arm < ARMS; arm++) {
        const from = turned + (arm / ARMS) * Math.PI * 2;
        const points: { x: number; y: number }[] = [];
        for (let step = 0; step < POINTS_PER_ARM; step++) {
            const along = step / (POINTS_PER_ARM - 1);
            const radius = 1 - along * 0.9;
            const angle = from + along * WINDING_TURNS * Math.PI * 2;
            points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        arms.push(points);
    }
    return arms;
}
