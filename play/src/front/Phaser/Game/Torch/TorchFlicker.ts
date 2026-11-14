/** The dimmest the flame gets, as a share of its full light. */
export const TORCH_FLICKER_MIN = 0.8;

/**
 * Three slow waves (all under 1 Hz), weighted so that together they span exactly from TORCH_FLICKER_MIN to 1. Slow
 * waves keep the flicker soft for photosensitivity (WCAG 2.3.1): no abrupt change from light to dark, and well under
 * three marked variations a second.
 */
const WAVES: readonly { hertz: number; weight: number }[] = [
    { hertz: 0.37, weight: 0.45 },
    { hertz: 0.61, weight: 0.33 },
    { hertz: 0.89, weight: 0.22 },
];

/**
 * How bright a torch is at a time, from TORCH_FLICKER_MIN to 1. `phase` (0 to 1) shifts the waves, so that two torches
 * lit together do not flicker as one. A steady full light when the system asks for less motion.
 */
export function torchFlicker(timeMs: number, phase: number, reducedMotion: boolean): number {
    if (reducedMotion) {
        return 1;
    }
    const seconds = timeMs / 1000;
    let wave = 0;
    WAVES.forEach(({ hertz, weight }, index) => {
        wave += weight * Math.sin(2 * Math.PI * (hertz * seconds + phase * (index + 1)));
    });
    // `wave` is between -1 and 1 (the weights add up to 1).
    return TORCH_FLICKER_MIN + ((1 - TORCH_FLICKER_MIN) * (wave + 1)) / 2;
}

/** The flicker moves 15 times a second: soft enough to look alive, and the scene is not rendered at every image. */
export const TORCH_FLICKER_STEPS_PER_SECOND = 15;

/** The start of the flicker step a time falls in: the torches are lit with the flicker of that time. */
export function torchFlickerStep(timeMs: number): number {
    return (Math.floor((timeMs * TORCH_FLICKER_STEPS_PER_SECOND) / 1000) * 1000) / TORCH_FLICKER_STEPS_PER_SECOND;
}

/** A phase from 0 to 1 that stays the same for an id: each bearer's torch flickers in its own way. */
export function torchFlickerPhase(id: string): number {
    let hash = 0;
    for (let index = 0; index < id.length; index++) {
        hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return (hash % 1000) / 1000;
}

/** How fast a torch dims or brightens when its bearer changes its intensity: from 10 % to 100 % in one second. */
const TORCH_FADE_PER_SECOND = 0.9;
/**
 * The light only turns back (dimmer after brighter, or the other way) a third of a second after it last did: however
 * fast the intensity is changed (a held key, a colleague clicking), at most three marked variations a second. The slow
 * flicker turns far less often, and moves far slower than the fade: it goes through unchanged.
 */
const TORCH_FADE_TURN_MS = 1000 / 3;
/** A turn this close to the previous one is no marked variation (as counted for the flicker): it may come sooner. */
const TORCH_FADE_MARKED = 0.02;

/** A brightness of a torch as it is drawn now, on its way to the one asked (see torchFadeTowards). */
export interface TorchFade {
    value: number;
    /** The way it last moved; undefined until it has moved. */
    rising: boolean | undefined;
    /** When it last started moving one way, and from where. */
    turnedAt: number;
    turnedFrom: number;
    /** When it was last looked at. */
    at: number;
}

/** A torch seen for the first time: at once at the brightness asked. */
export function startTorchFade(target: number, now: number): TorchFade {
    return { value: target, rising: undefined, turnedAt: now, turnedFrom: target, at: now };
}

/**
 * Moves a brightness (from 0 to 1) towards the one asked, at most TORCH_FADE_PER_SECOND, and never turning back
 * sooner than TORCH_FADE_TURN_MS after it last turned, unless it barely moved since: what is drawn stays safe for
 * photosensitivity (WCAG 2.3.1) whatever is asked of it.
 */
export function torchFadeTowards(state: TorchFade, target: number, now: number): TorchFade {
    const elapsed = Math.max(0, now - state.at);
    if (state.value === target) {
        return { ...state, at: now };
    }
    const rising = target > state.value;
    const turning = rising !== state.rising;
    if (
        turning &&
        state.rising !== undefined &&
        now - state.turnedAt < TORCH_FADE_TURN_MS &&
        Math.abs(state.value - state.turnedFrom) >= TORCH_FADE_MARKED
    ) {
        // Held where it is until it may turn back.
        return { ...state, at: now };
    }
    const reach = (TORCH_FADE_PER_SECOND * elapsed) / 1000;
    const value = rising ? Math.min(target, state.value + reach) : Math.max(target, state.value - reach);
    return turning ? { value, rising, turnedAt: now, turnedFrom: state.value, at: now } : { ...state, value, at: now };
}
