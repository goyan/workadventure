import { HURRICANE_MOTION_SHARE } from "@workadventure/map-editor";
import { shaderWrap } from "../ShaderNoise";
import { SPUME_FROM_MS, SPUME_WHOLE_MS, whitecapShare, whitecapWhite } from "./Whitecaps";
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
 * whitens the share of the water of the law (whitecapWhite of whitecapShare): [km/h, factor]. From 20 to 60 km/h it
 * stays within 11 % of the physical slope; over, the law asks more white than the crests steeper than Michell give
 * (25 % under at 82 km/h): the wind tears foam off crests not yet steep enough to break. Past 90 km/h, where the
 * measures of the law end, the white of the whitecaps creeps towards 45 % (whitecapWhite); past 30 m/s the white
 * sheet of a hurricane (seaSpume) is laid over them. Under 20 km/h it stays at its value of
 * 20 km/h: a lower slope would not be physical, and the law asks for a few hundredths of a percent there.
 */
export const BREAKING_FACTORS: readonly (readonly [number, number])[] = [
    [20, 0.896],
    [30, 0.965],
    [40, 0.965],
    [50, 0.965],
    [60, 0.937],
    [70, 0.845],
    [82, 0.749],
    [90, 0.694],
    [100, 0.63],
    [110, 0.441],
    [125, 0.244],
    [150, 0.267],
];

/**
 * How opaque the foam a crest left is (a crest breaking now: 1), how much more densely it is laid (the cut of the lines
 * it is laid in lowered by this), and how much longer it lasts (FOAM_DECAY_S times this, on the mean), by the wind
 * (km/h), after the descriptions of the Beaufort scale (WMO): a few white horses whose foam soon goes under force 6;
 * from force 7 (50 km/h) foam blown in streaks along the wind, well-marked at force 8 (62), dense at force 9 (75); from
 * force 10 (89) great patches, the sea white on the whole. Translucent below: the water is seen through the foam left.
 * The thicker foam of a gale lasts longer (Callaghan et al. 2012: 2 to 5 s, and more for the largest breakers).
 */
export const LEFT_FOAM: readonly (readonly [number, number, number, number])[] = [
    [40, 0.55, 0, 1],
    [50, 0.65, 0.03, 1],
    [62, 0.75, 0.06, 1.15],
    [75, 0.85, 0.1, 1.35],
    [89, 0.92, 0.15, 1.6],
];

/** The foam left by the crests for a wind (km/h): its opacity, how densely it is laid, how long it lasts (LEFT_FOAM). */
export function leftFoamFor(windKmh: number): { opacity: number; cutShift: number; life: number } {
    const column = (at: number): readonly (readonly [number, number])[] =>
        LEFT_FOAM.map((row) => [row[0], row[at]] as const);
    return {
        opacity: between(column(1), windKmh),
        cutShift: between(column(2), windKmh),
        life: between(column(3), windKmh),
    };
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
/** The cells of the groups are this many times wider across the wind than long down it. */
const GROUP_ACROSS = 1.25;
/** How far (cells of the field) the field of the groups is bent by a slower noise: no rows, no bands of calm. */
const GROUP_WARP = 0.8;
/**
 * A crest breaks along part of its length only, the part changing as it runs: a noise fixed on the map, this many map
 * pixels a cell along the crest (across the wind) and down the wind (a crest runs through a cell in about a second, the
 * life of a whitecap), lets it break where it is over a cut (CREST_CUTS, by the wind in km/h): short whitecaps in a
 * breeze, crests breaking over most of their length in a gale.
 */
const CREST_ALONG_PX = 18;
const CREST_DOWN_PX = 40;
export const CREST_CUTS: readonly (readonly [number, number])[] = [
    [40, 0.35],
    [60, 0.3],
    [82, 0.25],
    [110, 0.2],
    [150, 0.15],
];

/** A value of a table [x, value] read straight between its rows, held at its ends. */
function between(table: readonly (readonly [number, number])[], x: number): number {
    if (!(x > table[0][0])) return table[0][1];
    for (let at = 1; at < table.length; at++) {
        const [upTo, value] = table[at];
        if (x <= upTo) {
            const [from, before] = table[at - 1];
            return before + ((value - before) * (x - from)) / (upTo - from);
        }
    }
    return table[table.length - 1][1];
}
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
const FOAM_LINE_ALONG_PX = 60;
/**
 * The streaks of the white sheet of a hurricane (seaSpume): how wide across the wind and how long along it (map px),
 * long filaments parallel to the wind; the white of the sheet between them once whole; the most the spray hides the
 * water, reached at SPRAY_WHOLE_MS (m/s). Choices, to look like the films of Holthuijsen et al. 2012.
 */
const SPUME_ACROSS_PX = 8;
const SPUME_ALONG_PX = 360;
const SPUME_SHEET = 0.78;
const SPRAY_MOST = 0.45;
const SPRAY_WHOLE_MS = 55;
/**
 * The pace of the eye of a hurricane (m/s) under which the foam it leaves lasts as long as any (a crossing of the map
 * in 5 min goes at about 0.9 m/s); faster (the widget of the speed of the map), it lasts the less.
 */
const HURRICANE_FOAM_PACE_MS = 1.2;
const FOAM_LINE_CUT = 0.55;
const FOAM_OFF_LINE = 0.1;
/**
 * The trails differ one from the next: a slow noise drifting with the foam, this many map pixels a cell across the
 * wind and down it, gives each its width (its lines FOAM_LINE_ACROSS_PX across, from the narrowest to the widest), how
 * white it is laid (from FOAM_LAID_FAINTEST to whole), and how long it lasts (FOAM_DECAY_S times FOAM_LIFE: a mean of
 * FOAM_DECAY_S).
 */
const TRAIL_ACROSS_PX = 20;
const TRAIL_DOWN_PX = 240;
const FOAM_LINE_ACROSS_PX = [2.5, 7] as const;
const FOAM_LAID_FAINTEST = 0.45;
const FOAM_LIFE = [0.5, 1.5] as const;
/** The light on the slopes of the waves comes from the north-west, as on the relief (TerrainShading). */
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
/** The noises go round every this many of their cells: the hash without sine repeats exactly there. */
const NOISE_PERIOD = 4096;
/** The shader needs this many uniform vectors at least, with the rest of the water: under, no wind sea is drawn. */
export const WIND_SEA_UNIFORM_VECTORS = 128;

/** The factor of the breaking slope for a wind (km/h), read between the measures of BREAKING_FACTORS. */
export function breakingFactorFor(windKmh: number): number {
    return between(BREAKING_FACTORS, windKmh);
}

/** What the shader draws for a wind: its waves, where it blows, and the slope at which their crests break. */
export interface SeaDrawing {
    windMs: number;
    /** A hurricane crosses the map: the wind of the sea is its own at each point (seaWindHere). */
    hurricane?: SeaHurricane;
    heading: { x: number; y: number };
    components: SeaComponent[];
    /** The slope a crest breaks at; Infinity when the law whitens nothing (no foam at all). */
    breakingSlope: number;
    /** The groups of waves: the length of a cell of their field (map px) and how fast they go downwind (map px a s). */
    group: { lengthPx: number; speedPx: number };
    /** The foam the crests leave: its opacity, and how much more densely it is laid (leftFoamFor). */
    left: { opacity: number; cutShift: number; life: number };
    /** The cut of the noise along the crests under which they do not break (CREST_CUTS). */
    crestCut: number;
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
        crestCut: between(CREST_CUTS, windKmh),
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
    let p = along / group.lengthPx - drift;
    let q = across / (GROUP_ACROSS * group.lengthPx) + 51;
    const bendP = seaNoise(p * 0.5 + 5, q * 0.5 + 9);
    const bendQ = seaNoise(p * 0.5 + 23, q * 0.5 + 41);
    p += GROUP_WARP * (bendP - 0.5);
    q += GROUP_WARP * (bendQ - 0.5);
    return GROUP_LOWEST + GROUP_RANGE * (0.65 * seaNoise(p, q) + 0.35 * seaNoise(2 * p + 17, 2 * q + 3));
}

/** How much of a crest breaks at a map point, 0 to 1 (CREST_ALONG_PX): the twin of seaCrest. */
export function crestAt(sea: SeaDrawing, x: number, y: number): number {
    const { heading } = sea;
    const down = (x * heading.x + y * heading.y) / CREST_DOWN_PX;
    const along = (-x * heading.y + y * heading.x) / CREST_ALONG_PX;
    return smoothstep(sea.crestCut, sea.crestCut + 0.2, seaNoise(along + 71, down + 13));
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
        front *
        crestAt(sea, x, y)
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
// The field of the groups: 1 / its cell down the wind and across it (map px), its drift (cells, wrapped); the cut of
// the noise along the crests under which they do not break.
uniform vec4 uSeaGroup;
// The hurricane of the room (Hurricane.ts, hurricaneHere), while one crosses the map: its eye (map px), the radius of
// its strongest winds (map px), the way it turns (1 anticlockwise, -1 clockwise, 0 none); its strongest wind (m/s),
// Holland's B, the motion it adds where its wind is strongest (m/s, east and south); how much of it has taken over the
// wind of the map, the cosine and the sine of its inflow, the wind the waves are drawn for (m/s).
uniform vec4 uHurEye;
uniform vec4 uHurWind;
uniform vec4 uHurMix;
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
// The wind here (seaWindHere): where it goes (map px, a unit) and its speed (m/s); how much of the height of the
// waves drawn it raises (1 without a hurricane).
vec3 gSeaWind;
float gSeaScale;

// Under a hurricane, where a point lies in the frame of its flow, map px at the radius of the strongest winds: along
// the wind (x) and across it (y), on its streamlines, logarithmic spirals turned in by the inflow
// (ln r + spin tan(inflow) theta is the same all along one). Twice: with an angle in (-pi, pi] and one in [0, 2 pi),
// mixed by gFlowMix away from where each wraps, so that no seam shows. Noise laid in it follows the wind round the eye.
vec2 gFlowA;
vec2 gFlowB;
float gFlowMix;

void seaFlowHere(vec2 d, float r) {
    float theta = atan(-d.y, d.x);
    float theta2 = theta < 0.0 ? theta + 6.2831853 : theta;
    float lnr = log(max(r, 1.0) / uHurEye.z);
    float spin = uHurEye.w;
    float turnIn = spin * uHurMix.z / uHurMix.y;
    // Along and across the wind, at the radius of the strongest winds; downwind, the foam drifts.
    float drift = uSeaDir.w * ${glsl(FOAM_LINE_ALONG_PX)};
    gFlowA = vec2(spin * theta * uHurEye.z - drift, (lnr + turnIn * theta) * uHurEye.z * uHurMix.y);
    gFlowB = vec2(spin * theta2 * uHurEye.z - drift, (lnr + turnIn * theta2) * uHurEye.z * uHurMix.y);
    gFlowMix = smoothstep(1.5707963, 2.8274334, abs(theta));
}

float seaNoise(vec2 p);

// seaNoise of (across / acrossPx, along / alongPx) + offset in the frame of the flow (seaFlowHere).
float seaFlowNoise(float acrossPx, float alongPx, vec2 offset) {
    float a = seaNoise(vec2(gFlowA.y / acrossPx, gFlowA.x / alongPx) + offset);
    float b = seaNoise(vec2(gFlowB.y / acrossPx, gFlowB.x / alongPx) + offset);
    return mix(a, b, gFlowMix);
}

// The wind at a map point: that of the sea (uSeaDir, uSea.x) without a hurricane; under one, its wind there, mixed
// with that of the map at the ends of its passage, the waves as high as the square of its speed over the wind they
// are drawn for (none in the eye). The twin of hurricaneHere.
void seaWindHere(vec2 world) {
    gSeaWind = vec3(uSeaDir.xy, uSea.x);
    gSeaScale = 1.0;
    if (uHurEye.w == 0.0) return;
    vec2 d = world - uHurEye.xy;
    float r = length(d);
    float share = 0.0;
    vec2 outward = vec2(0.0);
    if (r > 0.001) {
        float x = pow(uHurEye.z / r, uHurWind.y);
        share = sqrt(x * exp(1.0 - x));
        outward = d / r;
    }
    // Round the eye (east, south), turned in towards it, and the motion of the storm where its wind blows.
    vec2 around = vec2(outward.y, -outward.x) * uHurEye.w;
    vec2 storm = uHurWind.x * share * (uHurMix.y * around - uHurMix.z * outward) + uHurWind.zw * share;
    vec2 wind = mix(uSeaDir.xy * uSea.x, storm, uHurMix.x);
    float speed = length(wind);
    gSeaWind = vec3(speed > 0.0001 ? wind / speed : uSeaDir.xy, speed);
    float ratio = speed / max(uHurMix.w, 0.1);
    gSeaScale = min(1.0, ratio * ratio);
    seaFlowHere(d, r);
}

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
        return `    gSeaA${at} = gSeaScale * cap * ${fade} * sqrt(gSeaA${at} * scale);
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
    // Under a hurricane, groups of waves along its flow round the eye.
    if (uHurEye.w != 0.0) {
        return ${glsl(GROUP_LOWEST)} + ${glsl(GROUP_RANGE)}
            * (0.65 * seaFlowNoise(1.0 / uSeaGroup.y, 1.0 / uSeaGroup.x, vec2(51.0, 0.0))
                + 0.35 * seaFlowNoise(0.5 / uSeaGroup.y, 0.5 / uSeaGroup.x, vec2(17.0, 3.0)));
    }
    float along = dot(p, gSeaWind.xy);
    float across = dot(p, vec2(-gSeaWind.y, gSeaWind.x));
    vec2 q = vec2(along * uSeaGroup.x - uSeaGroup.z, across * uSeaGroup.y + 51.0);
    vec2 bend = vec2(seaNoise(q * 0.5 + vec2(5.0, 9.0)), seaNoise(q * 0.5 + vec2(23.0, 41.0)));
    q += ${glsl(GROUP_WARP)} * (bend - 0.5);
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
    float front = dot(gSeaSlope, gSeaWind.xy) <= 0.0 ? 1.0 : 0.0;
    float breaking = smoothstep(slope * ${glsl(1 - BREAKING_EDGE)}, slope * ${glsl(1 + BREAKING_EDGE)}, length(gSeaSlope))
        * (gSeaEta >= 0.0 ? 1.0 : 0.0) * front;
    if (breaking <= 0.0) return 0.0;
    // Along part of the crest only (crestAt); under a hurricane, in the frame of its flow, and only where the waves
    // drawn (one direction for the whole view) go the way the wind blows here: elsewhere their crests would stand
    // across the wind, and the streaks of the wind here take their place.
    if (uHurEye.w != 0.0) {
        breaking *= smoothstep(0.8, 0.97, dot(uSeaDir.xy, gSeaWind.xy));
        return breaking * smoothstep(uSeaGroup.w, uSeaGroup.w + 0.2,
            seaFlowNoise(${glsl(CREST_ALONG_PX)}, ${glsl(CREST_DOWN_PX)}, vec2(71.0, 13.0)));
    }
    vec2 crest = vec2(dot(world, vec2(-gSeaWind.y, gSeaWind.x)) / ${glsl(CREST_ALONG_PX)} + 71.0,
        dot(world, gSeaWind.xy) / ${glsl(CREST_DOWN_PX)} + 13.0);
    return breaking * smoothstep(uSeaGroup.w, uSeaGroup.w + 0.2, seaNoise(crest));
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

// The white sheet of a hurricane (spumeShare): long streaks of foam and spray along the wind, laid over the waves,
// which join into a milky white as the wind passes 40 m/s, still streaked. They drift with the foam left.
float seaSpume(vec2 world) {
    float share = smoothstep(${glsl(SPUME_FROM_MS)}, ${glsl(SPUME_WHOLE_MS)}, gSeaWind.z);
    if (share <= 0.0) return 0.0;
    vec2 heading = gSeaWind.xy;
    float down = dot(world, heading) - uSeaDir.w * ${glsl(FOAM_LINE_ALONG_PX)};
    float side = dot(world, vec2(-heading.y, heading.x));
    float streaks = uHurEye.w != 0.0
        // Under a hurricane, along its flow round the eye.
        ? 0.6 * seaFlowNoise(${glsl(SPUME_ACROSS_PX)}, ${glsl(SPUME_ALONG_PX)}, vec2(0.0))
            + 0.4 * seaFlowNoise(${glsl(SPUME_ACROSS_PX / 2)}, ${glsl(SPUME_ALONG_PX / 3)}, vec2(5.0, 11.0))
        : 0.6 * seaNoise(vec2(side / ${glsl(SPUME_ACROSS_PX)}, down / ${glsl(SPUME_ALONG_PX)}))
            + 0.4 * seaNoise(vec2(side / ${glsl(SPUME_ACROSS_PX / 2)} + 5.0, down / ${glsl(SPUME_ALONG_PX / 3)} + 11.0));
    // Few streaks at first, then most of the water: between them the white of the sheet itself.
    float cut = mix(0.8, 0.25, share);
    float streak = smoothstep(cut, cut + 0.2, streaks);
    return share * max(streak, share * ${glsl(SPUME_SHEET)});
}

float seaFoam(vec2 world) {
    float breaking = seaBreaking(world);
    vec2 uv = (world - uSeaFoamArea.xy) * uSeaFoamArea.zw;
    float left = uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0 ? texture2D(uSeaFoam, uv).r : 0.0;
    return max(max(breaking, left * uSea.w), seaSpume(world));
}

// The spray the wind tears off the sea: a haze over the water that hides its waves, from 30 m/s on (Beaufort 12:
// "the air is filled with foam and spray"). 0 to SPRAY_MOST.
float seaSpray() {
    return ${glsl(SPRAY_MOST)} * smoothstep(${glsl(SPUME_FROM_MS)}, ${glsl(SPRAY_WHOLE_MS)}, gSeaWind.z);
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
// How much longer the foam lasts than FOAM_DECAY_S, on the mean (leftFoamFor).
uniform float uFoamLife;

void main() {
    vec2 world = uFoamArea.xy + gl_FragCoord.xy / uFoamTexels * uFoamArea.zw;
    float dt = uFoamStep.x;
    // The wind here: under a hurricane, its own (seaWindHere).
    seaWindHere(world);
    // Where this point is in the frame of the foam, which drifts down the wind (map px): each trail keeps its kind.
    vec2 heading = gSeaWind.xy;
    float down = dot(world, heading) - uSeaDir.w * ${glsl(FOAM_LINE_ALONG_PX)};
    float side = dot(world, vec2(-heading.y, heading.x));
    vec2 trail = vec2(side / ${glsl(TRAIL_ACROSS_PX)}, down / ${glsl(TRAIL_DOWN_PX)});
    // Under a hurricane, its trails and lines follow its flow round the eye (seaFlowNoise).
    bool flowing = uHurEye.w != 0.0;
    // Where the foam here was a step ago: upwind by the drift.
    vec2 uv = (world - heading * uSeaDir.z * (gSeaWind.z / max(uSea.x, 0.1)) * dt - uFoamBeforeArea.xy)
        / uFoamBeforeArea.zw;
    float kept = 0.0;
    if (uFoamStep.w < 0.5 && uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
        float life = mix(${glsl(FOAM_LIFE[0])}, ${glsl(FOAM_LIFE[1])}, flowing
            ? seaFlowNoise(${glsl(TRAIL_ACROSS_PX)}, ${glsl(TRAIL_DOWN_PX)}, vec2(29.0, 17.0))
            : seaNoise(trail + vec2(29.0, 17.0)));
        // Under a hurricane that goes fast (the speed of the map), its eye would leave behind it trails laid round
        // where it was: they last the less, the faster it goes (as they do at 1 m/s, its pace over 5 min).
        if (flowing) life *= clamp(${glsl(HURRICANE_FOAM_PACE_MS)} * ${glsl(HURRICANE_MOTION_SHARE)}
            / max(length(uHurWind.zw), 0.001), 0.12, 1.0);
        kept = texture2D(uFoamBefore, uv).r * exp(-dt / (${glsl(FOAM_DECAY_S)} * uFoamLife * life));
        // Rounded at random to the bytes of the picture: no foam stuck at its last step.
        kept += (hashWide(gl_FragCoord.xy + vec2(uFoamStep.y * 7.0, uFoamStep.y * 13.0)) - 0.5) / 255.0;
    }
    float laid = 0.0;
    float depthPx = seaOpenDepthPx(world);
    if (uSea.z > 0.5 && uSea.y < 50.0 && depthPx > 0.0) {
        seaAmplitudes(seaFetchM(world), depthPx * ${glsl(MAP_PX_METRES)});
        float breaking = seaBreaking(world);
        if (breaking > 0.0) {
            float width = mix(${glsl(FOAM_LINE_ACROSS_PX[0])}, ${glsl(FOAM_LINE_ACROSS_PX[1])}, flowing
                ? seaFlowNoise(${glsl(TRAIL_ACROSS_PX)}, ${glsl(TRAIL_DOWN_PX)}, vec2(13.0, 7.0))
                : seaNoise(trail + vec2(13.0, 7.0)));
            float along = down / ${glsl(FOAM_LINE_ALONG_PX)};
            float across = side / width;
            float lines = flowing
                ? 0.65 * seaFlowNoise(width, ${glsl(FOAM_LINE_ALONG_PX)}, vec2(0.0))
                    + 0.35 * seaFlowNoise(width * 0.5, ${glsl(FOAM_LINE_ALONG_PX / 2)}, vec2(9.0, 0.0))
                : 0.65 * seaNoise(vec2(across, along)) + 0.35 * seaNoise(vec2(across * 2.0 + 9.0, along * 2.0));
            float cut = ${glsl(FOAM_LINE_CUT)} - uFoamStep.z;
            float white = mix(${glsl(FOAM_LAID_FAINTEST)}, 1.0, flowing
                ? seaFlowNoise(${glsl(TRAIL_ACROSS_PX)}, ${glsl(TRAIL_DOWN_PX)}, vec2(61.0, 3.0))
                : seaNoise(trail + vec2(61.0, 3.0)));
            laid = breaking * white * mix(${glsl(FOAM_OFF_LINE)}, 1.0, smoothstep(cut, cut + 0.15, lines));
        }
    }
    gl_FragColor = vec4(clamp(max(kept, laid), 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * The hurricane over the wind sea (seaWindHere): its eye and the radius of its strongest winds (map px), the way it
 * turns, its strongest wind (m/s), Holland's B, the motion it adds where its wind is strongest (m/s, east and south),
 * how much of it has taken over the wind of the map, its inflow (radians).
 */
export interface SeaHurricane {
    eyeX: number;
    eyeY: number;
    rmaxPx: number;
    spin: 1 | -1;
    maxMs: number;
    hollandB: number;
    motionEast: number;
    motionSouth: number;
    share: number;
    inflow: number;
}

/** The uniforms of the hurricane over the wind sea: none (its eye "turning" 0) without one. */
function hurricaneUniforms(sea: SeaDrawing | undefined): [string, number[]][] {
    const storm = sea?.hurricane;
    if (!sea || !storm || !(storm.share > 0)) {
        return [
            ["uHurEye", [0, 0, 1, 0]],
            ["uHurWind", [0, 1, 0, 0]],
            ["uHurMix", [0, 1, 0, 1]],
        ];
    }
    return [
        ["uHurEye", [storm.eyeX, storm.eyeY, storm.rmaxPx, storm.spin]],
        ["uHurWind", [storm.maxMs, storm.hollandB, storm.motionEast, storm.motionSouth]],
        ["uHurMix", [storm.share, Math.cos(storm.inflow), Math.sin(storm.inflow), sea.windMs]],
    ];
}

/** The uniforms of the wind sea at `seconds` of the clock of the shaders, for `sea` (undefined: none drawn). */
export function windSeaUniforms(sea: SeaDrawing | undefined, seconds: number): [string, number[]][] {
    const uniforms: [string, number[]][] = hurricaneUniforms(sea);
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
        [
            "uSeaGroup",
            [1 / sea.group.lengthPx, 1 / (GROUP_ACROSS * sea.group.lengthPx), groupDrift(sea, seconds), sea.crestCut],
        ],
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
