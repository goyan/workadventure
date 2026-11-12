/** The flame in the hand is drawn 30 times a second: smooth, apart from the 15 steps of the light (see TorchFlicker). */
export const TORCH_FLAME_FRAMES_PER_SECOND = 30;

/** An ember rising from the flame: where it is from the base of the flame, in pixels, and how bright. */
export interface TorchEmber {
    x: number;
    y: number;
    alpha: number;
}

/**
 * The shape of the flame in the hand: how far its tip leans sideways (pixels), how tall and how wide it is (from its
 * usual size), and the ember that may be rising. The shape moves, not the brightness: the light of the torch keeps its
 * own soft flicker.
 */
export interface TorchFlameShape {
    sway: number;
    height: number;
    width: number;
    ember: TorchEmber | undefined;
}

/**
 * Waves of frequencies with no common measure (Hz), so that the flame never repeats a short loop. Their weights add up
 * to 1: each sum stays between -1 and 1.
 */
const SWAY_WAVES = [
    { hertz: 1.73, weight: 0.5 },
    { hertz: 2.91, weight: 0.3 },
    { hertz: 4.37, weight: 0.2 },
];
const HEIGHT_WAVES = [
    { hertz: 2.23, weight: 0.6 },
    { hertz: 3.67, weight: 0.4 },
];
const WIDTH_WAVES = [
    { hertz: 1.97, weight: 0.55 },
    { hertz: 3.13, weight: 0.45 },
];
const SWAY_PX = 1.8;
const HEIGHT_CHANGE = 0.13;
const WIDTH_CHANGE = 0.1;
/** One ember every so often, rising for a while above the tip of the flame. */
const EMBER_PERIOD_MS = 1700;
const EMBER_LIFE_MS = 700;
const EMBER_RISE_PX = 12;
/** The tip of the flame, from its base (see TorchFlameEffect). */
const FLAME_TIP_PX = 9;

const STILL: TorchFlameShape = { sway: 0, height: 1, width: 1, ember: undefined };

function waves(list: readonly { hertz: number; weight: number }[], seconds: number, phase: number): number {
    let sum = 0;
    list.forEach(({ hertz, weight }, index) => {
        sum += weight * Math.sin(2 * Math.PI * (hertz * seconds + phase * (index + 2)));
    });
    return sum;
}

/**
 * The flame at a time, for a bearer whose `phase` (0 to 1, see torchFlickerPhase) shifts its waves: two flames side by
 * side do not move as one. A still flame with no ember when the system asks for less motion.
 */
export function torchFlameShape(timeMs: number, phase: number, reducedMotion: boolean): TorchFlameShape {
    if (reducedMotion) {
        return STILL;
    }
    const seconds = timeMs / 1000;
    // The ember of each period rises, then fades out; it fades in and out smoothly, never as a flash.
    const sinceEmber = (timeMs + phase * EMBER_PERIOD_MS) % EMBER_PERIOD_MS;
    const life = sinceEmber / EMBER_LIFE_MS;
    const ember =
        life < 1
            ? {
                  x: Math.sin(2 * Math.PI * (life + phase)) * 1.5,
                  y: -FLAME_TIP_PX - life * EMBER_RISE_PX,
                  alpha: Math.sin(Math.PI * life),
              }
            : undefined;
    return {
        sway: SWAY_PX * waves(SWAY_WAVES, seconds, phase),
        height: 1 + HEIGHT_CHANGE * waves(HEIGHT_WAVES, seconds, phase + 0.37),
        width: 1 + WIDTH_CHANGE * waves(WIDTH_WAVES, seconds, phase + 0.71),
        ember,
    };
}

/** The step of the drawing of the flame a time falls in: the flame is drawn again when it changes. */
export function torchFlameStep(timeMs: number): number {
    return Math.floor((timeMs * TORCH_FLAME_FRAMES_PER_SECOND) / 1000);
}
