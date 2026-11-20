import * as Phaser from "phaser";
import { DEFAULT_POOL_STYLE, poolStyleAt, poolStyleOf } from "@workadventure/map-editor";
import type { PoolStyle } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "@wa/front/Phaser/Game/CanvasTextureRefresh";
import { DEEP_ICE_PX, POOL_ICE_DEPTH_PX } from "@wa/front/Phaser/Game/Weather/Frost";
import type { WaterCycle } from "@wa/front/Phaser/Game/Weather/Frost";
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
 * hot), the colour of their water and of their coping.
 */
const PACKS = 8;
/** The packs are laid in a grid this many wide (and PACKS / PACKS_ACROSS high): a wide view stays within the size a
 * texture may have on a phone. */
const PACKS_ACROSS = 4;
const PACKS_DOWN = PACKS / PACKS_ACROSS;
/** The depth of water (map pixels) the water channel reaches its full value at. */
const WATER_SCALE_PX = 128;
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
    }

    // What the weather and the fire did to the meadow: straw where it dried, ash where it burnt, the glow of the fire.
    vec3 burnt = pack(4.0, world);
    float ash = pack(3.0, world).b;
    float straw = burnt.r;
    float fire = burnt.g;
    if (straw > 0.002) {
        float dry = step(1.0 - bend(straw, edgeNoise, 1.2), 0.5 * hash(floor(world)) + 0.5 * fbm(world / 10.0));
        vec3 strawColor = vec3(0.88, 0.76, 0.29) * (0.85 + 0.3 * hash(floor(world / 2.0) + 3.0));
        float strawAlpha = dry * 0.92;
        outColor = vec4(strawColor * strawAlpha, strawAlpha) + outColor * (1.0 - strawAlpha);
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
    }

    // The snow of the heights, its edge bent like the soils.
    float snow = c.g;
    if (snow > 0.002) {
        vec4 flakes = ground(uSnow, uSnowSize, world);
        float snowAlpha = step(0.45, bend(snow, edgeNoise + (luma(flakes.rgb) - 0.8) * 0.4, 1.4));
        outColor = vec4(flakes.rgb * snowAlpha, snowAlpha) + outColor * (1.0 - snowAlpha);
    }

    // The cycle of the water (Frost.ts): the ground darkened by the rain, then white with frost when it freezes.
    float outdoors = step(0.5, pack(4.0, world).b);
    if (uWet * outdoors > 0.001 && outColor.a > 0.0) {
        outColor.rgb *= 1.0 - 0.3 * uWet;
        float sheen = step(0.82, fbm(world / 7.0)) * uWet * 0.25;
        outColor.rgb += vec3(0.55, 0.65, 0.75) * sheen * outColor.a;
    }
    if (uFrost * outdoors > 0.001) {
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

// The snow lying on the ice, in drifts that grow with the snow of the map.
vec3 snowOnIce(vec3 ice, vec2 world) {
    if (uSnow <= 0.001) return ice;
    float drift = 0.6 * fbm(world / 11.0) + 0.4 * hash(floor(world / 2.0));
    float covered = step(1.0 - uSnow * 0.95, drift);
    return mix(ice, vec3(0.95, 0.97, 1.0) * (0.94 + 0.06 * hash(floor(world))), covered);
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
    bool frozen = style.b < 0.5 && step(0.5, pack(4.0, world).b) > 0.5 &&
        uIce >= 0.1 + 0.9 * min(1.0, ${POOL_ICE_DEPTH_PX}.0 / ${DEEP_ICE_PX}.0);
    if (frozen) {
        vec3 ice = texture2D(uIceTexture, fract(world / uIceSize)).rgb;
        return vec4(snowOnIce(ice * mix(vec3(1.0), water, 0.15), world), 1.0);
    }
    // The floor tiles, 16 px, seen through the water: the deeper, the more the water's own colour.
    vec2 tile = mod(world, 16.0);
    float grout = max(step(15.0, tile.x), step(15.0, tile.y));
    vec3 floorColor = mix(vec3(0.9, 0.95, 0.96), vec3(0.72, 0.82, 0.86), grout);
    vec3 c = mix(floorColor * (water * 0.6 + 0.4), water * 0.55, 0.3 + 0.55 * deep);
    // The walls shade the water along them.
    c *= mix(0.82, 1.0, poolAround(world, 12.0));
    // Caustics over the floor, and a glint now and then on the surface.
    vec2 p = world / 34.0;
    float n1 = fbm(p + vec2(t * 0.09, t * 0.05));
    float n2 = fbm(p * 1.7 - vec2(t * 0.06, -t * 0.08) + 5.0);
    float lines = 1.0 - smoothstep(0.0, 0.05, abs(n1 - n2));
    c += lines * mix(0.2, 0.08, deep);
    float glint = step(0.993, hash(floor(world / 2.0) + floor(t * 3.0))) * smoothstep(0.55, 0.7, n2);
    c = mix(c, vec3(1.0), glint * 0.7);
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
    // The ice (Frost.ts): it takes the shallows first, the deep water last; frozen, nothing moves any more.
    float depthPx = depth * ${WATER_SCALE_PX}.0;
    float frozenAt = 0.1 + 0.9 * min(1.0, depthPx / ${DEEP_ICE_PX}.0) + (vnoise(world / 14.0) - 0.5) * 0.08;
    float outdoors = step(0.5, pack(4.0, world).b);
    float frozen = depthPx > 0.0 ? step(frozenAt, uIce) * outdoors : 0.0;
    float still = 1.0 - frozen;
    // The shore: the water of a cell reaches the middle of the next, bent by a noise that drifts slowly (lapping).
    float level = clamp(depth * 12.0, 0.0, 1.0);
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
    vec4 outColor = vec4(0.0, 0.0, 0.0, 0.3 * damp);

    if (cover > 0.001 && frozen > 0.5) {
        // Ice as on the rinks of the map, a little darker over the deep water under it.
        vec3 ice = texture2D(uIceTexture, fract(world / uIceSize)).rgb;
        ice *= 1.0 - 0.12 * clamp(depthPx / 128.0, 0.0, 1.0);
        ice = snowOnIce(ice, world);
        float iceAlpha = 0.96 * cover;
        outColor = vec4(ice * iceAlpha, iceAlpha) + outColor * (1.0 - iceAlpha);
    } else if (cover > 0.001) {
        float deep = clamp(depth * ${WATER_SCALE_PX}.0 / 64.0, 0.0, 1.0);
        vec3 water = mix(SHALLOW, DEEP, deep);
        float alpha = mix(0.5, 0.92, deep);

        // The surface: two noises sliding across each other; where they cross, bright lines of light (caustics
        // over the shallows, glints over the deep).
        vec2 p = world / 46.0;
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
        float foam = band * froth;
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

/** What the ground shader is given: the weight of each soil (by its number in the map), the grass, the snow. */
export interface GroundWeights {
    soils: Map<number, Uint8Array>;
    /** The cover of the grass, 0 to 255; undefined where none grows. */
    grass: Uint8Array | undefined;
    /** The snow, 0 to 255; undefined: none. */
    snow: Uint8Array | undefined;
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
            if (grass || snow || style || data[relief] || data[relief + 1] || data[relief + 2]) any = true;
            if (data[meadow] || data[meadow + 1]) any = true;
        }
        this.anyPool = pools.some((value) => value > 0) || (weights.imagePools?.some((value) => value > 0) ?? false);
        if (any) smoothWeights(data, columns, rows);
        this.autumn = weights.autumn;
        this.anyGround = any;
        this.upload();
        this.place(this.groundShader, area, any);
        // The pools are drawn by the water shader, over the shades of the relief: it shows with them, water or not.
        this.place(this.waterShader, area, this.anyWater || this.anyPool);
    }

    /** The depth of the water over the area (map pixels a cell, as the area of `setGround`); undefined: dry. */
    public setWater(wet: Uint8Array | undefined, strength: number): void {
        const area = this.area;
        const pixels = this.pixels;
        if (!area || !pixels) return;
        this.strength = strength;
        const { columns, rows } = area;
        const data = pixels.data;
        let any = false;
        for (let cell = 0; cell < columns * rows; cell++) {
            const depth = wet?.[cell] ?? 0;
            if (depth > 0) any = true;
            data[texel(2, cell, columns, rows) + 2] = Math.min(255, Math.round((depth * 255) / WATER_SCALE_PX));
        }
        if (!any && !this.anyWater) return;
        this.anyWater = any;
        this.upload();
        this.place(this.waterShader, area, any || this.anyPool);
    }

    /** Whether water is drawn: its surface moves, the scene must be drawn again for it. */
    /** The frost, the ice and the wet of now: read by the shaders at their next drawing. */
    public setCycle(cycle: WaterCycle): void {
        this.cycle = cycle;
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
    const channels: readonly (readonly number[])[] = [[0, 1, 2], [0, 1, 2], [0, 1], [0, 1, 2], [0, 1], [0], [], []];
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
function texel(pack: number, cell: number, columns: number, rows: number): number {
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
