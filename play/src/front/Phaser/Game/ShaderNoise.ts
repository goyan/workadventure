/**
 * The noise the shaders of the game draw with (the ground and the water, GroundSplat; the clouds, CloudLayer), and
 * the clock they read: kept healthy however long a page stays open and however large the map.
 *
 * hash() takes the sine of a dot product. A GPU computes the sine of a large number badly (measured on Metal, a Mac:
 * right up to about 6.2 million, the same value everywhere from about 7 million), and the noise turns flat or
 * striped. Its inputs grow with the map (the far corner of a map of 15 000 x 10 000 px reads about 5 million) and
 * with the clock (an effect that moves at 3 cells a second passes 7 million within the hour). So:
 *  - under that bound, hash() is computed as it always was: the noise of the game looks exactly the same;
 *  - over it, a hash without sine, on numbers brought under 4096, takes over: as random, and right on every GPU;
 *  - the clock goes round once a day (SHADER_CLOCK_PERIOD_S), so that the time itself keeps its precision in 32 bits
 *    (after a month, 0.25 s): what drifts with it jumps once, when it goes round.
 */

/** The clock of the shaders goes round after this long, in seconds: a day. */
export const SHADER_CLOCK_PERIOD_S = 86_400;

/** The time the shaders read, in seconds, from the clock of the game in milliseconds. */
export function shaderSeconds(nowMs: number): number {
    if (!Number.isFinite(nowMs)) return 0;
    const seconds = (nowMs / 1000) % SHADER_CLOCK_PERIOD_S;
    return seconds < 0 ? seconds + SHADER_CLOCK_PERIOD_S : seconds;
}

/** Over this, the dot product hash() takes the sine of is too large for a GPU (see above). */
export const HASH_SINE_BOUND = 6.0e6;

/** hash, vnoise and fbm, for a fragment shader (GLSL ES 1.00). */
export const NOISE_GLSL = `
// A hash without sine, on numbers brought under 4096: right on every GPU, whatever its inputs.
float hashWide(vec2 p) {
    vec3 p3 = fract(vec3(mod(p.xyx, 4096.0)) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// The hash of the game: as it always was where a GPU computes its sine right, without sine beyond.
float hashOf(vec2 p, bool wide) {
    return wide ? hashWide(p) : fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

bool hashIsWide(vec2 p) {
    return abs(dot(p, vec2(127.1, 311.7))) > ${HASH_SINE_BOUND.toFixed(1)};
}

float hash(vec2 p) {
    return hashOf(p, hashIsWide(p));
}

// The four corners of a cell of the noise take the same hash: no seam where the bound is crossed inside a cell.
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    bool wide = hashIsWide(i + vec2(1.0, 1.0)) || hashIsWide(i);
    return mix(
        mix(hashOf(i, wide), hashOf(i + vec2(1.0, 0.0), wide), f.x),
        mix(hashOf(i + vec2(0.0, 1.0), wide), hashOf(i + vec2(1.0, 1.0), wide), f.x),
        f.y
    );
}

float fbm(vec2 p) {
    return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 17.0) + 0.2 * vnoise(p * 4.01 + 31.0);
}

// fbm(p + drift), its drift given octave by octave from the processor (ShaderNoise.octaveDrifts): the first two in
// d12, the third in d3.
float fbmDrift(vec2 p, vec4 d12, vec2 d3) {
    return 0.5 * vnoise(p + d12.xy) + 0.3 * vnoise(p * 2.03 + 17.0 + d12.zw) + 0.2 * vnoise(p * 4.01 + 31.0 + d3);
}
`;

/**
 * How far the clouds have drifted (map pixels), as the shader of the clouds reads it: brought into one period of the
 * billows. Read from the clock of the world, the drift is in the billions of pixels, far past the 24 bits of a float
 * of the GPU, and the billows were flat. The period is a whole number of cells of the hash without sine at the scale
 * of the billows (30 px a cell): their first octave goes on seamlessly, the finer two jump once, every two days or so
 * at the usual drift of 60 px a second.
 */
export const CLOUD_BILLOW_PERIOD_PX = 30 * 4096 * 100;

/** `value` brought into 0..period. */
export function shaderWrap(value: number, period: number): number {
    if (!Number.isFinite(value)) return 0;
    const wrapped = value % period;
    return wrapped < 0 ? wrapped + period : wrapped;
}

/**
 * A drift of a noise (cells of its noise) runs as it is up to this, then goes round in a band of 4096 cells above it,
 * where the hash without sine repeats exactly (it reads its inputs modulo 4096): no jump, ever, and few enough digits
 * for the 32 bits of the GPU. Far past the bound of the sine (a drift this large on one axis reads over 30 million).
 * A drift that runs negative goes round in the same band, above: measured on Metal, a noise read at large negative
 * numbers did not repeat (12/255 on most pixels), at large positive ones it does to the bit.
 */
export const DRIFT_BAND_FROM = 4096 * 64;

/** A drift of a noise after `seconds` at `perSecond` cells a second, in 64 bits, as the shaders read it. */
export function driftPhase(seconds: number, perSecond: number): number {
    const phase = seconds * perSecond;
    if (!Number.isFinite(phase)) return 0;
    const size = Math.abs(phase);
    if (size < DRIFT_BAND_FROM) return phase;
    return DRIFT_BAND_FROM + (((phase % 4096) + 4096) % 4096);
}

/**
 * The drift of each octave of fbm (x 1, x 2.03, x 4.01), as fbmDrift reads it: fbm(p + v t) is the sum of its octaves
 * at (p + v t) x m, so each octave drifts at v x m, and goes round on its own.
 */
export function octaveDrifts(seconds: number, vx: number, vy: number): { first: number[]; third: number[] } {
    return {
        first: [
            driftPhase(seconds, vx),
            driftPhase(seconds, vy),
            driftPhase(seconds, vx * 2.03),
            driftPhase(seconds, vy * 2.03),
        ],
        third: [driftPhase(seconds, vx * 4.01), driftPhase(seconds, vy * 4.01)],
    };
}

/** The drifts of the noises of the ground and the water (GroundSplat), at a time of the clock of the game (ms). */
export function groundDrifts(nowMs: number): {
    fire: number[];
    poolNear: { first: number[]; third: number[] };
    poolFar: { first: number[]; third: number[] };
    waterNear: { first: number[]; third: number[] };
    waterFar: { first: number[]; third: number[] };
    ice: { first: number[]; third: number[] };
    froth: { first: number[]; third: number[] };
    boil: { first: number[]; third: number[] };
    glint: number;
    wave: number;
} {
    const t = Number.isFinite(nowMs) ? nowMs / 1000 : 0;
    return {
        // The tint of the fire drifts backwards: given as it is, so that the shader adds it.
        fire: [driftPhase(t, 2), driftPhase(t, -3)],
        poolNear: octaveDrifts(t, 0.09, 0.05),
        poolFar: octaveDrifts(t, -0.06, 0.08),
        waterNear: octaveDrifts(t, 0.06, 0.035),
        waterFar: octaveDrifts(t, -0.045, 0.07),
        ice: octaveDrifts(t, 0.05, -0.04),
        froth: octaveDrifts(t, 0.25, 0),
        boil: octaveDrifts(t, 0.35, -0.25),
        // The glints change three times a second: a whole number, drawn from the hash.
        glint: driftPhase(Math.floor(t * 3), 1),
        // The waves at the shore: a sine, taken here round its period.
        wave: (t * 1.6) % (2 * Math.PI),
    };
}

/** The drift of the billows of the clouds (CloudLayer), octave by octave. */
export function billowDrift(nowMs: number): { first: number[]; third: number[] } {
    const t = Number.isFinite(nowMs) ? nowMs / 1000 : 0;
    return octaveDrifts(t, 0.012, -0.008);
}
