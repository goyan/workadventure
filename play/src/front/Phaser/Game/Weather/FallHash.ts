/**
 * The hash and the clock of the falling rain and snow, the same on the processor (Rain, Snowfall, PerspectiveFall)
 * and on the graphics card (PrecipitationLayer, which works them out again for each drop): what a drop of the one is,
 * the other draws it at the same place.
 *
 * A hash without sine (Dave Hoskins, "Hash without Sine", 2014) on numbers brought under 4096: a GPU computes the sine
 * of a large number badly (ShaderNoise), and the cells of the rain over a large map read into the hundreds of thousands.
 * A float of the GPU holds 24 bits: the clock goes round every FALL_CLOCK_PERIOD_S so that a drop, moved by the time
 * times its speed, keeps a position right to a fraction of a pixel.
 */

/** The inputs of the hash are read modulo this: the rain repeats every 4096 cells, far beyond a screen. */
export const FALL_HASH_WRAP = 4096;

/**
 * The clock of the rain goes round after this long, in seconds: an hour keeps the fall of the fastest drop right to a
 * tenth of a pixel in 32 bits. Every drop and flake jumps to another place once, when it goes round (the same moment
 * for everyone: it is read on the clock of the server).
 */
export const FALL_CLOCK_PERIOD_S = 3600;

const SCALE = 0.1031;
const SPREAD = 31.32;
/** The constants as a float of the GPU holds them. */
const SCALE_32 = Math.fround(SCALE);
const SPREAD_32 = Math.fround(SPREAD);
const f32 = Math.fround;

function fract(value: number): number {
    return value - Math.floor(value);
}

function wrap(value: number): number {
    const wrapped = value % FALL_HASH_WRAP;
    return wrapped < 0 ? wrapped + FALL_HASH_WRAP : wrapped;
}

/**
 * A number from 0 to 1 for three whole numbers (a cell, a row and a salt): as random, and right on every GPU. Worked
 * out in the 32 bits of a float of the GPU, step by step as the shader does: the hash keeps few exact digits there
 * (its last product reaches the thousands), and the processor must read the same number to draw the same drop.
 */
export function fallHash(x: number, y: number, z: number): number {
    let a = fract(f32(wrap(x) * SCALE_32));
    let b = fract(f32(wrap(y) * SCALE_32));
    let c = fract(f32(wrap(z) * SCALE_32));
    const spread = f32(f32(f32(a * f32(c + SPREAD_32)) + f32(b * f32(b + SPREAD_32))) + f32(c * f32(a + SPREAD_32)));
    a = f32(a + spread);
    b = f32(b + spread);
    c = f32(c + spread);
    return fract(f32(f32(a + b) * c));
}

/** The time the rain and the snow read, in seconds, from the clock of the server in milliseconds. */
export function fallSeconds(epoch: number): number {
    if (!Number.isFinite(epoch)) return 0;
    const seconds = (epoch / 1000) % FALL_CLOCK_PERIOD_S;
    return seconds < 0 ? seconds + FALL_CLOCK_PERIOD_S : seconds;
}

/** fallHash for the shaders (GLSL ES 1.00), with copyShown (ParticleDensity). */
export const FALL_HASH_GLSL = `
float fallHash(float x, float y, float z) {
    vec3 p = fract(mod(vec3(x, y, z), ${FALL_HASH_WRAP.toFixed(1)}) * ${SCALE});
    p += dot(p, p.zyx + ${SPREAD});
    return fract((p.x + p.y) * p.z);
}
bool copyShown(float copy, float copies, float share, float pick) {
    float wanted = copies * clamp(share, 0.0, 1.0);
    float whole = floor(wanted);
    return copy < whole - 0.5 || (abs(copy - whole) < 0.5 && pick < wanted - whole);
}
`;
