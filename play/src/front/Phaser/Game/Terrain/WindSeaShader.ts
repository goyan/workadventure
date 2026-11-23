import { shaderWrap } from "../ShaderNoise";
import { whitecapShare, whitecapWhite } from "./Whitecaps";
import {
    BREAKING_SLOPE,
    ENVELOPE_COMPONENTS,
    FETCH_UNIT_METRES,
    FOAM_AGES_S,
    FOAM_DECAY_S,
    FOAM_DRIFT_SHARE,
    fetchSea,
    MAP_PX_METRES,
    REFERENCE_FETCH_M,
    SEA_COMPONENTS,
    seaAmplitudes,
    seaComponents,
    seaEnvelope,
    seaPhase,
    seaSurface,
    WIND_SEA_FROM_KMH,
} from "./WindSea";
import type { SeaComponent } from "./WindSea";

/**
 * The wind sea in the water shader (GroundSplat): the GLSL that sums its waves and draws their foam, the uniforms it
 * reads, and the twin of that foam in TypeScript (seaFoamAt), from which the white it draws is measured against the
 * law of the whitecaps.
 *
 * The foam, at a point of open water:
 * - on a crest that breaks: the upper front of a wave whose slope passes the breaking slope;
 * - left behind by the crests that broke there a little earlier: where the slope of the waves around was over it
 *   (their envelope), looked for back along the drift of the surface at FOAM_AGES_S, fading in FOAM_DECAY_S and
 *   tearing, as it ages, into streaks along the wind.
 */

/**
 * The breaking slope is the physical one (BREAKING_SLOPE) times this factor, measured (seaWhite, CPU twin of the
 * shader, 2048 px every 16 px: many groups of waves, three instants) so that the foam of a wind whitens the share of
 * the water of the law (whitecapWhite of whitecapShare) at REFERENCE_FETCH_M: [km/h, factor]. From 20 to 82 km/h it
 * stays within 7 % of the physical slope (the physical slope alone whitens 0.62 % at 30 km/h for 0.53 % of the law,
 * 14.5 % at 82 km/h for 16.3 %); 14 % under it at 90 km/h. Under 20 km/h it stays at its value of 20 km/h: a lower
 * slope would not be physical, and the law asks for a few hundredths of a percent there, which no one sees. Past
 * 90 km/h, where the measures of the law end, the white creeps towards 45 % (whitecapWhite): the wind tears foam off
 * crests not yet steep enough to break. Measured again on the GPU (Metal) by the probe of the study.
 */
export const BREAKING_FACTORS: readonly (readonly [number, number])[] = [
    [20, 0.959],
    [25, 1.002],
    [30, 1.032],
    [35, 1.022],
    [40, 1.006],
    [50, 1.035],
    [60, 0.976],
    [70, 0.939],
    [82, 0.942],
    [90, 0.863],
    [100, 0.717],
    [110, 0.647],
    [125, 0.571],
    [150, 0.517],
    [200, 0.654],
];

/**
 * How opaque the foam a crest left is (a crest breaking now: 1), and how little of it the streaks tear away (the cut of
 * their noise lowered by this), by the wind (km/h), after the descriptions of the Beaufort scale (WMO): a few white
 * horses whose foam soon goes under force 6; from force 7 (50 km/h) foam blown in streaks along the wind, well-marked
 * at force 8 (62), dense at force 9 (75); from force 10 (89) great patches, the sea white on the whole. Translucent
 * below: the water is seen through the foam left.
 */
export const LEFT_FOAM: readonly (readonly [number, number, number])[] = [
    [40, 0.4, 0],
    [50, 0.5, 0.03],
    [62, 0.65, 0.08],
    [75, 0.8, 0.15],
    [89, 0.9, 0.24],
];

/** The foam left by the crests for a wind (km/h): its opacity and how much less the streaks tear it (LEFT_FOAM). */
export function leftFoamFor(windKmh: number): { opacity: number; cutShift: number } {
    const table = LEFT_FOAM;
    if (!(windKmh > table[0][0])) return { opacity: table[0][1], cutShift: table[0][2] };
    for (let at = 1; at < table.length; at++) {
        const [upTo, opacity, shift] = table[at];
        if (windKmh <= upTo) {
            const [from, opacityBefore, shiftBefore] = table[at - 1];
            const share = (windKmh - from) / (upTo - from);
            return {
                opacity: opacityBefore + (opacity - opacityBefore) * share,
                cutShift: shiftBefore + (shift - shiftBefore) * share,
            };
        }
    }
    const [, opacity, cutShift] = table[table.length - 1];
    return { opacity, cutShift };
}
/**
 * The groups of waves. A few waves summed beat in a regular pattern, which a real sea, of a continuous spectrum, has
 * not: its groups come at random places and sizes. The waves are drawn higher or lower by a smooth random field (mean
 * square 1: the sea keeps the height of the law on the whole), its cells this many peak wavelengths long down the wind
 * and twice as wide across it, drifting at the speed of the groups (half that of the crests, in deep water).
 */
const GROUP_WAVES = 3.5;
const GROUP_LOWEST = 0.2;
const GROUP_RANGE = 1.6;
/**
 * The light on the waves comes from their slopes; but the waves of a few pixels, which carry as much slope as the long
 * ones, read as a fine hatching: their share of the light grows from this wavelength (map px) to the next. They keep
 * all their part in the breaking.
 */
const LIGHT_FROM_PX = 8;
const LIGHT_FULL_PX = 24;
/** The breaking starts this share under the breaking slope and is whole this share over it. */
const BREAKING_EDGE = 0.1;
/** The streaks of old foam: their noise, across and along the wind (map pixels a cell of the noise), two octaves. */
const STREAK_ACROSS_PX = 2;
const STREAK_ALONG_PX = 90;
// A whole number: the fine octave goes round with the first (4096 cells), never a jump.
const STREAK_FINE = 2;
/** The cut of the noise of the streaks, from fresh foam (whole, nearly) to the oldest looked for. */
const STREAK_CUT_FRESH = 0.56;
const STREAK_CUT_OLD = 0.74;
/** The light on the slopes of the waves comes from the north-west, as on the relief (TerrainShading). */
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
/** The noise of the streaks goes round every this many of its cells: the hash without sine repeats exactly there. */
const STREAK_PERIOD = 4096;
/** The shader needs this many uniform vectors at least, with the rest of the water: under, no wind sea is drawn. */
export const WIND_SEA_UNIFORM_VECTORS = 128;

/** The factor of the breaking slope for a wind (km/h), read between the measures of BREAKING_FACTORS. */
export function breakingFactorFor(windKmh: number): number {
    const table = BREAKING_FACTORS;
    if (!(windKmh > table[0][0])) return table[0][1];
    for (let at = 1; at < table.length; at++) {
        const [upTo, factor] = table[at];
        if (windKmh <= upTo) {
            const [from, before] = table[at - 1];
            return before + ((factor - before) * (windKmh - from)) / (upTo - from);
        }
    }
    return table[table.length - 1][1];
}

/** What the shader draws for a wind: its waves, where it blows, and the slope at which their crests break. */
export interface SeaDrawing {
    windMs: number;
    heading: { x: number; y: number };
    components: SeaComponent[];
    /** The slope a crest breaks at; Infinity when the law whitens nothing (no foam at all). */
    breakingSlope: number;
    /** The groups of waves: the length of a cell of their field (map px) and how fast they go downwind (map px a s). */
    group: { lengthPx: number; speedPx: number };
    /** The foam the crests leave: its opacity, and how much less the streaks tear it (leftFoamFor). */
    left: { opacity: number; cutShift: number };
}

/**
 * The waves are chosen for the wind rounded to this (km/h) and its direction to this (degrees): a wind that wavers
 * by a little keeps the same waves, their phases go on without a jump (their amplitudes follow the exact wind, in the
 * shader). They are drawn anew, once, only when the wind leaves its step.
 */
export const SEA_SPEED_STEP_KMH = 5;
export const SEA_DIRECTION_STEP_DEGREES = 10;

/** The sea of a wind of `windKmh` blowing towards `heading`; undefined under WIND_SEA_FROM_KMH. */
export function seaDrawing(windKmh: number | undefined, heading: { x: number; y: number }): SeaDrawing | undefined {
    if (windKmh === undefined || !Number.isFinite(windKmh) || windKmh < WIND_SEA_FROM_KMH) return undefined;
    const stepKmh = Math.max(WIND_SEA_FROM_KMH, Math.round(windKmh / SEA_SPEED_STEP_KMH) * SEA_SPEED_STEP_KMH);
    const step = (SEA_DIRECTION_STEP_DEGREES * Math.PI) / 180;
    const angle = Math.round(Math.atan2(heading.y, heading.x) / step) * step;
    const stepped = { x: Math.cos(angle), y: Math.sin(angle) };
    const components = seaComponents(stepKmh, stepped);
    const white = whitecapWhite(whitecapShare(windKmh));
    const peak = fetchSea(stepKmh / 3.6, REFERENCE_FETCH_M);
    // Deep water: the groups go at half the speed of the crests, g T / 4 pi.
    const groupSpeed = (9.81 * peak.tp) / (4 * Math.PI);
    return {
        windMs: windKmh / 3.6,
        heading: stepped,
        components,
        breakingSlope: white > 0 ? BREAKING_SLOPE * breakingFactorFor(windKmh) : Number.POSITIVE_INFINITY,
        group: { lengthPx: (GROUP_WAVES * peak.lp) / MAP_PX_METRES, speedPx: groupSpeed / MAP_PX_METRES },
        left: leftFoamFor(windKmh),
    };
}

/** How fast the foam drifts, in map pixels a second, downwind. */
export function foamDriftPx(windMs: number): number {
    return (FOAM_DRIFT_SHARE * windMs) / MAP_PX_METRES;
}

/** The value noise of the streaks, the twin of seaNoise (the hash without sine of ShaderNoise). */
function hashWide(x: number, y: number): number {
    const m = (v: number): number => v - STREAK_PERIOD * Math.floor(v / STREAK_PERIOD);
    const fract = (v: number): number => v - Math.floor(v);
    let a = fract(m(x) * 0.1031);
    let b = fract(m(y) * 0.1031);
    let c = fract(m(x) * 0.1031);
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += d;
    b += d;
    c += d;
    return fract((a + b) * c);
}

function seaNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = hashWide(ix, iy);
    const b = hashWide(ix + 1, iy);
    const c = hashWide(ix, iy + 1);
    const d = hashWide(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** The noise the old foam tears along: long thin streaks down the wind, two octaves. */
function streakNoise(across: number, along: number, drift: number): number {
    return (
        0.6 * seaNoise(across / STREAK_ACROSS_PX, along / STREAK_ALONG_PX - drift) +
        0.4 *
            seaNoise(
                (across * STREAK_FINE) / STREAK_ACROSS_PX + 7,
                (along * STREAK_FINE) / STREAK_ALONG_PX - drift * STREAK_FINE,
            )
    );
}

const smoothstep = (from: number, to: number, value: number): number => {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
};

/** The drift of the field of the groups down the wind, in its cells, brought round its period. */
export function groupDrift(sea: SeaDrawing, seconds: number): number {
    return shaderWrap((sea.group.speedPx * seconds) / sea.group.lengthPx, STREAK_PERIOD);
}

/** How much higher or lower the waves are drawn by their groups at a map point, `back` seconds before: the twin of
 * seaGroup. */
export function groupAt(sea: SeaDrawing, drift: number, x: number, y: number, back = 0): number {
    const { heading, group } = sea;
    const along = x * heading.x + y * heading.y;
    const across = -x * heading.y + y * heading.x;
    const cells = group.speedPx / group.lengthPx;
    return (
        GROUP_LOWEST +
        GROUP_RANGE * seaNoise(along / group.lengthPx - drift + cells * back, across / (2 * group.lengthPx) + 51)
    );
}

/** The drift of the streaks along the wind, in cells of their noise, brought round its period. */
export function streakDrift(windMs: number, seconds: number): number {
    return shaderWrap((foamDriftPx(windMs) * seconds) / STREAK_ALONG_PX, STREAK_PERIOD);
}

/**
 * The foam of the wind sea at a map point (px), 0 to 1, at `seconds` of the clock: the twin of seaFoam in the shader.
 */
export function seaFoamAt(
    sea: SeaDrawing,
    amplitudes: ArrayLike<number>,
    phases: ArrayLike<number>,
    drift: number,
    x: number,
    y: number,
    groups = 0,
): number {
    const slope = sea.breakingSlope;
    if (!Number.isFinite(slope)) return 0;
    const from = slope * (1 - BREAKING_EDGE);
    const to = slope * (1 + BREAKING_EDGE);
    const { heading } = sea;
    const now = seaSurface(sea.components, amplitudes, phases, x, y);
    const here = groupAt(sea, groups, x, y);
    const front = now.sx * heading.x + now.sy * heading.y <= 0 ? 1 : 0;
    const breaking = smoothstep(from, to, here * Math.hypot(now.sx, now.sy)) * (now.eta >= 0 ? 1 : 0) * front;
    const driftPx = foamDriftPx(sea.windMs);
    const along = x * heading.x + y * heading.y;
    const across = -x * heading.y + y * heading.x;
    let left = 0;
    for (const age of FOAM_AGES_S) {
        const bx = x - heading.x * driftPx * age;
        const by = y - heading.y * driftPx * age;
        const envelope =
            seaEnvelope(sea.components, amplitudes, phases, bx, by, age) * groupAt(sea, groups, bx, by, age);
        const cut =
            STREAK_CUT_FRESH +
            ((STREAK_CUT_OLD - STREAK_CUT_FRESH) * age) / FOAM_AGES_S[FOAM_AGES_S.length - 1] -
            sea.left.cutShift;
        const streak = smoothstep(cut, cut + 0.2, streakNoise(across, along, drift));
        left = Math.max(left, smoothstep(from, to, envelope) * Math.exp(-age / FOAM_DECAY_S) * streak);
    }
    return Math.max(breaking, left * sea.left.opacity);
}

/**
 * The mean white of the foam over a square of open water `fetchM` from the shore, deep, averaged over a few instants:
 * what the GPU probe measures, computed here on a grid of points every `stepPx` map pixels.
 */
export function seaWhite(sea: SeaDrawing, fetchM: number, sizePx = 2048, stepPx = 8, instants = 6): number {
    const amplitudes = seaAmplitudes(sea.components, sea.windMs, fetchM, 10);
    let total = 0;
    let count = 0;
    for (let instant = 0; instant < instants; instant++) {
        const seconds = 1000 + instant * 7.3;
        const phases = sea.components.map((component) => seaPhase(component, seconds));
        const drift = streakDrift(sea.windMs, seconds);
        const groups = groupDrift(sea, seconds);
        for (let y = stepPx / 2; y < sizePx; y += stepPx) {
            for (let x = stepPx / 2; x < sizePx; x += stepPx) {
                total += seaFoamAt(sea, amplitudes, phases, drift, x, y, groups);
                count++;
            }
        }
    }
    return total / count;
}

const glsl = (value: number): string => {
    if (!Number.isFinite(value)) throw new Error(`Not a number for the shader: ${value}`);
    const text = value.toPrecision(8);
    return text.includes(".") || text.includes("e") ? text : `${text}.0`;
};

const range = (count: number): number[] => Array.from({ length: count }, (_, at) => at);

/**
 * The GLSL of the wind sea: its uniforms, the amplitudes of its waves where the shader is (seaAmplitudes), the
 * surface back in time (seaAt) and the foam (seaFoam). Phases in cycles, brought into [0, 1) by fract before the
 * sine: its argument stays under 2 pi however far the map and however long the page. No hash by a sine.
 */
export const WIND_SEA_GLSL = `
// The wind sea (WindSeaShader.ts): wind (m/s), slope a crest breaks at (99 for none), 1 when drawn, foam left opacity.
uniform vec4 uSea;
// Where the wind goes (x, y), how fast the foam drifts (map px a second), the drift of the streaks (cells, wrapped).
uniform vec4 uSeaDir;
// The field of the groups: 1 / its cell down the wind and across it (map px), its drift (cells, wrapped), cells a s.
uniform vec4 uSeaGroup;
// How many of the looks back for the foam left are taken (the quality of the graphics, 0 to ${FOAM_AGES_S.length}), and
// how much less the streaks tear the foam left (leftFoamFor).
uniform vec2 uSeaLook;
// Each wave: cycles a map pixel (x, y), its phase now (cycles, in [0, 1)), its frequency (Hz).
${range(SEA_COMPONENTS)
    .map((at) => `uniform vec4 uSeaA${at};`)
    .join("\n")}
// The bands of the waves two by two: width (Hz) and fade (0 to 1) of one, then of the next.
${range(SEA_COMPONENTS / 2)
    .map((at) => `uniform vec4 uSeaB${at};`)
    .join("\n")}

${range(SEA_COMPONENTS)
    .map((at) => `float gSeaA${at};`)
    .join("\n")}
${range(SEA_COMPONENTS)
    .map((at) => `float gSeaV${at};`)
    .join("\n")}
float gSeaEta;
vec2 gSeaSlope;
// The slope the light reads: the waves of a few pixels count less in it (LIGHT_FROM_PX).
vec2 gSeaLight;
float gSeaEnvelope;
// What the envelope read from the waves of ENVELOPE_COMPONENTS is multiplied by: the share of the slope they carry.
float gSeaShare;

// The square of the slope of a wave: its amplitude (m) times its wave number (cycles a map pixel; the factor that
// makes it radians a metre is the same for all, and goes in their ratio).
float seaSlope2(float a, vec2 cycles) {
    return a * a * dot(cycles, cycles);
}

// The shape of the JONSWAP density at f for the peak fp (Hasselmann et al. 1973): f^-5 exp(-1.25 (fp / f)⁴) 3.3^r.
// Its scale (alpha g² / (2 pi)⁴) goes: the waves are brought to the height of the law after (seaAmplitudes).
float seaDensity(float f, float fp) {
    float sigma = f <= fp ? 0.07 : 0.09;
    float d = (f - fp) / (sigma * fp);
    float q = fp / f;
    float q2 = q * q;
    float f2 = f * f;
    return exp(-1.25 * q2 * q2 + 1.1939225 * exp(-0.5 * d * d)) / (f2 * f2 * f);
}

// The amplitude of each wave (m) where the fetch is fetchM and the water depthM deep: the twin of seaAmplitudes.
void seaAmplitudes(float fetchM, float depthM) {
    float u = uSea.x;
    float x = clamp(9.81 * max(fetchM, 2.0) / (u * u), 0.05, ${glsl(Math.pow(3.5 / 0.13, 1 / 0.33))});
    float fp = 3.5 * pow(x, -0.33) * 9.81 / u;
    float hs = 4.0 * sqrt(1.6e-7 * x) * u * u / 9.81;
    float cap = clamp(0.8 * depthM / max(hs, 0.0001), 0.0, 1.0);
${range(SEA_COMPONENTS)
    .map((at) => {
        const band = `uSeaB${Math.floor(at / 2)}.${at % 2 === 0 ? "x" : "z"}`;
        return `    gSeaA${at} = seaDensity(uSeaA${at}.w, fp) * ${band};`;
    })
    .join("\n")}
    float sampled = ${range(SEA_COMPONENTS)
        .map((at) => `gSeaA${at}`)
        .join(" + ")};
    float scale = sampled > 0.0 ? 2.0 * (hs * hs / 16.0) / sampled : 0.0;
${range(SEA_COMPONENTS)
    .map((at) => {
        const fade = `uSeaB${Math.floor(at / 2)}.${at % 2 === 0 ? "y" : "w"}`;
        return `    gSeaA${at} = cap * ${fade} * sqrt(gSeaA${at} * scale);`;
    })
    .join("\n")}
    float all = ${range(SEA_COMPONENTS)
        .map((at) => `seaSlope2(gSeaA${at}, uSeaA${at}.xy)`)
        .join(" + ")};
    float read = ${ENVELOPE_COMPONENTS.map((at) => `seaSlope2(gSeaA${at}, uSeaA${at}.xy)`).join(" + ")};
    gSeaShare = read > 0.0 ? sqrt(all / read) : 0.0;
${range(SEA_COMPONENTS)
    .map(
        (at) =>
            `    gSeaV${at} = smoothstep(${glsl(LIGHT_FROM_PX)}, ${glsl(LIGHT_FULL_PX)}, 1.0 / max(length(uSeaA${at}.xy), 0.0001));`,
    )
    .join("\n")}
}

// The envelope of the slope back seconds before now, from the waves of ENVELOPE_COMPONENTS (the twin of seaEnvelope).
float seaEnvelopeAt(vec2 p, float back) {
    vec2 c = vec2(0.0);
    vec2 s = vec2(0.0);
    float turn;
    vec2 k;
${ENVELOPE_COMPONENTS.map(
    (at) => `    turn = 6.2831853 * fract(dot(p, uSeaA${at}.xy) - uSeaA${at}.z + uSeaA${at}.w * back);
    k = uSeaA${at}.xy * gSeaA${at};
    c += k * cos(turn);
    s += k * sin(turn);`,
).join("\n")}
    return sqrt(dot(c, c) + dot(s, s)) * ${glsl((2 * Math.PI) / MAP_PX_METRES)} * gSeaShare;
}

// The surface at a map point, back seconds before now: height (m), slope (east, south) and the envelope of the slope.
void seaAt(vec2 p, float back) {
    float eta = 0.0;
    vec2 c = vec2(0.0);
    vec2 s = vec2(0.0);
    vec2 l = vec2(0.0);
    float turn;
    float co;
    float si;
    vec2 k;
${range(SEA_COMPONENTS)
    .map(
        (at) => `    turn = 6.2831853 * fract(dot(p, uSeaA${at}.xy) - uSeaA${at}.z + uSeaA${at}.w * back);
    co = cos(turn);
    si = sin(turn);
    k = uSeaA${at}.xy * ${glsl((2 * Math.PI) / MAP_PX_METRES)} * gSeaA${at};
    eta += gSeaA${at} * co;
    c += k * co;
    s += k * si;
    l += k * si * gSeaV${at};`,
    )
    .join("\n")}
    gSeaEta = eta;
    gSeaSlope = -s;
    gSeaLight = -l;
    gSeaEnvelope = sqrt(dot(c, c) + dot(s, s));
}

// The value noise of the streaks, from the hash without sine only.
float seaNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hashWide(i), hashWide(i + vec2(1.0, 0.0)), f.x),
        mix(hashWide(i + vec2(0.0, 1.0)), hashWide(i + vec2(1.0, 1.0)), f.x), f.y);
}

// How much higher or lower the waves are drawn by their groups at a map point, back seconds before (groupAt).
float seaGroup(vec2 p, float back) {
    float along = dot(p, uSeaDir.xy);
    float across = dot(p, vec2(-uSeaDir.y, uSeaDir.x));
    return ${glsl(GROUP_LOWEST)} + ${glsl(GROUP_RANGE)}
        * seaNoise(vec2(along * uSeaGroup.x - uSeaGroup.z + uSeaGroup.w * back, across * uSeaGroup.y + 51.0));
}

// The noise the old foam tears along: long thin streaks down the wind, two octaves (the twin of streakNoise).
float streakNoise(float across, float along) {
    return 0.6 * seaNoise(vec2(across / ${glsl(STREAK_ACROSS_PX)}, along / ${glsl(STREAK_ALONG_PX)} - uSeaDir.w))
        + 0.4 * seaNoise(vec2(across * ${glsl(STREAK_FINE / STREAK_ACROSS_PX)} + 7.0,
            along * ${glsl(STREAK_FINE / STREAK_ALONG_PX)} - uSeaDir.w * ${glsl(STREAK_FINE)}));
}

// The foam of the wind sea at a map point, 0 to 1 (seaAmplitudes first): the twin of seaFoamAt. Leaves the surface
// of now in gSeaEta, gSeaSlope.
float seaFoam(vec2 world) {
    float slope = uSea.y;
    float from = slope * ${glsl(1 - BREAKING_EDGE)};
    float to = slope * ${glsl(1 + BREAKING_EDGE)};
    vec2 heading = uSeaDir.xy;
    seaAt(world, 0.0);
    float here = seaGroup(world, 0.0);
    gSeaEta *= here;
    gSeaSlope *= here;
    gSeaLight *= here;
    float eta = gSeaEta;
    vec2 now = gSeaSlope;
    float front = dot(now, heading) <= 0.0 ? 1.0 : 0.0;
    float breaking = smoothstep(from, to, length(now)) * (eta >= 0.0 ? 1.0 : 0.0) * front;
    // A wind the law gives no foam for: nothing to look back for.
    if (slope > 50.0) return 0.0;
    float along = dot(world, heading);
    float across = dot(world, vec2(-heading.y, heading.x));
    float left = 0.0;
    float cut;
    float laid;
    vec2 back;
${FOAM_AGES_S.map(
    (age, index) => `    back = world - heading * uSeaDir.z * ${glsl(age)};
    laid = uSeaLook.x > ${glsl(index + 0.5)}
        ? smoothstep(from, to, seaEnvelopeAt(back, ${glsl(age)}) * seaGroup(back, ${glsl(age)}))
            * ${glsl(Math.exp(-age / FOAM_DECAY_S))}
        : 0.0;
    // The noise of the streaks only where foam was laid.
    if (laid > left) {
        cut = ${glsl(STREAK_CUT_FRESH + ((STREAK_CUT_OLD - STREAK_CUT_FRESH) * age) / FOAM_AGES_S[FOAM_AGES_S.length - 1])} - uSeaLook.y;
        left = max(left, laid * smoothstep(cut, cut + 0.2, streakNoise(across, along)));
    }`,
).join("\n")}
    return max(breaking, left * uSea.w);
}

// How a slope of the wind sea faces the light (north-west): -1 to 1.
float seaLight(vec2 slope) {
    return clamp(-dot(slope, vec2(${glsl(LIGHT.x)}, ${glsl(LIGHT.y)})) / 0.25, -1.0, 1.0);
}
`;

/** The uniforms of the wind sea at `seconds` of the clock of the shaders, for `sea` (undefined: none drawn). */
export function windSeaUniforms(
    sea: SeaDrawing | undefined,
    seconds: number,
    /** How many of the looks back for the foam left are taken (FOAM_AGES_S): fewer on a modest graphics card. */
    ages: number = FOAM_AGES_S.length,
): [string, number[]][] {
    const uniforms: [string, number[]][] = [];
    if (!sea) {
        uniforms.push(
            ["uSea", [1, 99, 0, 0]],
            ["uSeaDir", [0, 1, 0, 0]],
            ["uSeaGroup", [0, 0, 0, 0]],
            ["uSeaLook", [0, 0]],
        );
        for (let at = 0; at < SEA_COMPONENTS; at++) uniforms.push([`uSeaA${at}`, [0, 0, 0, 1]]);
        for (let at = 0; at < SEA_COMPONENTS / 2; at++) uniforms.push([`uSeaB${at}`, [0, 0, 0, 0]]);
        return uniforms;
    }
    const slope = Number.isFinite(sea.breakingSlope) ? sea.breakingSlope : 99;
    uniforms.push(
        ["uSea", [sea.windMs, slope, 1, sea.left.opacity]],
        ["uSeaDir", [sea.heading.x, sea.heading.y, foamDriftPx(sea.windMs), streakDrift(sea.windMs, seconds)]],
        [
            "uSeaGroup",
            [
                1 / sea.group.lengthPx,
                1 / (2 * sea.group.lengthPx),
                groupDrift(sea, seconds),
                sea.group.speedPx / sea.group.lengthPx,
            ],
        ],
        ["uSeaLook", [ages, sea.left.cutShift]],
    );
    sea.components.forEach((component, at) => {
        uniforms.push([`uSeaA${at}`, [component.cx, component.cy, seaPhase(component, seconds), component.f]]);
    });
    for (let at = 0; at < SEA_COMPONENTS / 2; at++) {
        const first = sea.components[at * 2];
        const second = sea.components[at * 2 + 1];
        uniforms.push([`uSeaB${at}`, [first.band, first.fade, second.band, second.fade]]);
    }
    return uniforms;
}

/** The fetch in metres from the byte the shader reads (pack 11, red, 0 to 1). */
export const FETCH_GLSL_METRES = glsl(255 * FETCH_UNIT_METRES);
export { WIND_SEA_FROM_KMH };
