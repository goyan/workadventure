import * as Phaser from "phaser";
import { DEFAULT_POOL_STYLE, poolStyleAt, poolStyleOf } from "@workadventure/map-editor";
import type { PoolStyle } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "@wa/front/Phaser/Game/CanvasTextureRefresh";
import { DEEP_ICE_PX, POOL_ICE_DEPTH_PX } from "@wa/front/Phaser/Game/Weather/Frost";
import type { WaterCycle } from "@wa/front/Phaser/Game/Weather/Frost";
import type { WaterRing } from "@wa/front/Phaser/Game/Catastrophe/MeteorFall";
import { SHORE_PX } from "./TerrainShading";
import { WHITECAP_MIN_DEPTH_PX } from "./Whitecaps";
import { GROUND_TEXTURES } from "./TexturedGround";
import type { GroundArea } from "./TexturedGround";

/**
 * The grounds of the relief drawn on the graphics card, as a game draws its terrain: one picture of the weights of each
 * ground (a "splat map", a pixel per cell, smooth between cells) and two shaders that read it.
 *
 * - The ground shader blends the six soils by their weight and their height (the bright grains of a texture stand over
 *   the dark ones: a gravel pokes into the sand, the grass grows in tufts before covering), bends every edge with a
 *   noise fixed to the map, then lays the grass as thick as it grows and the snow over them.
 * - The water shader, over the shades of the relief, draws the water from its depth: clear over the shallows, dark
 *   where deep, a moving surface, a line of foam lapping at the shore and the ground darkened by the wet around it.
 *
 * The weights change with the ground only; the depth of the water, a channel of the same picture, at each drawing of
 * the water: one small upload (a few hundred cells a side), the textures of the grounds are never redrawn.
 */

/**
 * The picture of the weights: four packs side by side, each the size of the area (a pixel per cell): six soils, the
 * grass, the snow and the water; the relief (how deep a cell is dug, how high it is raised, in map pixels) and the
 * ash; the straw and the fire of the meadow, and what is outdoors; the pools (whether a cell is one, how deep, whether
 * hot), the colour of their water and of their coping; the ice the server keeps over the water (its thickness, see
 * iceByte), whether a cell is a pool placed as an image and whether it holds water; the moisture of the soil the
 * server keeps (pack 9, green, its red the foam of the waves), and two packs to spare.
 */
const PACKS = 12;
/** The packs are laid in a grid this many wide (and PACKS / PACKS_ACROSS high): a wide view stays within the size a
 * texture may have on a phone. */
const PACKS_ACROSS = 4;
const PACKS_DOWN = PACKS / PACKS_ACROSS;
/** The depth of water (map pixels) the water channel reaches its full value at. */
const WATER_SCALE_PX = 128;
/** The depth (0 to 1 of WATER_SCALE_PX) times this is how far a deep water reaches over the cells around it. */
const SHORE_GAIN = 12;
/**
 * The reflectance of a ground soaked, against the same ground dry (linear, visible light). Porous soils lose about
 * half of it: 0.4 to 0.6 for soils (Lobell & Asner 2002, Soil Sci. Soc. Am. J. 66:722), a loam's albedo from about
 * 0.30 dry to 0.14 wet (Idso et al. 1975, J. Appl. Meteorol. 14:109), sand about 0.4 dry and 0.23 wet. Rock, gravel and
 * grass are a choice, not sourced: a stone does not drink (a film only), the blades of grass are not porous.
 */
export const WET_REFLECTANCE = {
    earth: 0.54,
    meadow: 0.54,
    clay: 0.48,
    sand: 0.55,
    rock: 0.8,
    gravel: 0.65,
    grass: 0.9,
} as const;
const SRGB_GAMMA = 2.2;
/** The weights of the red, green and blue in the luminance (Rec. 709, linear). */
const LUMA = [0.2126, 0.7152, 0.0722] as const;
/**
 * How much a wet ground deepens its colour, 0 (a plain darkening) to 1 (each channel darkened as a grey of its own
 * brightness would be): half, a choice; the sources give the darkening, not how much the colour deepens.
 */
const WET_DEEPENING = 0.5;
/** How fast the reflectance falls with the moisture of the soil (0 to 1): most of the darkening by half of it. */
const MOISTURE_CURVE = 3;
/** A number as GLSL reads it. */
const glsl = (value: number): string => value.toFixed(4);
/** How strong the dark of the hollows and the light of the mounts are, against the bare relief: the water and the
 * textures already tell the depth. */
const RELIEF_SHADE = 0.6;
/** Texture units the ground shader needs: the weights, six soils, the grass and the snow. */
const UNITS_NEEDED = 9;

const SOIL_KEYS = [
    GROUND_TEXTURES.earth,
    GROUND_TEXTURES.meadow,
    GROUND_TEXTURES.clay,
    GROUND_TEXTURES.sand,
    GROUND_TEXTURES.rock,
    GROUND_TEXTURES.gravel,
] as const;

const COMMON_GLSL = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uData;
uniform vec4 uArea;   // x, y, width, height of the area, in map pixels
uniform vec2 uCells;  // columns, rows
uniform float uTime;  // seconds

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 17.0) + 0.2 * vnoise(p * 4.01 + 31.0);
}

// The point of the map under this pixel, snapped to the pixels of the map: the patterns keep the pixel art.
vec2 worldPoint() {
    vec2 world = uArea.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uArea.zw;
    return floor(world) + 0.5;
}

// One pack of the weights at a point of the map, smooth between the centres of the cells.
vec3 packIn(float index, vec2 cell) {
    float across = mod(index, ${PACKS_ACROSS}.0);
    float down = floor(index / ${PACKS_ACROSS}.0);
    vec2 uv = vec2(
        (cell.x + across * uCells.x) / (uCells.x * ${PACKS_ACROSS}.0),
        1.0 - (cell.y + down * uCells.y) / (uCells.y * ${PACKS_DOWN}.0)
    );
    return texture2D(uData, uv).rgb;
}

vec3 pack(float index, vec2 world) {
    return packIn(index, clamp((world - uArea.xy) / uArea.zw * uCells, vec2(0.5), uCells - 0.5));
}

// One pack at the centre of the cell of a point: its exact value, never blended with a neighbour (a colour, a style).
vec3 packNearest(float index, vec2 world) {
    vec2 cell = floor(clamp((world - uArea.xy) / uArea.zw * uCells, vec2(0.0), uCells - 1.0)) + 0.5;
    return packIn(index, cell);
}

// A ground texture repeated at its own size, fixed to the map.
vec4 ground(sampler2D tex, vec2 size, vec2 world) {
    return texture2D(tex, fract(world / size));
}

float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

// An edge bent by the noise of the map, only where the weight is between 0 and 1.
float bend(float level, float noise, float strength) {
    return clamp(level + noise * strength * 4.0 * level * (1.0 - level), 0.0, 1.0);
}

// How wet the soil is from its moisture as the server keeps it (pack 9, green): fast with the first water, then level
// (groundWetness is the twin of this rule).
float soakedAt(vec2 world) {
    float moisture = pack(9.0, world).g;
    return (1.0 - exp(-${MOISTURE_CURVE}.0 * moisture)) / (1.0 - exp(-${MOISTURE_CURVE}.0));
}
`;

const GROUND_FRAG = `${COMMON_GLSL}
uniform sampler2D uSoil0;
uniform sampler2D uSoil1;
uniform sampler2D uSoil2;
uniform sampler2D uSoil3;
uniform sampler2D uSoil4;
uniform sampler2D uSoil5;
uniform sampler2D uGrass;
uniform sampler2D uSnow;
uniform vec2 uSoilSize;
uniform vec2 uGrassSize;
uniform vec2 uSnowSize;
uniform float uAutumn;
uniform float uReliefShade;
uniform float uFrost;
uniform float uWet;

// The height of the ground at a point, in map pixels: raised over the map, or dug under it.
float heightAt(vec2 world) {
    vec3 relief = pack(3.0, world);
    return (relief.g - relief.r) * 255.0;
}

// How much the height of a texture counts against its weight where two soils meet; rocks stand out most.
const float HEIGHT = 0.35;
const float BLEND = 0.02;

// The score of a soil at a point: its weight, its edge bent, raised by the brightness (height) of its texture.
float score(float weight, vec4 sample, float height, float index, vec2 world) {
    if (weight <= 0.001) return -1.0;
    float wobble = vnoise(world / 22.0 + index * 13.7) - 0.5;
    return bend(weight, wobble, 0.9) + luma(sample.rgb) * height;
}

// The colour of a ground of this reflectance (wet over dry) this wet: darker by the reflectance, its colour deepened
// (wetColor is the twin of this rule).
vec3 wetColour(vec3 colour, float reflectance, float wet) {
    float target = 1.0 - (1.0 - reflectance) * clamp(wet, 0.0, 1.0);
    if (target >= 0.9999) return colour;
    vec3 weights = vec3(${LUMA.map(glsl).join(", ")});
    vec3 linear = pow(max(colour, vec3(0.0)), vec3(${glsl(SRGB_GAMMA)}));
    float lit = clamp(dot(linear, weights), 0.02, 0.98);
    float power = 1.0 + log(target) / log(lit) * ${glsl(WET_DEEPENING)};
    vec3 deep = pow(linear, vec3(power));
    float scale = target * dot(linear, weights) / max(0.0001, dot(deep, weights));
    return pow(min(vec3(1.0), deep * scale), vec3(1.0 / ${glsl(SRGB_GAMMA)}));
}

// Height blending: only the soils close to the best score show, the others fade out over BLEND.
void blend(inout vec4 sum, float score, float best, vec4 sample) {
    float share = max(score - best + BLEND, 0.0);
    sum += vec4(sample.rgb * share, share);
}

void main() {
    vec2 world = worldPoint();
    vec3 a = pack(0.0, world);
    vec3 b = pack(1.0, world);
    vec3 c = pack(2.0, world);

    vec4 t0 = ground(uSoil0, uSoilSize, world);
    vec4 t1 = ground(uSoil1, uSoilSize, world);
    vec4 t2 = ground(uSoil2, uSoilSize, world);
    vec4 t3 = ground(uSoil3, uSoilSize, world);
    vec4 t4 = ground(uSoil4, uSoilSize, world);
    vec4 t5 = ground(uSoil5, uSoilSize, world);
    float s0 = score(a.r, t0, HEIGHT, 0.0, world);
    float s1 = score(a.g, t1, HEIGHT, 1.0, world);
    float s2 = score(a.b, t2, HEIGHT, 2.0, world);
    float s3 = score(b.r, t3, HEIGHT, 3.0, world);
    float s4 = score(b.g, t4, HEIGHT * 2.2, 4.0, world);
    float s5 = score(b.b, t5, HEIGHT * 1.5, 5.0, world);
    float best = max(max(max(s0, s1), max(s2, s3)), max(s4, s5));
    vec4 sum = vec4(0.0);
    blend(sum, s0, best, t0);
    blend(sum, s1, best, t1);
    blend(sum, s2, best, t2);
    blend(sum, s3, best, t3);
    blend(sum, s4, best, t4);
    blend(sum, s5, best, t5);
    float soils = clamp(a.r + a.g + a.b + b.r + b.g + b.b, 0.0, 1.0);
    float edgeNoise = 0.65 * vnoise(world / 26.0) + 0.35 * vnoise(world / 9.0 + 17.3) - 0.5;
    float soilAlpha = step(0.5, bend(soils, edgeNoise, 1.5));
    vec3 color = sum.a > 0.0 ? sum.rgb / sum.a : vec3(0.0);
    // Where two soils meet, a soft groove: the seam reads as a change of ground, not a fade.
    float mixed = sum.a > 0.0 ? 1.0 - clamp((sum.a - BLEND) / BLEND, 0.0, 1.0) : 0.0;
    color *= 1.0 - 0.12 * mixed;
    vec4 outColor = vec4(color * soilAlpha, soilAlpha);
    // The reflectance of the ground soaked against dry (WET_REFLECTANCE): by its soil, earth where none is painted (as
    // the server counts it), then by what lies over it.
    float weights = a.r + a.g + a.b + b.r + b.g + b.b;
    float tone = weights > 0.001
        ? (a.r * ${glsl(WET_REFLECTANCE.earth)} + a.g * ${glsl(WET_REFLECTANCE.meadow)}
            + a.b * ${glsl(WET_REFLECTANCE.clay)} + b.r * ${glsl(WET_REFLECTANCE.sand)}
            + b.g * ${glsl(WET_REFLECTANCE.rock)} + b.b * ${glsl(WET_REFLECTANCE.gravel)}) / weights
        : ${glsl(WET_REFLECTANCE.earth)};

    // The grass, in tufts: a thin meadow shows its brightest blades first, a full one covers everything.
    float cover = c.r;
    if (cover > 0.002) {
        vec4 grass = ground(uGrass, uGrassSize, world);
        float field = 0.55 * luma(grass.rgb) + 0.45 * fbm(world / 14.0);
        cover = bend(cover, edgeNoise, 1.2);
        float threshold = 1.0 - cover;
        float grassAlpha = step(threshold, field) * step(0.02, cover);
        vec3 blade = grass.rgb;
        if (uAutumn > 0.0) {
            // Autumn: the grass yellows a little, in wide patches; it stays a meadow, not straw. The fallen leaves
            // are the seasonal decor of the map, not drawn here.
            vec3 yellowed = blade * vec3(1.12, 0.98, 0.66) + vec3(0.05, 0.02, 0.0);
            blade = mix(blade, yellowed, (0.3 + 0.35 * vnoise(world / 90.0)) * uAutumn);
        }
        outColor = vec4(blade * grassAlpha, grassAlpha) + outColor * (1.0 - grassAlpha);
        tone = mix(tone, ${glsl(WET_REFLECTANCE.grass)}, grassAlpha);
    }

    // What the weather and the fire did to the meadow: straw where it dried, ash where it burnt, the glow of the fire.
    vec3 burnt = pack(4.0, world);
    float ash = pack(3.0, world).b;
    float straw = burnt.r;
    float fire = burnt.g;
    if (straw > 0.002) {
        float dry = step(1.0 - bend(straw, edgeNoise, 1.2), 0.5 * hash(floor(world)) + 0.5 * fbm(world / 10.0));
        // Cured grass, in wide patches from bleached blond to dry khaki (STRAW_COLOR is their middle), with a grain
        // kept narrow enough that the palest straw stays darker than the sand.
        vec3 strawColor = mix(vec3(0.753, 0.659, 0.439), vec3(0.663, 0.608, 0.4), vnoise(world / 48.0 + 5.1));
        strawColor *= 0.9 + 0.15 * hash(floor(world / 2.0) + 3.0);
        float strawAlpha = dry * 0.92;
        outColor = vec4(strawColor * strawAlpha, strawAlpha) + outColor * (1.0 - strawAlpha);
        tone = mix(tone, ${glsl(WET_REFLECTANCE.grass)}, strawAlpha);
    }
    if (ash > 0.002) {
        // Burnt ground in patches, flecked with grey ash: it goes back patch by patch as the grass grows again.
        float burntField = 0.6 * fbm(world / 12.0) + 0.4 * hash(floor(world / 2.0));
        float ashAlpha = step(1.0 - bend(ash, edgeNoise, 1.2), burntField + 0.15) * 0.85;
        float fleck = step(0.86, hash(floor(world) + 11.0));
        vec3 ashColor = mix(vec3(0.09, 0.075, 0.06), vec3(0.45, 0.43, 0.4), fleck);
        outColor = vec4(ashColor * ashAlpha, ashAlpha) + outColor * (1.0 - ashAlpha);
    }
    if (fire > 0.002) {
        float glow = step(1.0 - fire, 0.5 + 0.5 * vnoise(world / 6.0 + uTime * 2.0)) * 0.85;
        vec3 glowColor = mix(vec3(1.0, 0.48, 0.1), vec3(1.0, 0.8, 0.3), vnoise(world / 4.0 - uTime * 3.0));
        outColor = vec4(glowColor * glow, glow) + outColor * (1.0 - glow);
        tone = mix(tone, 1.0, glow);
    }

    // The snow of the heights, its edge bent like the soils.
    float snow = c.g;
    if (snow > 0.002) {
        vec4 flakes = ground(uSnow, uSnowSize, world);
        float snowAlpha = step(0.45, bend(snow, edgeNoise + (luma(flakes.rgb) - 0.8) * 0.4, 1.4));
        outColor = vec4(flakes.rgb * snowAlpha, snowAlpha) + outColor * (1.0 - snowAlpha);
        tone = mix(tone, 1.0, snowAlpha);
    }

    // The ground wet (groundWetness): by the rain of the air of the player (Frost.ts), by the moisture of its soil the
    // server keeps, under the water of the relief (pack 8, blue): the most of the three, never their sum. Darker as
    // its soil drinks (tone), in clear steps, with a sheen; then white with frost when it freezes.
    float outdoors = step(0.5, pack(4.0, world).b);
    // The rain darkens the grounds the shaders paint, as before; the moisture and the water, those of the server,
    // wet the tiles of the map too.
    float rain = outColor.a > 0.002 ? uWet * outdoors : 0.0;
    // The moisture is kept a tile (32 px) at a time: read over a tile around, so that it fades without the steps of
    // the tiles, and its edge bent by the same noise as the edges of the soils.
    float soaked = 0.25 * (soakedAt(world + vec2(8.0, 8.0)) + soakedAt(world + vec2(-8.0, 8.0))
        + soakedAt(world + vec2(8.0, -8.0)) + soakedAt(world + vec2(-8.0, -8.0)));
    float moistEdge = step(0.5, bend(clamp(soaked * 4.0, 0.0, 1.0), edgeNoise, 1.5));
    float wet = min(1.0, max(max(rain, soaked * moistEdge), pack(8.0, world).b));
    if (wet > 0.001) {
        // The colour deepens (wetColour), it is not veiled; over a ground the shaders do not paint (the tiles of the
        // map, whose colour the shader does not know), a veil of the darkening of a wet earth.
        if (outColor.a > 0.002) outColor.rgb = wetColour(outColor.rgb / outColor.a, tone, wet) * outColor.a;
        float veil = (1.0 - outColor.a) * (1.0 - ${glsl(Math.pow(WET_REFLECTANCE.earth, 1 / SRGB_GAMMA))}) * wet;
        outColor.a += veil;
        // A soaked ground glints here and there: the white of the sky, no colour of its own.
        float sheen = step(0.9, fbm(world / 5.0)) * smoothstep(0.6, 1.0, wet) * 0.15;
        outColor.rgb += vec3(sheen) * outColor.a;
    }
    // No frost holds where the ground burns, nor on its ash while it is still warm.
    if (uFrost * outdoors > 0.001 && fire + ash < 0.02) {
        float rime = step(1.0 - uFrost * 0.9, 0.55 * fbm(world / 9.0) + 0.45 * hash(floor(world) + 7.0));
        float rimeAlpha = rime * 0.8;
        outColor = vec4(vec3(0.9, 0.95, 1.0) * rimeAlpha, rimeAlpha) + outColor * (1.0 - rimeAlpha);
    }

    // The relief, in clear steps: the dark of a hollow, the light of a mount, the slopes lit from the north-west. The
    // same shades as the bare relief (TerrainShading), cut in bands and bent at their edges like the soils.
    vec3 relief = pack(3.0, world);
    float cellPx = uArea.z / uCells.x;
    float east = heightAt(world + vec2(cellPx, 0.0)) - heightAt(world - vec2(cellPx, 0.0));
    float south = heightAt(world + vec2(0.0, cellPx)) - heightAt(world - vec2(0.0, cellPx));
    float dither = (hash(floor(world / 2.0)) - 0.5) * 0.18 + edgeNoise * 0.25;
    float slope = clamp((east + south) / 64.0, -1.0, 1.0);
    slope = floor(slope * 4.0 + 0.5 + dither) / 4.0;
    float dug = relief.r * 255.0;
    float raised = relief.g * 255.0;
    float hollow = dug > 0.5 ? 0.5 * pow(min(1.0, dug / 96.0), 0.7) : 0.0;
    float mount = raised > 0.5 ? 0.3 * pow(min(1.0, raised / 96.0), 0.7) : 0.0;
    hollow = max(0.0, floor(hollow * 8.0 + 0.5 + dither) / 8.0) * uReliefShade;
    mount = max(0.0, floor(mount * 8.0 + 0.5 + dither) / 8.0) * uReliefShade;
    float dark = clamp(hollow + max(-slope, 0.0) * 0.25, 0.0, 0.85);
    float light = clamp(mount + max(slope, 0.0) * 0.25, 0.0, 0.6);
    outColor = vec4(0.0, 0.0, 0.0, dark) + outColor * (1.0 - dark);
    outColor = vec4(vec3(light), light) + outColor * (1.0 - light);

    if (outColor.a <= 0.002) discard;
    gl_FragColor = outColor;
}
`;

const WATER_FRAG = `${COMMON_GLSL}
uniform float uStrength;
uniform sampler2D uIceTexture;
uniform vec2 uIceSize;
uniform float uIce;
uniform float uSnow;
// 1 for a player who follows the weather of the server: the ice and the snow on it are those the server keeps, cell
// by cell; 0 for one who follows a place of their own: the ice of their own cold (uIce), the snow of their map.
uniform float uServerIce;
// The wind over the water: which way it blows (a vector of length 1) and the share of open water its whitecaps
// whiten (Whitecaps.ts), 0 in a light wind.
uniform vec3 uWind;
// The fronts of the waves of the comets fallen into the water (x, y, radius in map pixels, strength 0 to 1).
uniform vec4 uRing0;
uniform vec4 uRing1;
uniform vec4 uRing2;
uniform vec4 uRing3;

// The water raised by the front of a comet's wave, and lowered just behind it: -1 to 1.
float ringAt(vec4 ring, vec2 world) {
    if (ring.w <= 0.0) return 0.0;
    float d = distance(world, ring.xy) - ring.z;
    return ring.w * (exp(-d * d / 50.0) - 0.6 * exp(-(d + 9.0) * (d + 9.0) / 70.0));
}

float ringsAt(vec2 world) {
    return ringAt(uRing0, world) + ringAt(uRing1, world) + ringAt(uRing2, world) + ringAt(uRing3, world);
}

// The snow lying on the ice, in drifts that grow with the snow of the map.
vec3 snowOnIce(vec3 ice, vec2 world) {
    float snow = mix(uSnow, pack(2.0, world).g, uServerIce);
    if (snow <= 0.001) return ice;
    float drift = 0.6 * fbm(world / 11.0) + 0.4 * hash(floor(world / 2.0));
    float covered = step(1.0 - snow * 0.95, drift);
    return mix(ice, vec3(0.95, 0.97, 1.0) * (0.94 + 0.06 * hash(floor(world))), covered);
}

// The whitecaps of the wind at a point of open water, 0 to 1: short crests lying across the wind, each in a cell of
// a grid laid along it (14 px across the wind, 7 along). A cell breaks for a second and a half, by chance, as
// often as the wind asks: a crest fills about a third of its cell, so the share of the cells is three times that
// of the water. They drift slowly downwind.
float whitecapsAt(vec2 world, float t) {
    float share = uWind.z;
    if (share <= 0.0) return 0.0;
    vec2 along = uWind.xy;
    vec2 across = vec2(-along.y, along.x);
    vec2 p = vec2(dot(world, across) / 14.0, (dot(world, along) - t * 3.0) / 7.0);
    // Every other row is shifted: no columns of crests.
    p.x += 0.5 * mod(floor(p.y), 2.0);
    vec2 cell = floor(p);
    float phase = t / 1.5 + hash(cell + 3.7);
    float turn = floor(phase);
    float life = fract(phase);
    float breaks = step(hash(cell + turn * 17.0 + 11.0), min(1.0, share * 3.0));
    if (breaks <= 0.0) return 0.0;
    vec2 q = fract(p) - 0.5 - (vec2(hash(cell + turn + 1.3), hash(cell + turn + 2.9)) - 0.5) * 0.3;
    // A crest: long across the wind, thin along it, its edge torn by a fine noise.
    float shape = 1.0 - smoothstep(0.5, 1.0, length(q * vec2(2.6, 5.0)) + (vnoise(world / 2.0) - 0.5) * 0.7);
    return breaks * shape * smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.55, 1.0, life));
}

const vec3 SHALLOW = vec3(0.1, 0.48, 0.52);
const vec3 DEEP = vec3(0.05, 0.17, 0.34);
const vec3 FOAM = vec3(0.93, 0.97, 1.0);

// Whether the pool goes on d map pixels around a point, in eight directions: false near its rim (its coping).
float poolAround(vec2 world, float d) {
    float least = 1.0;
    for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.785398;
        least = min(least, pack(5.0, world + vec2(cos(angle), sin(angle)) * d).r);
    }
    return step(0.5, least);
}

// A pool at a point inside its shape: its coping along the rim, then its tiled floor through its water (or its ice).
vec4 poolColor(vec2 world, float t) {
    vec3 style = packNearest(5.0, world);
    vec3 water = packNearest(6.0, world);
    vec3 coping = packNearest(7.0, world);
    if (poolAround(world, 6.0) < 0.5) {
        // Coping stones, 8 px a side, their joints dark, the inner edge lit.
        vec2 stone = mod(world, 8.0);
        float joint = max(step(7.0, stone.x), step(7.0, stone.y));
        vec3 c = coping * (0.94 + 0.08 * hash(floor(world / 8.0))) * (1.0 - 0.2 * joint);
        c *= mix(1.08, 1.0, poolAround(world, 3.0));
        return vec4(c, 1.0);
    }
    float depthPx = style.g * 255.0;
    float deep = clamp(depthPx / 160.0, 0.0, 1.0);
    bool cold = style.b < 0.5 && step(0.5, pack(4.0, world).b) > 0.5 &&
        uIce >= 0.1 + 0.9 * min(1.0, ${POOL_ICE_DEPTH_PX}.0 / ${DEEP_ICE_PX}.0);
    // A painted pool has the ice the server keeps on it for a player who follows its weather; a pool placed as an
    // image (the green of pack 8), which the server does not know, keeps the rule of the cold.
    vec3 kept = pack(8.0, world);
    bool frozen = uServerIce > 0.5 && kept.g < 0.5 ? kept.r >= 0.0707 : cold;
    // How full the pool is, 0 to 1: a painted pool holds the water of the relief, which the server fills (it may
    // have been emptied); a pool placed as an image is always full.
    float held = pack(2.0, world).b * ${WATER_SCALE_PX}.0;
    float fill = kept.g > 0.5 ? 1.0 : clamp(held / max(1.0, min(depthPx, ${WATER_SCALE_PX}.0) - 4.0), 0.0, 1.0);
    // Wet as soon as a film of water lies on its floor; how much of the colour of deep water it takes follows its
    // level, so a pool half emptied looks half empty: its tiles show through a thin, pale water.
    float wetness = smoothstep(0.0, 0.06, fill);
    if (frozen && fill > 0.05) {
        vec3 ice = texture2D(uIceTexture, fract(world / uIceSize)).rgb;
        return vec4(snowOnIce(ice * mix(vec3(1.0), water, 0.15), world), 1.0);
    }
    // The floor tiles, 16 px, seen through the water: the deeper, the more the water's own colour.
    vec2 tile = mod(world, 16.0);
    float grout = max(step(15.0, tile.x), step(15.0, tile.y));
    vec3 floorColor = mix(vec3(0.9, 0.95, 0.96), vec3(0.72, 0.82, 0.86), grout);
    // Emptied, the dry tiles of its floor show, darker towards its walls; the water comes back over them as it fills.
    vec3 dry = floorColor * 0.86;
    vec3 seen = floorColor * mix(vec3(1.0), water * 0.6 + 0.4, 0.35 + 0.65 * fill);
    vec3 c = mix(seen, water * 0.55, (0.3 + 0.55 * deep) * fill);
    c = mix(dry, c, wetness);
    // The walls shade the water along them.
    c *= mix(0.82, 1.0, poolAround(world, 12.0));
    // Caustics over the floor, and a glint now and then on the surface.
    vec2 p = world / 34.0;
    float n1 = fbm(p + vec2(t * 0.09, t * 0.05));
    float n2 = fbm(p * 1.7 - vec2(t * 0.06, -t * 0.08) + 5.0);
    float lines = 1.0 - smoothstep(0.0, 0.05, abs(n1 - n2));
    c += lines * mix(0.2, 0.08, deep) * wetness;
    float glint = step(0.993, hash(floor(world / 2.0) + floor(t * 3.0))) * smoothstep(0.55, 0.7, n2);
    c = mix(c, vec3(1.0), glint * 0.7 * wetness);
    return vec4(c, 1.0);
}

// How much water is over a point: 0 dry, 1 at the shore line, more inside.
float wetAt(vec2 world) {
    return pack(2.0, world).b;
}

void main() {
    vec2 world = worldPoint();
    float t = uTime;
    float depth = wetAt(world);
    // Next to a pool, the depth smoothed between the cells would spill the water of the pool half a cell over its
    // coping: there the water is that of the cell itself, so a dry terrace stays dry up to the stones. The corner of
    // a cell of the pool left outside its rounded shape shows no water: it is under the coping.
    float poolEdge = pack(5.0, world).r;
    if (poolEdge > 0.02 && poolEdge <= 0.5) {
        depth = packNearest(5.0, world).r > 0.5 ? 0.0 : packNearest(2.0, world).b;
    }
    // The ice (Frost.ts): it takes the shallows first, the deep water last; frozen, nothing moves any more.
    float depthPx = depth * ${WATER_SCALE_PX}.0;
    float frozenAt = 0.1 + 0.9 * min(1.0, depthPx / ${DEEP_ICE_PX}.0) + (vnoise(world / 14.0) - 0.5) * 0.08;
    float outdoors = step(0.5, pack(4.0, world).b);
    // The ice of the server: the root of its thickness over a metre, 0.0707 at the 5 mm one slips on.
    float kept = pack(8.0, world).r;
    float keptFrozen = step(0.0707, kept + (vnoise(world / 14.0) - 0.5) * 0.02);
    float frozen = depthPx > 0.0 ? mix(step(frozenAt, uIce) * outdoors, keptFrozen, uServerIce) : 0.0;
    float still = 1.0 - frozen;
    // The shore: the water of a cell reaches the middle of the next, bent by a noise that drifts slowly (lapping).
    // However thin, water reaches the edge of its cell: whether a cell holds any (pack 8, blue), apart from how
    // deep it is, keeps a film of a few centimetres from vanishing (waterShoreLevel is the twin of this rule).
    float level = max(clamp(depth * ${SHORE_GAIN}.0, 0.0, 1.0), pack(8.0, world).b);
    float drift = fbm(world / 18.0 + vec2(t * 0.05, -t * 0.04) * still) - 0.5;
    float edge = bend(level, drift, 1.3);
    float cover = step(0.5, edge);

    // The ground around the water, darkened by the wet: the mean of the water a cell around.
    float around = 0.0;
    float cellPx = uArea.z / uCells.x;
    for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.785398;
        around += wetAt(world + vec2(cos(angle), sin(angle)) * cellPx * 0.9);
    }
    float damp = clamp(around * 2.5, 0.0, 1.0) * (1.0 - cover);
    if (damp > 0.001) {
        // The coping of a pool keeps the ground around it dry: no dark ring of wet earth on a terrace.
        float nearPool = 0.0;
        for (int i = 0; i < 8; i++) {
            float angle = float(i) * 0.785398;
            nearPool = max(nearPool, pack(5.0, world + vec2(cos(angle), sin(angle)) * cellPx * 0.9).r);
        }
        damp *= 1.0 - step(0.25, nearPool);
    }
    vec4 outColor = vec4(0.0, 0.0, 0.0, 0.3 * damp);
    // The ground shader darkens the soil by its moisture as the server keeps it: this ring adds only what that left.
    outColor *= 1.0 - soakedAt(world);

    if (cover > 0.001 && frozen > 0.5) {
        // Ice as on the rinks of the map, a little darker over the deep water under it.
        vec3 ice = texture2D(uIceTexture, fract(world / uIceSize)).rgb;
        ice *= 1.0 - 0.12 * clamp(depthPx / 128.0, 0.0, 1.0);
        ice = snowOnIce(ice, world);
        // A thin ice of the server lets the water show through; one that bears a walker (50 mm) is whole.
        float thick = clamp(kept * kept * 1000.0 / 50.0, 0.0, 1.0);
        float iceAlpha = mix(0.96, mix(0.6, 0.96, thick), uServerIce) * cover;
        outColor = vec4(ice * iceAlpha, iceAlpha) + outColor * (1.0 - iceAlpha);
    } else if (cover > 0.001) {
        float deep = clamp(depth * ${WATER_SCALE_PX}.0 / 64.0, 0.0, 1.0);
        vec3 water = mix(SHALLOW, DEEP, deep);
        // A film thinner than the shore of the water (SHORE_PX) is clear: a few centimetres of water have no colour,
        // the wet ground shows through it, deepened by the ground shader, under the glints of its surface. The colour
        // of the water comes with its depth.
        float film = smoothstep(1.0, ${SHORE_PX}.0, depthPx);
        float alpha = mix(0.5, 0.92, deep) * mix(0.05, 1.0, film);

        // The waves of the comets: a bright crest running to the shores, a dark trough behind, the surface pushed.
        float shock = ringsAt(world);
        water += shock * 0.22;
        alpha = clamp(alpha + abs(shock) * 0.15, 0.0, 1.0);

        // The surface: two noises sliding across each other; where they cross, bright lines of light (caustics
        // over the shallows, glints over the deep).
        vec2 p = (world + vec2(shock * 5.0)) / 46.0;
        float n1 = fbm(p + vec2(t * 0.06, t * 0.035));
        float n2 = fbm(p * 1.6 - vec2(t * 0.045, -t * 0.07) + 9.0);
        float lines = 1.0 - smoothstep(0.0, 0.04, abs(n1 - n2));
        water += lines * mix(0.14, 0.07, deep);
        water *= 0.9 + 0.2 * n1;
        float glint = step(0.992, hash(floor(world / 2.0) + floor(t * 3.0))) * smoothstep(0.55, 0.7, n2);
        water = mix(water, FOAM, glint * 0.8);
        alpha = max(alpha, glint * 0.8);

        // The foam where the water meets the shore: a band that comes and goes, broken by a fine noise.
        float band = step(0.5, edge) * (1.0 - step(0.66, edge));
        float wave = 0.5 + 0.5 * sin(t * 1.6 + drift * 12.0);
        float froth = smoothstep(0.35, 0.6, fbm(world / 5.0 + vec2(t * 0.25, 0.0)) * (0.6 + 0.6 * wave));
        // A film too thin to break does not froth.
        float foam = band * froth * film;

        // The foam of the waves that break and of the floods that advance (BreakingFoam.ts, the red of pack 9):
        // a froth torn by a fine noise that boils, whole where the foam is strong, in flecks where it fades.
        float broken = pack(9.0, world).r;
        float boil = fbm(world / 3.5 + vec2(t * 0.35, -t * 0.25));
        float surf = smoothstep(0.78 - 0.62 * broken, 0.9 - 0.62 * broken, boil) * step(0.03, broken);
        foam = max(foam, surf * 0.92);

        // The whitecaps of the wind, on open water outdoors.
        float open = outdoors * step(${WHITECAP_MIN_DEPTH_PX}.0, depthPx);
        foam = max(foam, whitecapsAt(world, t) * open * 0.85);

        water = mix(water, FOAM, foam);
        alpha = max(alpha, foam * 0.9);

        float waterAlpha = alpha * cover;
        outColor = vec4(water * waterAlpha, waterAlpha) + outColor * (1.0 - waterAlpha);
    }

    outColor *= uStrength;

    // The pools (Terrain/Pools.ts): drawn whole, over the water of the relief, in their own colours.
    if (pack(5.0, world).r > 0.5) {
        vec4 pool = poolColor(world, t);
        outColor = pool + outColor * (1.0 - pool.a);
    }

    if (outColor.a <= 0.002) discard;
    gl_FragColor = outColor;
}
`;

let splatCount = 0;
/** How many waves of comets the water shader draws at once. */
const MAX_WATER_RINGS = 4;

/** What the ground shader is given: the weight of each soil (by its number in the map), the grass, the snow. */
export interface GroundWeights {
    soils: Map<number, Uint8Array>;
    /** The cover of the grass, 0 to 255; undefined where none grows. */
    grass: Uint8Array | undefined;
    /** The snow, 0 to 255; undefined: none. */
    snow: Uint8Array | undefined;
    /** The ice the server keeps over the water, a byte a cell (iceByte); undefined: none. */
    ice?: Uint8Array;
    /** The moisture of the soil as the server keeps it, 0 (dry) to 255 (sodden); undefined: none known. */
    moisture?: Uint8Array;
    /** 0 in summer, 1 in autumn: the grass yellows. */
    autumn: number;
    /** How deep each cell is dug and how high it is raised, in map pixels (to 255). */
    dug: Uint8Array;
    raised: Uint8Array;
    /** The straw, the ash and the fire of the meadow, 0 to 255; undefined: none. */
    straw: Uint8Array | undefined;
    ash: Uint8Array | undefined;
    fire: Uint8Array | undefined;
    /** 1 on the outdoor cells; undefined: all outdoors. Indoors the ground and the water never freeze nor get wet. */
    outdoor: Uint8Array | undefined;
    /** The styles of the pools of the map (their cells are among `soils`, see Terrain/Pools.ts). */
    poolStyles: readonly PoolStyle[] | undefined;
    /** The pools placed as images, drawn in the default style in their place: 1 cold, 2 heated (ImagePools.ts). */
    imagePools?: Uint8Array;
}

/**
 * The textured grounds and the water of the relief, drawn by two shaders over an area of the map. Undefined from
 * `create` where the graphics card cannot run them (no WebGL, too few texture units): the masked grounds are drawn then.
 */
export class GroundSplat {
    private readonly key = `ground-splat-${++splatCount}`;
    private readonly groundShader: Phaser.GameObjects.Shader;
    private readonly waterShader: Phaser.GameObjects.Shader;
    private area: GroundArea | undefined;
    private pixels: ImageData | undefined;
    private strength = 1;
    private anyGround = false;
    private anyWater = false;
    private anyPool = false;

    public static create(scene: Phaser.Scene, groundDepth: number, waterDepth: number): GroundSplat | undefined {
        const renderer = scene.game.renderer;
        if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return undefined;
        const units = Number(renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_IMAGE_UNITS));
        if (!(units >= UNITS_NEEDED)) return undefined;
        return new GroundSplat(scene, groundDepth, waterDepth);
    }

    private constructor(
        private readonly scene: Phaser.Scene,
        groundDepth: number,
        waterDepth: number,
    ) {
        const time = (): number => this.scene.time.now / 1000;
        this.groundShader = scene.add
            .shader(
                {
                    name: "GroundSplat",
                    fragmentSource: GROUND_FRAG,
                    setupUniforms: (setUniform: (name: string, value: unknown) => void) => {
                        this.setCommonUniforms(setUniform, time());
                        SOIL_KEYS.forEach((_, index) => setUniform(`uSoil${index}`, index + 1));
                        setUniform("uGrass", 7);
                        setUniform("uSnow", 8);
                        setUniform("uSoilSize", this.sizeOf(SOIL_KEYS[0]));
                        setUniform("uGrassSize", this.sizeOf(GROUND_TEXTURES.grass));
                        setUniform("uSnowSize", this.sizeOf(GROUND_TEXTURES.snow));
                        setUniform("uAutumn", this.autumn);
                        setUniform("uReliefShade", RELIEF_SHADE);
                        setUniform("uFrost", this.cycle.frost);
                        setUniform("uWet", this.cycle.wet);
                    },
                },
                0,
                0,
                1,
                1,
                ["__DEFAULT", ...SOIL_KEYS, GROUND_TEXTURES.grass, GROUND_TEXTURES.snow],
            )
            .setOrigin(0)
            .setDepth(groundDepth)
            .setVisible(false);
        this.waterShader = scene.add
            .shader(
                {
                    name: "WaterSplat",
                    fragmentSource: WATER_FRAG,
                    setupUniforms: (setUniform: (name: string, value: unknown) => void) => {
                        this.setCommonUniforms(setUniform, time());
                        setUniform("uStrength", this.strength);
                        setUniform("uIceTexture", 1);
                        setUniform("uIceSize", this.sizeOf(GROUND_TEXTURES.ice));
                        setUniform("uIce", this.cycle.ice);
                        setUniform("uSnow", this.snow);
                        setUniform("uServerIce", this.serverIce ? 1 : 0);
                        setUniform("uWind", [this.wind.x, this.wind.y, this.wind.share]);
                        for (let index = 0; index < MAX_WATER_RINGS; index++) {
                            const ring = this.rings[index];
                            setUniform(
                                `uRing${index}`,
                                ring ? [ring.x, ring.y, ring.radius, ring.strength] : [0, 0, 0, 0],
                            );
                        }
                    },
                },
                0,
                0,
                1,
                1,
                ["__DEFAULT", GROUND_TEXTURES.ice],
            )
            .setOrigin(0)
            .setDepth(waterDepth)
            .setVisible(false);
    }

    private autumn = 0;
    /** The cycle of the water this player sees (Frost.ts): frost, ice and wet ground. */
    private cycle: WaterCycle = { frost: 0, ice: 0, wet: 0 };
    private snow = 0;
    /** Whether the ice drawn is the one the server keeps (GroundSource), not the one of this player's own cold. */
    private serverIce = false;
    private rings: readonly WaterRing[] = [];
    /** The wind over the water: which way it blows and the share of open water its whitecaps whiten. */
    private wind = { x: 0, y: 1, share: 0 };

    /** Lays the grounds over `area` from their weights. Nothing to draw: the ground shader is hidden. */
    public setGround(area: GroundArea, weights: GroundWeights): void {
        const pixels = this.pixelsFor(area);
        const { columns, rows } = area;
        const data = pixels.data;
        const at = (pack: number, cell: number): number => texel(pack, cell, columns, rows);
        const pools = poolCellsOf(weights.soils, columns * rows);
        let any = false;
        for (let cell = 0; cell < columns * rows; cell++) {
            for (let soil = 0; soil < 6; soil++) {
                const value = weights.soils.get(soil + 1)?.[cell] ? 255 : 0;
                if (value) any = true;
                data[at(Math.floor(soil / 3), cell) + (soil % 3)] = value;
            }
            const grass = weights.grass?.[cell] ?? 0;
            const snow = weights.snow?.[cell] ?? 0;
            data[at(2, cell)] = grass;
            data[at(2, cell) + 1] = snow;
            const relief = at(3, cell);
            data[relief] = weights.dug[cell] ?? 0;
            data[relief + 1] = weights.raised[cell] ?? 0;
            data[relief + 2] = weights.ash?.[cell] ?? 0;
            const meadow = at(4, cell);
            data[meadow] = weights.straw?.[cell] ?? 0;
            data[meadow + 1] = weights.fire?.[cell] ?? 0;
            data[meadow + 2] = weights.outdoor ? (weights.outdoor[cell] ? 255 : 0) : 255;
            const image = weights.imagePools?.[cell] ?? 0;
            const style = pools[cell]
                ? poolStyleAt(weights.poolStyles, pools[cell] - 1)
                : image
                  ? { ...DEFAULT_POOL_STYLE, hot: image === 2 }
                  : undefined;
            const pool = at(5, cell);
            data[pool] = style ? 255 : 0;
            data[pool + 1] = style ? Math.min(255, Math.round(style.depthPx)) : 0;
            data[pool + 2] = style?.hot ? 255 : 0;
            writeColor(data, at(6, cell), style?.water);
            writeColor(data, at(7, cell), style?.coping);
            data[at(8, cell)] = weights.ice?.[cell] ?? 0;
            data[at(8, cell) + 1] = image ? 255 : 0;
            const moisture = weights.moisture?.[cell] ?? 0;
            if (grass || snow || style || moisture || data[relief] || data[relief + 1] || data[relief + 2]) any = true;
            if (data[meadow] || data[meadow + 1]) any = true;
        }
        writeMoisture(data, weights.moisture, columns, rows);
        this.anyPool = pools.some((value) => value > 0) || (weights.imagePools?.some((value) => value > 0) ?? false);
        if (this.anyPool) spreadPoolColours(data, columns, rows);
        if (any) smoothWeights(data, columns, rows);
        this.autumn = weights.autumn;
        this.anyGround = any;
        this.upload();
        this.place(this.groundShader, area, any || this.anyWater);
        // The pools are drawn by the water shader, over the shades of the relief: it shows with them, water or not.
        this.place(this.waterShader, area, this.anyWater || this.anyPool);
    }

    /**
     * The depth of the water over the area (map pixels a cell, as the area of `setGround`); undefined: dry. With the
     * foam of its waves, cell by cell (0 to 255); undefined: none.
     */
    public setWater(wet: Uint8Array | undefined, strength: number, foam?: Uint8Array): void {
        const area = this.area;
        const pixels = this.pixels;
        if (!area || !pixels) return;
        this.strength = strength;
        const { columns, rows } = area;
        const any = writeWater(pixels.data, wet, columns, rows);
        // The foam of the waves, in the red of pack 9.
        writeFoam(pixels.data, wet, foam, columns, rows);
        if (!any && !this.anyWater) return;
        this.anyWater = any;
        this.upload();
        // The ground under the water is wet: the ground shader darkens it, painted or not.
        this.place(this.groundShader, area, this.anyGround || any);
        this.place(this.waterShader, area, any || this.anyPool);
    }

    /** Whether water is drawn: its surface moves, the scene must be drawn again for it. */
    /** The frost, the ice and the wet of now: read by the shaders at their next drawing. */
    public setCycle(cycle: WaterCycle): void {
        this.cycle = cycle;
    }

    /** The wind over the water: which way it blows (length 1) and the share of open water its whitecaps whiten. */
    public setWind(wind: { x: number; y: number; share: number }): void {
        this.wind = wind;
    }

    /** The fronts of the waves of the comets fallen into the water: the first MAX_WATER_RINGS are drawn. */
    public setRings(rings: readonly WaterRing[]): void {
        this.rings = rings;
    }

    public hasRings(): boolean {
        return this.rings.length > 0;
    }

    /** Whether the ice drawn is the one the server keeps, cell by cell (a player who follows its weather). */
    public setServerIce(serverIce: boolean): void {
        this.serverIce = serverIce;
    }

    /** How much the snow of the map covers the ground, 0 to 1: it lies on the ice too. */
    public setSnow(snow: number): void {
        this.snow = snow;
    }

    public hasWater(): boolean {
        return (this.anyWater || this.anyPool) && this.waterShader.visible;
    }

    public hide(): void {
        this.groundShader.setVisible(false);
        this.waterShader.setVisible(false);
        this.anyWater = false;
        this.anyGround = false;
        this.anyPool = false;
    }

    public destroy(): void {
        this.groundShader.destroy();
        this.waterShader.destroy();
        if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    }

    private setCommonUniforms(setUniform: (name: string, value: unknown) => void, time: number): void {
        const area = this.area;
        setUniform("uData", 0);
        setUniform("uTime", time);
        setUniform("uArea", area ? [area.x, area.y, area.columns * area.cell, area.rows * area.cell] : [0, 0, 1, 1]);
        setUniform("uCells", area ? [area.columns, area.rows] : [1, 1]);
    }

    private sizeOf(key: string): number[] {
        const source = this.scene.textures.exists(key) ? this.scene.textures.get(key).source[0] : undefined;
        return source ? [source.width, source.height] : [256, 256];
    }

    /** The pixels of the weights for this area; a new canvas when its size changes. */
    private pixelsFor(area: GroundArea): ImageData {
        const width = area.columns * PACKS_ACROSS;
        const height = area.rows * PACKS_DOWN;
        if (!this.pixels || this.pixels.width !== width || this.pixels.height !== height) {
            this.pixels = new ImageData(width, height);
            // Opaque: a canvas keeps its colours premultiplied, a weight in a transparent pixel would be lost.
            for (let at = 3; at < this.pixels.data.length; at += 4) this.pixels.data[at] = 255;
            if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
            const canvas = this.scene.textures.createCanvas(this.key, width, height);
            canvas?.setFilter(Phaser.Textures.FilterMode.LINEAR);
            this.groundShader.setTextures([this.key, ...SOIL_KEYS, GROUND_TEXTURES.grass, GROUND_TEXTURES.snow]);
            this.waterShader.setTextures([this.key, GROUND_TEXTURES.ice]);
            this.anyWater = false;
        }
        this.area = area;
        return this.pixels;
    }

    private upload(): void {
        const texture = this.scene.textures.get(this.key);
        if (!(texture instanceof Phaser.Textures.CanvasTexture) || !this.pixels) return;
        texture.getContext().putImageData(this.pixels, 0, 0);
        refreshCanvasTexture(texture);
    }

    private place(shader: Phaser.GameObjects.Shader, area: GroundArea, visible: boolean): void {
        shader
            .setPosition(area.x, area.y)
            .setSize(area.columns * area.cell, area.rows * area.cell)
            .setVisible(visible);
    }
}

/**
 * Rounds the weights of the grounds over their neighbours (a 1-2-1 blur, within each pack): an edge between two
 * grounds follows a curve, not the stairs of the cells. What is exact is left as it is: the water (it moves on its
 * own), what is outdoors, and the depth, the hot water and the colours of the pools.
 */
function smoothWeights(data: Uint8ClampedArray, columns: number, rows: number): void {
    const source = data.slice();
    // The ice of the server too (pack 8): its edge follows a curve.
    const channels: readonly (readonly number[])[] = [
        [0, 1, 2],
        [0, 1, 2],
        [0, 1],
        [0, 1, 2],
        [0, 1],
        [0],
        [],
        [],
        [0],
        // The moisture (green); the foam of the waves (red) is written with the water, after.
        [1],
    ];
    for (let pack = 0; pack < PACKS; pack++) {
        for (const channel of channels[pack] ?? []) {
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    let total = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        const y = Math.max(0, Math.min(rows - 1, row + dy));
                        for (let dx = -1; dx <= 1; dx++) {
                            const x = Math.max(0, Math.min(columns - 1, column + dx));
                            const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
                            total += weight * (source[texel(pack, y * columns + x, columns, rows) + channel] ?? 0);
                        }
                    }
                    data[texel(pack, row * columns + column, columns, rows) + channel] = Math.round(total / 16);
                }
            }
        }
    }
}

/** Where a cell of a pack is in the pixels of the weights (its red byte): the packs in a grid PACKS_ACROSS wide. */
/**
 * The colours of the pools also in the cells around them (their style, water and coping, not whether they are a pool):
 * the smoothed shape of a pool reaches into a cell beside it at an inner corner, drawn there in its colours, not black.
 */
export function spreadPoolColours(data: Uint8ClampedArray, columns: number, rows: number): void {
    const source = data.slice();
    const isPool = (column: number, row: number): boolean =>
        (source[texel(5, row * columns + column, columns, rows)] ?? 0) > 0;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            if (isPool(column, row)) continue;
            const from = poolNeighbour(column, row, columns, rows, isPool);
            if (from === undefined) continue;
            const cell = row * columns + column;
            for (const pack of [5, 6, 7]) {
                const to = texel(pack, cell, columns, rows);
                const at = texel(pack, from, columns, rows);
                for (let channel = pack === 5 ? 1 : 0; channel < 3; channel++)
                    data[to + channel] = source[at + channel] ?? 0;
            }
        }
    }
}

function poolNeighbour(
    column: number,
    row: number,
    columns: number,
    rows: number,
    isPool: (column: number, row: number) => boolean,
): number | undefined {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const x = column + dx;
            const y = row + dy;
            if (x >= 0 && y >= 0 && x < columns && y < rows && isPool(x, y)) return y * columns + x;
        }
    }
    return undefined;
}

/**
 * Writes the water of an area (pixels of water a cell, see TerrainWater.levelsOver) into the picture of the weights:
 * its depth (pack 2, blue) and, apart from it, whether a cell holds any (pack 8, blue). Returns whether any does.
 */
export function writeWater(
    data: Uint8ClampedArray,
    wet: Uint8Array | undefined,
    columns: number,
    rows: number,
): boolean {
    let any = false;
    for (let cell = 0; cell < columns * rows; cell++) {
        const depth = wet?.[cell] ?? 0;
        if (depth > 0) any = true;
        data[texel(2, cell, columns, rows) + 2] = Math.min(255, Math.round((depth * 255) / WATER_SCALE_PX));
        data[texel(8, cell, columns, rows) + 2] = depth > 0 ? 255 : 0;
    }
    return any;
}

/**
 * The level of the shore at a point, from the depth (0 to 1 of WATER_SCALE_PX) and the presence of water (0 to 1),
 * both smoothed between the cells: the water shader draws the point where this, bent by its noise, reaches one half.
 * The TypeScript twin of the rule of WATER_FRAG. A deep water reaches past the edge of its cell, as far as its depth
 * smoothed allows; however thin, water reaches the edge of its cell (the presence is one half there).
 */
export function waterShoreLevel(depth: number, present: number): number {
    return Math.max(Math.min(1, Math.max(0, depth * SHORE_GAIN)), present);
}

/**
 * The tone of a wet ground, against the same ground dry: how much of its colour is left (sRGB) when a ground of this
 * reflectance (wet over dry) is this wet (0 to 1). Water in the pores lowers the reflectance (Twomey, Bohren &
 * Mergenthaler 1986); the reflectance is linear, the colours drawn are sRGB. The twin of the rule of GROUND_FRAG.
 */
export function wetTone(reflectance: number, wet: number): number {
    return 1 - (1 - Math.pow(reflectance, 1 / SRGB_GAMMA)) * wet;
}

/**
 * How wet a ground is (0 to 1), from the rain of the air of the player (Frost.ts), the moisture of its soil as the
 * server keeps it (0 to 1, Meadow.ts) and the water over it (0 to 1, its presence): wet is wet, the most of the three,
 * never their sum. The reflectance falls fast with the first water then levels off (Lobell & Asner 2002). The twin of
 * the rule of GROUND_FRAG.
 */
/**
 * The colour (sRGB, 0 to 1) of a ground of this reflectance (wet over dry) this wet (0 to 1). Its luminance falls by the
 * reflectance; and as the light runs longer through the wet grains (Lekner & Dorf 1988, Twomey et al. 1986), a channel
 * the grains absorb more falls more: the colour deepens, its hue kept, never greyer. The twin of wetColour in GLSL.
 */
export function wetColor(colour: readonly number[], reflectance: number, wet: number): number[] {
    const target = 1 - (1 - reflectance) * Math.min(1, Math.max(0, wet));
    if (target >= 1) return [...colour];
    const linear = colour.map((channel) => Math.pow(Math.max(0, channel), SRGB_GAMMA));
    const luma = (rgb: readonly number[]): number => LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
    const lit = Math.min(0.98, Math.max(0.02, luma(linear)));
    const power = 1 + (Math.log(target) / Math.log(lit)) * WET_DEEPENING;
    const deep = linear.map((channel) => Math.pow(channel, power));
    const scale = (target * luma(linear)) / Math.max(1e-4, luma(deep));
    return deep.map((channel) => Math.pow(Math.min(1, channel * scale), 1 / SRGB_GAMMA));
}

export function groundWetness(rain: number, moisture: number, present: number): number {
    const soaked = (1 - Math.exp(-MOISTURE_CURVE * moisture)) / (1 - Math.exp(-MOISTURE_CURVE));
    return Math.min(1, Math.max(rain, soaked, present));
}

/** The byte of pack 9 that holds the moisture of the soil (green): the red is the foam of the waves. */
export const MOISTURE_CHANNEL = 1;

export function writeMoisture(
    data: Uint8ClampedArray,
    moisture: Uint8Array | undefined,
    columns: number,
    rows: number,
): void {
    for (let cell = 0; cell < columns * rows; cell++) {
        data[texel(9, cell, columns, rows) + MOISTURE_CHANNEL] = moisture?.[cell] ?? 0;
    }
}

export function writeFoam(
    data: Uint8ClampedArray,
    wet: Uint8Array | undefined,
    foam: Uint8Array | undefined,
    columns: number,
    rows: number,
): void {
    for (let cell = 0; cell < columns * rows; cell++) {
        data[texel(9, cell, columns, rows)] = (wet?.[cell] ?? 0) > 0 ? (foam?.[cell] ?? 0) : 0;
    }
}

export function texel(pack: number, cell: number, columns: number, rows: number): number {
    const across = pack % PACKS_ACROSS;
    const down = Math.floor(pack / PACKS_ACROSS);
    const row = Math.floor(cell / columns) + down * rows;
    const column = (cell % columns) + across * columns;
    return (row * columns * PACKS_ACROSS + column) * 4;
}

/** The style of pool of each cell, plus one (0: no pool), from the soils painted (a pool is kept as a soil). */
function poolCellsOf(soils: ReadonlyMap<number, Uint8Array>, size: number): Uint8Array {
    const pools = new Uint8Array(size);
    for (const [code, cells] of soils) {
        const style = poolStyleOf(code);
        if (style === undefined) continue;
        for (let cell = 0; cell < size; cell++) if (cells[cell]) pools[cell] = style + 1;
    }
    return pools;
}

function writeColor(data: Uint8ClampedArray, at: number, color: string | undefined): void {
    const value = color ? Number.parseInt(color.slice(1), 16) : 0;
    data[at] = (value >> 16) & 255;
    data[at + 1] = (value >> 8) & 255;
    data[at + 2] = value & 255;
}
