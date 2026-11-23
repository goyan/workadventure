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
