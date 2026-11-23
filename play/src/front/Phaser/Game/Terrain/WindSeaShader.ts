import { shaderWrap } from "../ShaderNoise";
import { whitecapShare, whitecapWhite } from "./Whitecaps";
import {
    BREAKING_SLOPE,
    FETCH_UNIT_METRES,
    FOAM_DECAY_S,
    FOAM_DRIFT_SHARE,
    fetchSea,
    MAP_PX_METRES,
    REFERENCE_FETCH_M,
    SEA_COMPONENTS,
    seaComponents,
    seaPhase,
    seaSurface,
    WIND_SEA_FROM_KMH,
} from "./WindSea";
import type { SeaComponent } from "./WindSea";

/**
 * The wind sea in the shaders (GroundSplat, WindSeaFoam): the GLSL that sums its waves, the pass that keeps the foam
 * the crests leave, and the uniforms they read.
 *
 * The foam, at a point of open water:
 * - on a crest that breaks: the upper front of a wave whose slope passes the breaking slope, drawn by the water shader
 *   at the pixel;
 * - left behind by the crests that broke: a picture of the foam around the camera (WindSeaFoam), made again a few
 *   times a second from itself. Each crest that breaks lays its foam in it; the foam drifts at 3 % of the wind, fades
 *   in FOAM_DECAY_S, and is laid in fine lines along the wind. A crest runs downwind faster than its foam drifts:
 *   the foam it lays while it breaks stays behind it, a trail as long as it broke, thin, irregular, fading.
 */

/**
 * The breaking slope is the physical one (BREAKING_SLOPE) times this factor, measured on the GPU (the probe of the
 * study: the real shaders, the pass of the foam and the water over 1024 x 640 px of open water 1.4 m deep at
 * REFERENCE_FETCH_M, after 12 s for the foam to build up, averaged over its last 3 s) so that the foam of a wind
 * whitens the share of the water of the law (whitecapWhite of whitecapShare): [km/h, factor]. From 20 to 82 km/h it
 * stays within 13 % of the physical slope; past 90 km/h, where the measures of the law end, the slope comes down to
 * 55 % of it and the white creeps towards 45 % (whitecapWhite): the wind tears foam off crests not yet steep enough to
 * break. Under 20 km/h it stays at its value of 20 km/h: a lower slope would not be physical, and the law asks for a
 * few hundredths of a percent there, which no one sees.
 */
export const BREAKING_FACTORS: readonly (readonly [number, number])[] = [
    [20, 0.985],
    [30, 1.088],
    [40, 1.114],
    [50, 1.127],
    [60, 1.097],
    [70, 1.011],
    [82, 0.887],
    [90, 0.839],
    [100, 0.758],
    [110, 0.642],
    [125, 0.56],
    [150, 0.547],
];

/**
 * How opaque the foam a crest left is (a crest breaking now: 1), and how much more densely it is laid (the cut of the
 * lines it is laid in lowered by this), by the wind (km/h), after the descriptions of the Beaufort scale (WMO): a few
 * white horses whose foam soon goes under force 6; from force 7 (50 km/h) foam blown in streaks along the wind,
 * well-marked at force 8 (62), dense at force 9 (75); from force 10 (89) great patches, the sea white on the whole.
 * Translucent below: the water is seen through the foam left.
 */
export const LEFT_FOAM: readonly (readonly [number, number, number])[] = [
    [40, 0.55, 0],
    [50, 0.65, 0.03],
    [62, 0.75, 0.06],
    [75, 0.85, 0.1],
    [89, 0.92, 0.15],
];

/** The foam left by the crests for a wind (km/h): its opacity and how much more densely it is laid (LEFT_FOAM). */
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
 * not: its groups come at random places and sizes. The waves are drawn higher or lower by a smooth random field of two
 * octaves (mean square about 1: the sea keeps the height of the law on the whole), its cells this many peak
 * wavelengths long down the wind and twice as wide across it, drifting at the speed of the groups (half that of the
 * crests, in deep water).
 */
const GROUP_WAVES = 2.5;
const GROUP_LOWEST = 0.3;
const GROUP_RANGE = 1.4;
/**
 * The light on the waves comes from their slopes; but the waves of a few pixels, which carry as much slope as the long
 * ones, read as a fine hatching: their share of the light grows from this wavelength (map px) to the next. They keep
 * all their part in the breaking.
 */
const LIGHT_FROM_PX = 8;
const LIGHT_FULL_PX = 24;
/** The breaking starts this share under the breaking slope and is whole this share over it. */
const BREAKING_EDGE = 0.1;
/**
 * The foam a crest lays is laid in fine lines along the wind (map px a cell of their noise, across and along it): whole
 * on them, at FOAM_OFF_LINE between them. The lines drift with the foam.
 */
const FOAM_LINE_ACROSS_PX = 4;
const FOAM_LINE_ALONG_PX = 60;
const FOAM_LINE_CUT = 0.55;
const FOAM_OFF_LINE = 0.1;
/** The light on the slopes of the waves comes from the north-west, as on the relief (TerrainShading). */
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
/** The noises go round every this many of their cells: the hash without sine repeats exactly there. */
const NOISE_PERIOD = 4096;
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
    /** The foam the crests leave: its opacity, and how much more densely it is laid (leftFoamFor). */
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

/** The hash without sine of ShaderNoise (hashWide), in 64-bit numbers. */
function hashWide(x: number, y: number): number {
    const m = (v: number): number => v - NOISE_PERIOD * Math.floor(v / NOISE_PERIOD);
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

/** The value noise of seaNoise. */
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

const smoothstep = (from: number, to: number, value: number): number => {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
};

/** The drift of the field of the groups down the wind, in its cells, brought round its period. */
export function groupDrift(sea: SeaDrawing, seconds: number): number {
    return shaderWrap((sea.group.speedPx * seconds) / sea.group.lengthPx, NOISE_PERIOD);
}

/** How much higher or lower the waves are drawn by their groups at a map point: the twin of seaGroup. */
export function groupAt(sea: SeaDrawing, drift: number, x: number, y: number): number {
    const { heading, group } = sea;
    const along = x * heading.x + y * heading.y;
    const across = -x * heading.y + y * heading.x;
    const p = along / group.lengthPx - drift;
    const q = across / (2 * group.lengthPx) + 51;
    return GROUP_LOWEST + GROUP_RANGE * (0.65 * seaNoise(p, q) + 0.35 * seaNoise(2 * p + 17, 2 * q + 3));
}

/** The drift of the lines the foam is laid in, along the wind, in cells of their noise, brought round its period. */
export function lineDrift(windMs: number, seconds: number): number {
    return shaderWrap((foamDriftPx(windMs) * seconds) / FOAM_LINE_ALONG_PX, NOISE_PERIOD);
}

/**
 * Whether a crest breaks at a map point, 0 to 1, for the amplitudes and phases given and the drift of the groups: the
 * twin of seaBreaking in the shaders.
 */
export function breakingAt(
    sea: SeaDrawing,
    amplitudes: ArrayLike<number>,
    phases: ArrayLike<number>,
    groups: number,
    x: number,
    y: number,
): number {
    const slope = sea.breakingSlope;
    if (!Number.isFinite(slope)) return 0;
    const now = seaSurface(sea.components, amplitudes, phases, x, y);
    const here = groupAt(sea, groups, x, y);
    const front = now.sx * sea.heading.x + now.sy * sea.heading.y <= 0 ? 1 : 0;
    return (
        smoothstep(slope * (1 - BREAKING_EDGE), slope * (1 + BREAKING_EDGE), here * Math.hypot(now.sx, now.sy)) *
        (now.eta >= 0 ? 1 : 0) *
        front
    );
}

const glsl = (value: number): string => {
    if (!Number.isFinite(value)) throw new Error(`Not a number for the shader: ${value}`);
    const text = value.toPrecision(8);
    return text.includes(".") || text.includes("e") ? text : `${text}.0`;
};

const range = (count: number): number[] => Array.from({ length: count }, (_, at) => at);

/**
 * The GLSL of the wind sea shared by the water shader and the pass of the foam: its uniforms, the amplitudes of its
 * waves where the shader is (seaAmplitudes), the surface (seaAt), the groups (seaGroup) and the breaking
 * (seaBreaking). Phases in cycles, brought into [0, 1) by fract before the sine: its argument stays under 2 pi however
 * far the map and however long the page. No hash by a sine. Needs NOISE_GLSL (hashWide) before it.
 */
export const WIND_SEA_GLSL = `
// The wind sea (WindSeaShader.ts): wind (m/s), slope a crest breaks at (99 for none), 1 when drawn, foam left opacity.
uniform vec4 uSea;
// Where the wind goes (x, y), how fast the foam drifts (map px a second), the drift of its lines (cells, wrapped).
uniform vec4 uSeaDir;
// The field of the groups: 1 / its cell down the wind and across it (map px), its drift (cells, wrapped), unused.
uniform vec4 uSeaGroup;
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
        return `    gSeaA${at} = cap * ${fade} * sqrt(gSeaA${at} * scale);
    gSeaV${at} = smoothstep(${glsl(LIGHT_FROM_PX)}, ${glsl(LIGHT_FULL_PX)}, 1.0 / max(length(uSeaA${at}.xy), 0.0001));`;
    })
    .join("\n")}
}

// The surface at a map point now: height (m), slope (east, south), and the slope the light reads.
void seaAt(vec2 p) {
    float eta = 0.0;
    vec2 s = vec2(0.0);
    vec2 l = vec2(0.0);
    float turn;
    float si;
    vec2 k;
${range(SEA_COMPONENTS)
    .map(
        (at) => `    turn = 6.2831853 * fract(dot(p, uSeaA${at}.xy) - uSeaA${at}.z);
    si = sin(turn);
    k = uSeaA${at}.xy * ${glsl((2 * Math.PI) / MAP_PX_METRES)} * gSeaA${at};
    eta += gSeaA${at} * cos(turn);
    s += k * si;
    l += k * si * gSeaV${at};`,
    )
    .join("\n")}
    gSeaEta = eta;
    gSeaSlope = -s;
    gSeaLight = -l;
}

// The value noise of the wind sea, from the hash without sine only.
float seaNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hashWide(i), hashWide(i + vec2(1.0, 0.0)), f.x),
        mix(hashWide(i + vec2(0.0, 1.0)), hashWide(i + vec2(1.0, 1.0)), f.x), f.y);
}

// How much higher or lower the waves are drawn by their groups at a map point (groupAt).
float seaGroup(vec2 p) {
    float along = dot(p, uSeaDir.xy);
    float across = dot(p, vec2(-uSeaDir.y, uSeaDir.x));
    vec2 q = vec2(along * uSeaGroup.x - uSeaGroup.z, across * uSeaGroup.y + 51.0);
    return ${glsl(GROUP_LOWEST)} + ${glsl(GROUP_RANGE)}
        * (0.65 * seaNoise(q) + 0.35 * seaNoise(q * 2.0 + vec2(17.0, 3.0)));
}

// The surface of the wind sea at a map point (seaAmplitudes first), its groups taken in; and whether a crest breaks
// there, 0 to 1 (breakingAt): the upper front of a wave steeper than the breaking slope.
float seaBreaking(vec2 world) {
    seaAt(world);
    float here = seaGroup(world);
    gSeaEta *= here;
    gSeaSlope *= here;
    gSeaLight *= here;
    float slope = uSea.y;
    float front = dot(gSeaSlope, uSeaDir.xy) <= 0.0 ? 1.0 : 0.0;
    return smoothstep(slope * ${glsl(1 - BREAKING_EDGE)}, slope * ${glsl(1 + BREAKING_EDGE)}, length(gSeaSlope))
        * (gSeaEta >= 0.0 ? 1.0 : 0.0) * front;
}

// How a slope of the wind sea faces the light (north-west): -1 to 1.
float seaLight(vec2 slope) {
    return clamp(-dot(slope, vec2(${glsl(LIGHT.x)}, ${glsl(LIGHT.y)})) / 0.25, -1.0, 1.0);
}
`;

/**
 * The GLSL the water shader adds to WIND_SEA_GLSL: the foam of the wind sea at a map point, 0 to 1 (seaAmplitudes
 * first), the crest breaking here and the foam left, read from the picture of the foam (WindSeaFoam). Leaves the
 * surface in gSeaEta, gSeaSlope, gSeaLight.
 */
export const WIND_SEA_WATER_GLSL = `
// The foam the crests left (WindSeaFoam), and the part of the map it covers: x, y, 1 / width, 1 / height (map px).
uniform sampler2D uSeaFoam;
uniform vec4 uSeaFoamArea;

float seaFoam(vec2 world) {
    float breaking = seaBreaking(world);
    vec2 uv = (world - uSeaFoamArea.xy) * uSeaFoamArea.zw;
    float left = uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0 ? texture2D(uSeaFoam, uv).r : 0.0;
    return max(breaking, left * uSea.w);
}
`;

/**
 * The pass of the foam (WindSeaFoam): a picture of the foam around the camera, a texel every few map pixels, made
 * from the one before: its foam moved downwind by the drift and faded, and the foam the crests breaking now lay, in
 * fine lines along the wind. Goes after the GLSL of the ground (GroundSplat), hashWide and WIND_SEA_GLSL, which give
 * `float seaOpenDepthPx(vec2 world)` (the depth of open water outdoors, 0 elsewhere) and `float seaFetchM(vec2 world)`.
 * Its texels are those of the picture (gl_FragCoord): the same in the picture written and in the picture read.
 */
export const WIND_SEA_FOAM_GLSL = `
// The foam before, and the part of the map it covered: x, y, width, height (map px).
uniform sampler2D uFoamBefore;
uniform vec4 uFoamBeforeArea;
// The part of the map this picture covers: x, y, width, height (map px); its size in texels.
uniform vec4 uFoamArea;
uniform vec2 uFoamTexels;
// The seconds since the picture before, a count of the pictures (to vary the rounding), the cut of the lines (lowered
// by grand winds), 1 to start from nothing.
uniform vec4 uFoamStep;

void main() {
    vec2 world = uFoamArea.xy + gl_FragCoord.xy / uFoamTexels * uFoamArea.zw;
    float dt = uFoamStep.x;
    // Where the foam here was a step ago: upwind by the drift.
    vec2 uv = (world - uSeaDir.xy * uSeaDir.z * dt - uFoamBeforeArea.xy) / uFoamBeforeArea.zw;
    float kept = 0.0;
    if (uFoamStep.w < 0.5 && uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
        kept = texture2D(uFoamBefore, uv).r * exp(-dt / ${glsl(FOAM_DECAY_S)});
        // Rounded at random to the bytes of the picture: no foam stuck at its last step.
        kept += (hashWide(gl_FragCoord.xy + vec2(uFoamStep.y * 7.0, uFoamStep.y * 13.0)) - 0.5) / 255.0;
    }
    float laid = 0.0;
    float depthPx = seaOpenDepthPx(world);
    if (uSea.z > 0.5 && uSea.y < 50.0 && depthPx > 0.0) {
        seaAmplitudes(seaFetchM(world), depthPx * ${glsl(MAP_PX_METRES)});
        float breaking = seaBreaking(world);
        if (breaking > 0.0) {
            vec2 heading = uSeaDir.xy;
            float along = dot(world, heading) / ${glsl(FOAM_LINE_ALONG_PX)} - uSeaDir.w;
            float across = dot(world, vec2(-heading.y, heading.x)) / ${glsl(FOAM_LINE_ACROSS_PX)};
            float lines = 0.65 * seaNoise(vec2(across, along))
                + 0.35 * seaNoise(vec2(across * 2.0 + 9.0, along * 2.0));
            float cut = ${glsl(FOAM_LINE_CUT)} - uFoamStep.z;
            laid = breaking * mix(${glsl(FOAM_OFF_LINE)}, 1.0, smoothstep(cut, cut + 0.15, lines));
        }
    }
    gl_FragColor = vec4(clamp(max(kept, laid), 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/** The uniforms of the wind sea at `seconds` of the clock of the shaders, for `sea` (undefined: none drawn). */
export function windSeaUniforms(sea: SeaDrawing | undefined, seconds: number): [string, number[]][] {
    const uniforms: [string, number[]][] = [];
    if (!sea) {
        uniforms.push(["uSea", [1, 99, 0, 0]], ["uSeaDir", [0, 1, 0, 0]], ["uSeaGroup", [0, 0, 0, 0]]);
        for (let at = 0; at < SEA_COMPONENTS; at++) uniforms.push([`uSeaA${at}`, [0, 0, 0, 1]]);
        for (let at = 0; at < SEA_COMPONENTS / 2; at++) uniforms.push([`uSeaB${at}`, [0, 0, 0, 0]]);
        return uniforms;
    }
    const slope = Number.isFinite(sea.breakingSlope) ? sea.breakingSlope : 99;
    uniforms.push(
        ["uSea", [sea.windMs, slope, 1, sea.left.opacity]],
        ["uSeaDir", [sea.heading.x, sea.heading.y, foamDriftPx(sea.windMs), lineDrift(sea.windMs, seconds)]],
        ["uSeaGroup", [1 / sea.group.lengthPx, 1 / (2 * sea.group.lengthPx), groupDrift(sea, seconds), 0]],
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
