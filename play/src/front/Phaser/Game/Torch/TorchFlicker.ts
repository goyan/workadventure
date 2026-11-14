/**
 * A change of the light of a torch that counts as a marked variation, as a share of its full light. The light adds at
 * most 55 % of its warm colour to the map (see RgbLampVisual), so a tenth of it changes what is seen by about 5 % of
 * the luminance: half of what WCAG 2.3.1 calls a flash (10 %). At most three of these in any second, on what is drawn.
 */
export const TORCH_MARKED_VARIATION = 0.1;

/** The flame breathes around this share of its full light, ±10 %, and crackles ±3 % on top. */
const FLICKER_CENTRE = 0.87;
const BREATH_SHARE = 0.1;
const CRACKLE_SHARE = 0.03;
/** The dimmest the flame gets, as a share of its full light. */
export const TORCH_FLICKER_MIN = FLICKER_CENTRE - BREATH_SHARE - CRACKLE_SHARE;

/**
 * The breathing: two octaves of a smoothed noise of 0.35 and 0.9 Hz, weighted to stay within ±1. Slow enough to turn
 * about once a second at most.
 */
const BREATH_OCTAVES: readonly { hertz: number; weight: number; salt: number }[] = [
    { hertz: 0.35, weight: 0.65, salt: 11 },
    { hertz: 0.9, weight: 0.35, salt: 23 },
];
/**
 * The crackle: a smoothed noise of 6 Hz. The light is sampled 15 times a second (TORCH_FLICKER_STEPS_PER_SECOND): a
 * noise above 7.5 Hz would only fold back into a slower one (aliasing), so 6 Hz is about the fastest that shows as
 * itself, two to three samples a turn. Its 3 % never make a marked variation on their own.
 */
const CRACKLE_HERTZ = 6;
const CRACKLE_SALT = 37;

/** A number from 0 to 1 for a seed, an index and a salt: the same on every browser (no Math.random). */
export function torchHash01(seed: number, index: number, salt: number): number {
    let hash = Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(index | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
}

/**
 * A value noise from -1 to 1: a value drawn for each tick of `hertz`, smoothly joined (smoothstep), so that it never
 * jumps. The ticks are counted from the epoch: every browser reads the same noise at the same server time.
 */
function valueNoise(timeMs: number, hertz: number, seed: number, salt: number): number {
    const ticks = (timeMs / 1000) * hertz;
    const tick = Math.floor(ticks);
    const t = ticks - tick;
    const smooth = t * t * (3 - 2 * t);
    const from = torchHash01(seed, tick, salt) * 2 - 1;
    const to = torchHash01(seed, tick + 1, salt) * 2 - 1;
    return from + (to - from) * smooth;
}

/** The slow breathing of a flame, from -1 to 1 (see BREATH_OCTAVES). */
export function torchBreath(timeMs: number, seed: number): number {
    let sum = 0;
    for (const { hertz, weight, salt } of BREATH_OCTAVES) sum += weight * valueNoise(timeMs, hertz, seed, salt);
    return sum;
}

/** The fast crackle of a flame, from -1 to 1 (see CRACKLE_HERTZ). */
export function torchCrackle(timeMs: number, seed: number): number {
    return valueNoise(timeMs, CRACKLE_HERTZ, seed, CRACKLE_SALT);
}

/**
 * How bright a flame is at a server time, from TORCH_FLICKER_MIN to 1: it breathes and crackles. `seed` is the
 * bearer's (see torchFlickerSeed): two torches lit together do not flicker as one, and every browser sees the same
 * flame. A steady full light when the system asks for less motion.
 */
export function torchFlicker(timeMs: number, seed: number, reducedMotion: boolean): number {
    if (reducedMotion) {
        return 1;
    }
    const value =
        FLICKER_CENTRE + BREATH_SHARE * torchBreath(timeMs, seed) + CRACKLE_SHARE * torchCrackle(timeMs, seed);
    return Math.min(1, Math.max(TORCH_FLICKER_MIN, value));
}

/** The flicker moves 15 times a second: soft enough to look alive, and the scene is not rendered at every image. */
export const TORCH_FLICKER_STEPS_PER_SECOND = 15;

/** The start of the flicker step a time falls in: the torches are lit with the flicker of that time. */
export function torchFlickerStep(timeMs: number): number {
    return (Math.floor((timeMs * TORCH_FLICKER_STEPS_PER_SECOND) / 1000) * 1000) / TORCH_FLICKER_STEPS_PER_SECOND;
}

/** A seed that stays the same for an id (a user id, the same on every browser): each torch flickers its own way. */
export function torchFlickerSeed(id: string): number {
    let hash = 0;
    for (let index = 0; index < id.length; index++) {
        hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return hash;
}

/** A phase from 0 to 1 that stays the same for an id: each bearer's flame in the hand moves in its own way. */
export function torchFlickerPhase(id: string): number {
    return (torchFlickerSeed(id) % 1000) / 1000;
}

/** How fast a torch dims or brightens when its bearer changes its intensity: from 10 % to 100 % in one second. */
export const TORCH_FADE_PER_SECOND = 0.9;
/**
 * The light only turns back (dimmer after brighter, or the other way) a third of a second after it last did: however
 * fast the intensity is changed (a held key, a colleague clicking), at most three marked variations a second. The slow
 * flicker turns far less often, and moves far slower than the fade: it goes through unchanged.
 */
const TORCH_FADE_TURN_MS = 1000 / 3;

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
 * Moves a brightness (from 0 to 1) towards the one asked, at most `perSecond`, and never turning back
 * sooner than TORCH_FADE_TURN_MS after it last turned, unless it barely moved since: what is drawn stays safe for
 * photosensitivity (WCAG 2.3.1) whatever is asked of it.
 */
export function torchFadeTowards(
    state: TorchFade,
    target: number,
    now: number,
    perSecond = TORCH_FADE_PER_SECOND,
): TorchFade {
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
        Math.abs(state.value - state.turnedFrom) >= TORCH_MARKED_VARIATION
    ) {
        // Held where it is until it may turn back.
        return { ...state, at: now };
    }
    const reach = (perSecond * elapsed) / 1000;
    const value = rising ? Math.min(target, state.value + reach) : Math.max(target, state.value - reach);
    return turning ? { value, rising, turnedAt: now, turnedFrom: state.value, at: now } : { ...state, value, at: now };
}
