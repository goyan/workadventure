import * as Phaser from "phaser";
import { billowDrift, CLOUD_BILLOW_PERIOD_PX, NOISE_GLSL, shaderSeconds, shaderWrap } from "../ShaderNoise";
import type { WeatherView } from "./WeatherFrame";
import type { CloudPatch } from "./Clouds";
import { MAX_CONTRAILS } from "./Contrails";
import { screenScale } from "./ScreenScale";
import type { Contrail } from "./Contrails";

/**
 * The sky of the weather drawn by the graphics card at every drawing of the weather: the clouds (of a clear sky, or of
 * the rain and the storm), their shadows and the grey veils of a covered sky. The clouds glide by fractions of a pixel
 * instead of jumping by whole blocks a few times a second (the block canvas, BlockSurface), and every edge is smooth,
 * the walls included. The fog stays in the block canvas.
 *
 * Two passes. The puffs of the clouds (cloudPatches) are added into a small texture of thickness, a few map pixels a
 * texel: each puff is a soft disc whose value falls as (1 - d²/r²)², as fieldLevels counts them. A shader then reads
 * that texture, smoothed between its texels, breaks it into billows and lights them, and draws the clouds over their
 * shadows and the veils, outdoors only (the outdoor rectangles of the map, drawn into a mask).
 */

export interface CloudSky {
    /** The puffs of the clouds over the view and CLOUD_LAYER_MARGIN around it. */
    patches: readonly CloudPatch[];
    /** Cumulus, frayed by a warped noise; omitted for the soft billows of fog. */
    cumulus?: boolean;
    /** The three tones of the clouds and the opacity of their body, night included (cloudTint). */
    tones: { lit: number; mid: number; shade: number };
    body: number;
    /** Where the shadows fall from the clouds (map pixels) and their opacity; undefined: none. */
    shadow: { x: number; y: number; alpha: number } | undefined;
}

export interface CloudFrame {
    /** The area of the map to draw over (the padded view). */
    view: WeatherView;
    /** How far the sky has drifted (SkyDrift), map pixels: the billows of the clouds go with them. */
    sky: { x: number; y: number };
    /** The clouds; undefined: only the veils. */
    clouds: CloudSky | undefined;
    /** The veils over the outdoors, one over the other: a colour and an opacity each. */
    veils: readonly { color: number; alpha: number }[];
    /** The outdoors of the map (rectangles, map pixels); undefined: everything is outdoors. */
    outdoors: readonly WeatherView[] | undefined;
    /** How much of a cloud passes over what is not outdoors (cloudsOverRoofs). */
    overRoofs: number;
    /** A rainbow (Rainbow.ts): its centre and radius (map pixels), the way it bows (a unit vector), its strength. */
    rainbow:
        | {
              x: number;
              y: number;
              radius: number;
              direction: { x: number; y: number };
              /** The cosine of the half opening of the arc around `direction`. */
              span: number;
              strength: number;
          }
        | undefined;
    /** Nothing moves (reduced motion): the billows of the clouds stay as they are. */
    still: boolean;
    /** The trails of the planes (Contrails.ts), over the clouds. */
    contrails?: readonly Contrail[];
    /** Where the trails cast their shadow on the ground (map pixels) and its opacity; undefined: no shadow. */
    contrailShadow?: { x: number; y: number; alpha: number };
}

/** How far a cloud looks towards the light (north-west) to tell its far side, in map pixels: as cloudTones. */
const SHADE_REACH = 48;
/** Thickness kept beyond the view: the longest shadow (6 tiles) and the look towards the light. */
export const CLOUD_LAYER_MARGIN = 6 * 32 + SHADE_REACH;
/**
 * Map pixels a texel of the thickness, at any zoom: a texel that followed the zoom changed the shape of the clouds at
 * each step of it (smoothed over 8 px or over 64 px, the billows do not cut the same outline).
 */
const CELL = 8;
/** The thickness texture grows by this many texels a side, so that a zoom does not make it again at every step. */
const TEXEL_STEP = 64;
/** Map pixels a texel of the outdoor mask, and how far it reaches beyond the view (redrawn when the view leaves it). */
const MASK_TEXEL = 4;
const MASK_MARGIN = 512;
const PUFF_TEXTURE = "weather-cloud-puff";
const PUFF_SIZE = 64;
const NOISE_TEXTURE = "weather-cloud-noise";
const NOISE_SIZE = 256;

const CLOUD_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uThickness;
uniform sampler2D uMask;
uniform sampler2D uNoise;     // 256² random texels, green = red shifted by 37 along x: a 3D noise in one fetch
uniform vec4 uArea;          // the area drawn, map pixels: x, y, width, height
uniform vec4 uThicknessArea; // the area of the thickness texture
uniform vec4 uMaskArea;      // the area of the outdoor mask
uniform float uAllOutdoor;   // 1: no mask, everything is outdoors
uniform float uClouds;       // 1 when there are clouds to draw
uniform float uCumulus;      // 1: cumulus, 0: the billows of fog
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform float uBody;
uniform float uOverRoofs;
uniform vec3 uShadow;        // x, y offset of the shadows (map pixels), their opacity
uniform vec4 uVeil;          // the veils over the outdoors, premultiplied
uniform vec2 uSky;           // how far the sky has drifted (map pixels): the billows go with their cloud
uniform vec2 uMotion;        // drift since the thickness texture was drawn, in map pixels
uniform float uEvolve;       // how far the 3D noise of the cumulus has evolved (cloudEvolution)
uniform vec4 uBillowA;      // how far the billows have drifted, octave by octave (ShaderNoise.billowDrift)
uniform vec2 uBillowB;
uniform vec4 uRainbow;       // centre x, y and radius of the rainbow (map pixels), its strength (0: none)
uniform vec4 uTrail0;        // a contrail: its first point (map pixels at the drawing), its direction
uniform vec4 uTrail1;
uniform vec4 uTrail2;
uniform vec4 uTrailInfo0;    // its length, map pixels of trail a second, its strength (0: none), its life (< 0: landed)
uniform vec4 uTrailInfo1;
uniform vec4 uTrailInfo2;
uniform vec3 uTrailCurve;    // how each plane turns (Contrail.curvature), 1 / map pixels, > 0 to the left
uniform float uPlaneLights;  // how bright the lights of the planes are (Contrail.lights), 0 by day
uniform float uTime;         // seconds on the clock of the shaders (shaderSeconds): the blinking of the lights
uniform float uScreenPx;     // map pixels a screen pixel covers: the lights keep their size on the screen
uniform vec2 uTrailWind;     // the drift of the air up there, map pixels a second
uniform vec3 uTrailShadow;   // x, y offset of the shadows of the trails on the ground (map pixels), their opacity
uniform vec2 uRainbowDir;    // the way the rainbow bows, away from the sun
uniform float uRainbowSpan;  // the cosine of the half opening of its arc

${NOISE_GLSL}

// The colours of a rainbow across its band: 0 violet (inside) to 1 red (outside).
vec3 spectrum(float t) {
    float hue = (1.0 - clamp(t, 0.0, 1.0)) * 0.75;
    return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// A rainbow over the outdoors: the bow, red outside, and a fainter second bow beyond it, its colours reversed; the
// sky a little brighter inside the bow, as it is. Only its arc bowed away from the sun, fading at both ends.
vec4 rainbow(vec2 world, float out_) {
    vec2 rel = world - uRainbow.xy;
    float r = length(rel);
    float along = dot(rel / max(r, 1.0), uRainbowDir);
    float arc = smoothstep(uRainbowSpan - 0.08, uRainbowSpan + 0.2, along);
    float width = uRainbow.z * 0.1;
    float band = (r - uRainbow.z) / width;
    float primary = smoothstep(0.0, 0.2, band) * (1.0 - smoothstep(0.8, 1.0, band));
    float band2 = (r - uRainbow.z * 1.22) / (width * 1.4);
    float secondary = smoothstep(0.0, 0.2, band2) * (1.0 - smoothstep(0.8, 1.0, band2));
    float inside = (1.0 - smoothstep(0.85, 1.0, r / uRainbow.z)) * 0.06;
    vec3 colour = spectrum(band) * primary * 0.42 + spectrum(1.0 - band2) * secondary * 0.16 + vec3(inside);
    float alpha = max(max(primary * 0.42, secondary * 0.16), inside) * arc * uRainbow.w * mix(0.5, 1.0, out_);
    return vec4(colour * arc * uRainbow.w * mix(0.5, 1.0, out_), alpha);
}

float sampleThickness(vec2 world) {
    vec2 uv = (world - uMotion - uThicknessArea.xy) / uThicknessArea.zw;
    // Stored bottom up, as the canvas textures.
    return texture2D(uThickness, vec2(uv.x, 1.0 - uv.y)).r;
}

// Four bilinear samples half a texel apart: the plain filter bends at each texel, and a relief lit from its slope
// showed those bends as stairs of ${CELL} map pixels. Their average bends smoothly.
float thickness(vec2 world) {
    float h = ${CELL / 2}.0;
    return 0.25 * (sampleThickness(world + vec2(-h, -h)) + sampleThickness(world + vec2(h, -h)) +
        sampleThickness(world + vec2(-h, h)) + sampleThickness(world + vec2(h, h)));
}

float outdoor(vec2 world) {
    if (uAllOutdoor > 0.5) return 1.0;
    vec2 uv = (world - uMaskArea.xy) / uMaskArea.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uMask, vec2(uv.x, 1.0 - uv.y)).r;
}

// The thickness of the puffs broken into billows: a cumulus is a heap of round swellings, not a smooth blob. The
// billows are fixed to the cloud (moved with the sky), and its thin edge is eaten the most.
// Value noise in 3D from one fetch of the noise texture: two slices of it, 37 texels apart along x (canvas textures
// are stored bottom up: a shift along x only is the same either way), mixed along z.
float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    vec2 uv = i.xy + vec2(37.0, 0.0) * i.z + f.xy;
    vec2 rg = texture2D(uNoise, (uv + 0.5) / ${NOISE_SIZE}.0).rg;
    return mix(rg.x, rg.y, f.z);
}

float fbm3(vec3 p, int octaves) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        if (i >= octaves) break;
        sum += amplitude * noise3(p);
        p = p * 2.03 + vec3(1.7, 9.2, 3.3);
        amplitude *= 0.5;
    }
    return sum;
}

const float CLOUD_TOP = 140.0;  // map pixels between the base and the highest tops of a cumulus
const float EXTINCTION = 0.09;  // per map pixel at full density

// The density of a cumulus at a point of its volume (hf: height over CLOUD_TOP): the heap of puffs, rounder and
// thinner towards the top, eaten by a 3D noise fixed to the sky, so every cloud has its own billows, its frayed edges.
float cloudDensity(vec2 world, float hf, int octaves) {
    float c = sampleThickness(world);
    if (c <= 0.01) return 0.0;
    vec2 q = world - uSky - uMotion;
    float n = fbm3(vec3(q / 55.0, hf * 2.4 + uEvolve), octaves);
    float d = c * 1.35 - 0.2 - hf * hf * 0.95 - (1.0 - n * 1.9) * 0.55;
    return clamp(d * 3.0, 0.0, 1.0);
}

float density(vec2 world) {
    float t = thickness(world);
    if (t <= 0.002) return 0.0;
    vec2 p = world - uSky - uMotion;
    float billows = fbmDrift(p / 30.0, uBillowA, uBillowB);
    return t * (0.45 + 1.1 * billows);
}

// The outline of a cloud: a soft edge a few map pixels wide.
float cover(float d) {
    return smoothstep(0.1, 0.22, d);
}

// A cumulus seen from above, marched as a volume: from its top down, the light that reaches each point (the cloud
// between it and the sun dims it, Beer's law, with a softer share for the light scattered many times) and the
// opacity gathered on the way. Lit tops are white, the inside and the far side blue grey, thin edges let the ground
// show through.
vec4 cumulus(vec2 world, float out_, vec4 under) {
    if (sampleThickness(world) <= 0.01) return under;
    vec2 away = length(uShadow.xy) > 0.0 ? normalize(uShadow.xy) : vec2(0.7071);
    vec3 sun = normalize(vec3(-away * 0.7, 0.72));
    vec3 ambient = uShade * vec3(0.72, 0.8, 0.95);
    float step_ = CLOUD_TOP / 6.0;
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 0; i < 6; i++) {
        float hf = 1.0 - (float(i) + 0.5) / 6.0;
        float d = cloudDensity(world, hf, 3);
        if (d <= 0.0) continue;
        // Towards the sun, the heap of the puffs only (no noise): two texture reads instead of two noises.
        float toSun = 0.0;
        for (int j = 1; j <= 2; j++) {
            float s = float(j) * 24.0;
            float hs = hf + sun.z * s / CLOUD_TOP;
            toSun += clamp((sampleThickness(world + sun.xy * s) * 1.35 - 0.45 - hs * hs * 0.95) * 3.0, 0.0, 1.0);
        }
        float depth = toSun * 24.0 * EXTINCTION * 0.6;
        float lit = max(exp(-depth), exp(-depth * 0.25) * 0.55);
        vec3 tone = mix(ambient * (0.75 + 0.25 * hf), uLit, lit);
        float a = 1.0 - exp(-d * EXTINCTION * step_);
        light += transmittance * a * tone;
        transmittance *= 1.0 - a;
        if (transmittance < 0.03) break;
    }
    float alpha = (1.0 - transmittance) * uBody * mix(uOverRoofs, 1.0, out_);
    vec3 colour = light / max(1.0 - transmittance, 0.001);
    return vec4(colour * alpha, alpha) + under * (1.0 - alpha);
}

// The billows of fog and of the cloud layer before the cumulus: their density lit from the sun, a rim at their edge.
vec4 billows(vec2 world, float out_, vec4 under) {
    float d = density(world);
    float body = cover(d);
    if (body <= 0.0) return under;
    vec2 away = length(uShadow.xy) > 0.0 ? normalize(uShadow.xy) : vec2(0.7071);
    vec2 probe = away * 12.0;
    float facing = (density(world + probe) - density(world - probe)) * (28.0 / 24.0);
    vec2 reach = away * ${SHADE_REACH.toFixed(1)};
    float far = thickness(world) - thickness(world - reach);
    float light = clamp(0.55 + facing - far * 1.2 + (d - 0.3) * 0.2, 0.0, 1.0);
    vec3 tone = light < 0.5 ? mix(uShade, uMid, light * 2.0) : mix(uMid, uLit, light * 2.0 - 1.0);
    float rim = 1.0 - smoothstep(0.22, 0.32, d);
    tone = mix(tone, uLit, rim * 0.4);
    float alpha = body * uBody * mix(uOverRoofs, 1.0, out_);
    return vec4(tone * alpha, alpha) + under * (1.0 - alpha);
}

// A point in the frame of the arc of a trail (from its first point, along dir, turning by k: > 0 to the left):
// how far along the arc, how far to its left. A straight line when k is about 0.
vec2 arcFrame(vec2 rel, vec2 dir, float k) {
    float u = dot(rel, dir);
    float w = dot(rel, vec2(-dir.y, dir.x));
    if (abs(k) < 1e-7) return vec2(u, w);
    float s = atan(u * k, 1.0 - w * k) / k;
    vec2 fromCentre = vec2(u, w - 1.0 / k);
    return vec2(s, (1.0 / abs(k) - length(fromCentre)) * sign(k));
}

// The way along the arc s from its first point.
vec2 arcTangent(vec2 dir, float k, float s) {
    float a = k * s;
    return dir * cos(a) + vec2(-dir.y, dir.x) * sin(a);
}

// The point of the arc s from its first point, from that point.
vec2 arcPoint(vec2 dir, float k, float s) {
    if (abs(k) < 1e-7) return dir * s;
    float a = k * s;
    return (dir * sin(a) + vec2(-dir.y, dir.x) * (1.0 - cos(a))) / k;
}

// A contrail, high over the clouds, as seen from below it: two thin engine trails a little way behind the plane (the
// air needs a moment to condense), that merge and spread. As it ages its ice thins out over a wider band: it meanders,
// leans and spreads downwind (the crystals fall into slower air), breaks into lumps along its length and feathery
// streaks, and dissolves from its thinnest parts first, in holes then fragments, until nothing is left. Fixed to the
// air (it drifts with the wind). Its opacity at this point.
float contrail(vec2 world, vec4 trail, vec4 info, float k) {
    if (info.z <= 0.0) return 0.0;
    float life = abs(info.w);
    vec2 rel = world - uMotion - trail.xy;
    vec2 frame = arcFrame(rel, trail.zw, k);
    float along = frame.x;
    if (along < -8.0 || along > info.x + 8.0) return 0.0;
    float age = max(info.x - along, 0.0) / info.y;
    if (age >= life) return 0.0;
    vec2 way = arcTangent(trail.zw, k, along);
    vec2 side = vec2(-way.y, way.x);
    float across = frame.y;
    float spread = 1.6 + 4.2 * sqrt(age) + age * 1.1;
    // Downwind lean: the falling crystals trail behind, the band widens on that side.
    float shift = dot(uTrailWind, side) * age * 0.02;
    float width = spread + abs(shift) * 0.45;
    // Far from the line: nothing, before any noise (most of the screen).
    if (abs(across - shift * 0.5) > width * 3.0 + age * 0.4 + 12.0) return 0.0;
    float meander = (noise3(vec3(along / 340.0, 0.5, 7.3 + life)) - 0.5) * age * 0.7;
    float lumps = smoothstep(14.0, 50.0, age);
    float wave = sin(along * 6.2832 / (80.0 + spread * 2.5)) * lumps * spread * 0.3;
    float x = across - shift * 0.5 - meander - wave;
    float twin = 8.0 * (1.0 - smoothstep(1.5, 6.0, age));
    float jets = exp(-pow((abs(x) - twin) / width, 2.0));
    // The same ice over a wider band: thinner as it spreads, less so for a persistent trail (moist air feeds it).
    float thin = pow(5.0 / (width + 3.4), mix(0.55, 0.3, smoothstep(40.0, 90.0, life)));
    // Streaks along the trail, fixed to the air, slowly changing.
    float n = fbm3(vec3(along / (60.0 + width * 0.8), x / (3.0 + width * 0.45), age * 0.05 + life), 2);
    float crow = mix(1.0, 0.3 + 0.7 * (0.5 + 0.5 * cos(along * 6.2832 / (95.0 + spread * 3.0) + 1.3)), lumps * 0.75);
    float d = jets * thin * crow * mix(1.0, 0.35 + 1.3 * n, smoothstep(1.0, 12.0, age));
    // The whole width of the band shows, thinner at its edges; holes open where the streaks are thinnest, grow and
    // join until only fragments are left, which fade.
    float erode = smoothstep(life * 0.2, life, age);
    float holes = smoothstep(erode * 1.05 - 0.2, erode * 1.05 + 0.05, n + (1.0 - jets) * 0.25 * erode);
    float a = min(d * 1.5, 1.0) * holes * (1.0 - erode * 0.6);
    a *= smoothstep(0.02, 0.18, age) * 0.92;
    return clamp(a, 0.0, 1.0) * info.z;
}

// A tapered segment: its distance field, ra thick at a, rb at b.
float segment(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - mix(ra, rb, h);
}

// The airliner at the head of a trail, seen from below: fuselage, swept wings, two engines (where the two trails come
// from) and the tailplane. Its nose points into the air that carries it, so along its trail; the wind only makes it
// drift sideways over the ground.
// x: how much of it covers this point, y: how far inside its outline (for its shading).
vec2 airliner(vec2 world, vec4 trail, vec4 info, float k) {
    if (info.z <= 0.0 || info.w <= 0.0) return vec2(0.0);
    vec2 rel = world - uMotion - trail.xy - arcPoint(trail.zw, k, info.x);
    if (dot(rel, rel) > 625.0) return vec2(0.0);
    vec2 way = arcTangent(trail.zw, k, info.x);
    vec2 p = vec2(dot(rel, way), abs(dot(rel, vec2(-way.y, way.x)))) / 1.5;
    float d = segment(p, vec2(-12.0, 0.0), vec2(9.0, 0.0), 1.7, 1.7);
    d = min(d, segment(p, vec2(9.0, 0.0), vec2(13.0, 0.0), 1.7, 0.5));
    d = min(d, segment(p, vec2(2.5, 0.0), vec2(-4.5, 12.5), 2.6, 0.55));
    d = min(d, segment(p, vec2(-10.0, 0.0), vec2(-13.5, 4.8), 1.3, 0.4));
    d = min(d, segment(p, vec2(2.6, 5.5), vec2(0.0, 5.5), 1.0, 1.0));
    d *= 1.5;
    // As opaque by night as by day (its trail fades, not the plane).
    return vec2(smoothstep(0.7, -0.5, d) * clamp(info.z + uPlaneLights, 0.0, 1.0), smoothstep(0.0, -1.6, d));
}

// A light of a plane: a bright point and its glow, the same size on the screen whatever the zoom (a light seen from
// far is a point, not a speck too small to see).
float lamp(vec2 p, vec2 at) {
    vec2 d = (p - at) / max(uScreenPx, 0.5);
    float r2 = dot(d, d);
    return exp(-r2 / 1.6) + 0.12 * exp(-r2 / 14.0);
}

// The lights of the plane at the head of a trail, from dusk on: red on its left wing tip and green on its right, steady;
// white strobes on both tips, flashing twice a second and a half; the red beacon on its fuselage, once a second. Each
// plane blinks in its own time. Premultiplied colour.
vec4 planeLights(vec2 world, vec4 trail, vec4 info, float k) {
    if (uPlaneLights <= 0.0 || info.w <= 0.0) return vec4(0.0);
    vec2 rel = world - uMotion - trail.xy - arcPoint(trail.zw, k, info.x);
    float reach = 30.0 + 18.0 * max(uScreenPx, 0.5);
    if (dot(rel, rel) > reach * reach) return vec4(0.0);
    vec2 way = arcTangent(trail.zw, k, info.x);
    // Map pixels along the plane, and to its right (y down: the turn of the heading clockwise).
    vec2 p = vec2(dot(rel, way), dot(rel, vec2(-way.y, way.x)));
    vec2 tip = vec2(-4.5, 12.5) * 1.5;
    float phase = fract(info.y * 0.137);
    float strobeT = fract(uTime / 1.5 + phase);
    float strobe = step(strobeT, 0.04) + step(0.12, strobeT) * step(strobeT, 0.16);
    float beacon = step(fract(uTime + phase * 3.7), 0.12);
    float left = lamp(p, vec2(tip.x, -tip.y));
    float right = lamp(p, tip);
    vec3 colour = vec3(1.0, 0.12, 0.08) * left + vec3(0.1, 1.0, 0.3) * right;
    colour += vec3(1.0) * strobe * (left + right) * 1.4;
    colour += vec3(1.0, 0.1, 0.05) * beacon * lamp(p, vec2(1.0, 0.0)) * 1.3;
    float a = clamp(max(colour.r, max(colour.g, colour.b)), 0.0, 1.0) * uPlaneLights;
    return vec4(min(colour, vec3(1.0)) * uPlaneLights, a);
}

float trailsAt(vec2 world) {
    return max(max(contrail(world, uTrail0, uTrailInfo0, uTrailCurve.x),
        contrail(world, uTrail1, uTrailInfo1, uTrailCurve.y)), contrail(world, uTrail2, uTrailInfo2, uTrailCurve.z));
}

vec2 planesAt(vec2 world) {
    vec2 a = airliner(world, uTrail0, uTrailInfo0, uTrailCurve.x);
    vec2 b = airliner(world, uTrail1, uTrailInfo1, uTrailCurve.y);
    vec2 c = airliner(world, uTrail2, uTrailInfo2, uTrailCurve.z);
    return a.x >= b.x && a.x >= c.x ? a : (b.x >= c.x ? b : c);
}

vec4 contrails(vec2 world, float out_, vec4 under) {
    // Their shadow on the ground first, faint and outdoors only, under the clouds too (they are higher).
    if (uTrailShadow.z > 0.0) {
        vec2 at = world - uTrailShadow.xy;
        float s = max(trailsAt(at), planesAt(at).x) * uTrailShadow.z * out_;
        under = vec4(0.0, 0.0, 0.0, s) + under * (1.0 - s);
    }
    float a = trailsAt(world);
    if (a > 0.0) {
        // Dense young trails white, the thin veils of old ones a touch of the sky's blue grey.
        vec3 tone = mix(uLit * vec3(0.86, 0.9, 0.97), uLit, smoothstep(0.2, 0.8, a));
        // At night lit by the moon: blue grey.
        tone = mix(tone, vec3(0.5, 0.56, 0.7), uPlaneLights);
        under = vec4(tone * a, a) + under * (1.0 - a);
    }
    // The planes over their trails: a light grey edge, white body in the sun, blue grey under the moon.
    vec2 plane = planesAt(world);
    if (plane.x > 0.0) {
        vec3 body = mix(uLit * vec3(0.55, 0.58, 0.63), uLit * 0.97, plane.y);
        // At night lit by the moon: a pale blue grey, its edge darker, standing out from the dark ground.
        body = mix(body, mix(vec3(0.3, 0.34, 0.44), vec3(0.62, 0.68, 0.8), plane.y), uPlaneLights);
        under = vec4(body * plane.x, plane.x) + under * (1.0 - plane.x);
    }
    // Their lights, from dusk on.
    if (uPlaneLights > 0.0) {
        vec4 l = planeLights(world, uTrail0, uTrailInfo0, uTrailCurve.x);
        l = max(l, planeLights(world, uTrail1, uTrailInfo1, uTrailCurve.y));
        l = max(l, planeLights(world, uTrail2, uTrailInfo2, uTrailCurve.z));
        under = l + under * (1.0 - l.a);
    }
    return under;
}

void main() {
    vec2 world = uArea.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uArea.zw;
    float out_ = outdoor(world);
    // The veils of a covered sky, outdoors only.
    vec4 color = uVeil * out_;
    if (uRainbow.w > 0.0) {
        vec4 bow = rainbow(world, out_);
        color = bow + color * (1.0 - bow.a);
    }

    if (uClouds > 0.5) {
        // The shadows on the ground, outdoors only: the same clouds moved away from the sun.
        if (uShadow.z > 0.0) {
            vec2 shadowAt = world - uShadow.xy;
            float caster = uCumulus > 0.5 ? smoothstep(0.2, 0.75, thickness(shadowAt)) : cover(density(shadowAt));
            float shade = caster * uShadow.z * out_;
            color = vec4(0.0, 0.0, 0.0, shade) + color * (1.0 - shade);
        }
        if (uCumulus > 0.5) color = cumulus(world, out_, color);
        else color = billows(world, out_, color);
    }
    if (uTrailInfo0.z + uTrailInfo1.z + uTrailInfo2.z > 0.0 || uPlaneLights > 0.0) color = contrails(world, out_, color);

    if (color.a <= 0.002) discard;
    gl_FragColor = color;
}
`;

/** Layers of the 3D noise a second: the billows of a cumulus change slowly as it drifts. */
const CLOUD_EVOLUTION_PER_SECOND = 0.004;

/**
 * How far the 3D noise of the cumulus has evolved, `seconds` read on the clock of the shaders (shaderSeconds): taken
 * round NOISE_SIZE layers, where the noise repeats exactly (a layer is 37 texels further along x, and 37 × 256 texels
 * make whole turns of the texture). Small numbers for the 32 bits of the GPU; it jumps once a day, with that clock.
 */
export function cloudEvolution(seconds: number): number {
    if (!Number.isFinite(seconds)) return 0;
    const layers = (seconds * CLOUD_EVOLUTION_PER_SECOND) % NOISE_SIZE;
    return layers < 0 ? layers + NOISE_SIZE : layers;
}

let layerCount = 0;

export class CloudLayer {
    private readonly shader: Phaser.GameObjects.Shader;
    private readonly id = ++layerCount;
    private thickness: Phaser.GameObjects.RenderTexture | undefined;
    private thicknessArea = { x: 0, y: 0, width: 1, height: 1 };
    private maskTexture: Phaser.Textures.CanvasTexture | undefined;
    private maskOf: readonly WeatherView[] | undefined;
    private maskCount = 0;
    private maskArea = { x: 0, y: 0, width: 1, height: 1 };
    private puffs: readonly Phaser.GameObjects.Image[] = [];
    private frame: CloudFrame | undefined;
    private sky: { x: number; y: number } | undefined;

    private constructor(
        private readonly scene: Phaser.Scene,
        depth: number,
    ) {
        ensurePuffTexture(scene);
        ensureNoiseTexture(scene);
        this.shader = scene.add
            .shader(
                {
                    name: "Clouds",
                    fragmentSource: CLOUD_FRAG,
                    setupUniforms: (setUniform: (name: string, value: unknown) => void) => this.setUniforms(setUniform),
                },
                0,
                0,
                1,
                1,
                ["__DEFAULT", "__DEFAULT", NOISE_TEXTURE],
            )
            .setOrigin(0)
            .setDepth(depth)
            .setVisible(false);
    }

    /** Undefined without WebGL: the sky is painted in the block canvas then. */
    public static create(scene: Phaser.Scene, depth: number): CloudLayer | undefined {
        return scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
            ? new CloudLayer(scene, depth)
            : undefined;
    }

    public draw(frame: CloudFrame): void {
        this.frame = frame;
        this.sky = frame.sky;
        if (frame.clouds) this.drawThickness(frame, frame.clouds);
        else this.thickness?.clear().fill(0x000000, 1).render();
        if (frame.outdoors) this.updateMask(frame.view, frame.outdoors);
        this.shader
            .setPosition(frame.view.x, frame.view.y)
            .setSize(frame.view.width, frame.view.height)
            .setVisible(true);
    }

    /** Move the cached thickness with the wind between its slower redraws. */
    public moveSky(sky: { x: number; y: number }): boolean {
        const previous = this.sky;
        this.sky = sky;
        return Boolean(
            this.frame?.clouds && !this.frame.still && previous && (sky.x !== previous.x || sky.y !== previous.y),
        );
    }

    public hide(): void {
        this.shader.setVisible(false);
        this.frame = undefined;
    }

    /** The thickness of the clouds drawn last, for the water that reflects them; undefined without clouds. */
    public reflected(): { key: string; area: { x: number; y: number; width: number; height: number } } | undefined {
        return this.frame?.clouds && this.thickness
            ? { key: this.thickness.texture.key, area: this.thicknessArea }
            : undefined;
    }

    public destroy(): void {
        this.shader.destroy();
        this.thickness?.destroy();
        this.maskTexture?.destroy();
        for (const puff of this.puffs) puff.destroy();
    }

    private drawThickness(frame: CloudFrame, clouds: CloudSky): void {
        const { view } = frame;
        const cell = CELL;
        // Fixed to the map by whole texels: the puffs move inside it, the texture never slides under them.
        const x = Math.floor((view.x - CLOUD_LAYER_MARGIN) / cell) * cell;
        const y = Math.floor((view.y - CLOUD_LAYER_MARGIN) / cell) * cell;
        const columns = Math.ceil((view.x + view.width + CLOUD_LAYER_MARGIN - x) / cell);
        const rows = Math.ceil((view.y + view.height + CLOUD_LAYER_MARGIN - y) / cell);
        const thickness = this.thicknessTexture(columns, rows);
        this.thicknessArea = { x, y, width: thickness.width * cell, height: thickness.height * cell };
        // Opaque black: the ADD blend of Phaser (src + dst × dst alpha) then adds the puffs exactly.
        thickness.clear().fill(0x000000, 1);
        clouds.patches.forEach((patch, index) => {
            const weight = patch.weight ?? 1;
            if (weight <= 0) return;
            const diameter = (2 * patch.radius) / cell;
            const puff = this.puff(index)
                .setPosition((patch.x - x) / cell, (patch.y - y) / cell)
                .setDisplaySize(diameter, diameter * (patch.stretch ?? 1))
                .setRotation(patch.rotation ?? 0)
                .setAlpha(weight);
            thickness.draw(puff);
        });
        thickness.render();
    }

    /** One image a puff drawn this time: the drawing commands of a texture run at render(), an image cannot be reused. */
    private puff(index: number): Phaser.GameObjects.Image {
        const existing = this.puffs.at(index);
        if (existing) return existing;
        const puff = new Phaser.GameObjects.Image(this.scene, 0, 0, PUFF_TEXTURE)
            .setOrigin(0.5)
            .setBlendMode(Phaser.BlendModes.ADD);
        this.puffs = [...this.puffs, puff];
        return puff;
    }

    private thicknessTexture(columns: number, rows: number): Phaser.GameObjects.RenderTexture {
        const current = this.thickness;
        if (current && current.width >= columns && current.height >= rows) return current;
        const width = Math.ceil(Math.max(columns, current?.width ?? 0) / TEXEL_STEP) * TEXEL_STEP;
        const height = Math.ceil(Math.max(rows, current?.height ?? 0) / TEXEL_STEP) * TEXEL_STEP;
        current?.destroy();
        const thickness = this.scene.make.renderTexture({ x: 0, y: 0, width, height }, false).setOrigin(0, 0);
        thickness.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.thickness = thickness;
        this.bindTextures();
        return thickness;
    }

    /**
     * The outdoor rectangles drawn into the mask, a texel every MASK_TEXEL map pixels: again only when they change
     * (the weather keeps the same list while the walls and the view do not change) or the view leaves the mask.
     */
    private updateMask(view: WeatherView, outdoors: readonly WeatherView[]): void {
        const area = this.maskArea;
        const inside =
            view.x >= area.x &&
            view.y >= area.y &&
            view.x + view.width <= area.x + area.width &&
            view.y + view.height <= area.y + area.height;
        if (this.maskOf === outdoors && inside) return;
        this.maskOf = outdoors;
        const x = Math.floor((view.x - MASK_MARGIN) / MASK_MARGIN) * MASK_MARGIN;
        const y = Math.floor((view.y - MASK_MARGIN) / MASK_MARGIN) * MASK_MARGIN;
        const columns = Math.ceil((view.x + view.width + MASK_MARGIN - x) / MASK_TEXEL);
        const rows = Math.ceil((view.y + view.height + MASK_MARGIN - y) / MASK_TEXEL);
        // Kept while it is large enough, grown by steps: a canvas and a texture made again at each image of a zoom
        // filled the memory of the graphics card.
        let texture = this.maskTexture;
        if (!texture || texture.width < columns || texture.height < rows) {
            const width = Math.ceil(Math.max(columns, texture?.width ?? 0) / TEXEL_STEP) * TEXEL_STEP;
            const height = Math.ceil(Math.max(rows, texture?.height ?? 0) / TEXEL_STEP) * TEXEL_STEP;
            texture?.destroy();
            texture =
                this.scene.textures.createCanvas(`weather-sky-mask:${this.id}:${++this.maskCount}`, width, height) ??
                undefined;
            texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
            this.maskTexture = texture;
            this.bindTextures();
        }
        if (!texture) return;
        this.maskArea = { x, y, width: texture.width * MASK_TEXEL, height: texture.height * MASK_TEXEL };
        const context = texture.getContext();
        context.fillStyle = "#000";
        context.fillRect(0, 0, texture.width, texture.height);
        context.fillStyle = "#f00";
        for (const rect of outdoors) {
            context.fillRect(
                (rect.x - x) / MASK_TEXEL,
                (rect.y - y) / MASK_TEXEL,
                rect.width / MASK_TEXEL,
                rect.height / MASK_TEXEL,
            );
        }
        texture.refresh();
    }

    private bindTextures(): void {
        this.shader.setTextures([
            this.thickness?.texture.key ?? "__DEFAULT",
            this.maskTexture?.key ?? "__DEFAULT",
            NOISE_TEXTURE,
        ]);
    }

    private setUniforms(setUniform: (name: string, value: unknown) => void): void {
        const frame = this.frame;
        const clouds = frame?.clouds;
        const area = (rect: { x: number; y: number; width: number; height: number }): number[] => [
            rect.x,
            rect.y,
            rect.width,
            rect.height,
        ];
        setUniform("uThickness", 0);
        setUniform("uMask", 1);
        setUniform("uNoise", 2);
        setUniform("uArea", frame ? area(frame.view) : [0, 0, 1, 1]);
        setUniform("uThicknessArea", area(this.thicknessArea));
        setUniform("uMaskArea", area(this.maskArea));
        setUniform("uAllOutdoor", frame?.outdoors ? 0 : 1);
        setUniform("uClouds", clouds ? 1 : 0);
        setUniform("uCumulus", clouds?.cumulus ? 1 : 0);
        setUniform("uLit", rgb(clouds?.tones.lit ?? 0xffffff));
        setUniform("uMid", rgb(clouds?.tones.mid ?? 0xffffff));
        setUniform("uShade", rgb(clouds?.tones.shade ?? 0xffffff));
        setUniform("uBody", clouds?.body ?? 0);
        setUniform("uOverRoofs", frame?.overRoofs ?? 0);
        const shadow = clouds?.shadow;
        setUniform("uShadow", shadow ? [shadow.x, shadow.y, shadow.alpha] : [0, 0, 0]);
        setUniform("uVeil", premultipliedVeil(frame?.veils ?? []));
        setUniform(
            "uSky",
            frame
                ? [shaderWrap(frame.sky.x, CLOUD_BILLOW_PERIOD_PX), shaderWrap(frame.sky.y, CLOUD_BILLOW_PERIOD_PX)]
                : [0, 0],
        );
        setUniform(
            "uMotion",
            frame && this.sky && !frame.still ? [this.sky.x - frame.sky.x, this.sky.y - frame.sky.y] : [0, 0],
        );
        setUniform("uEvolve", frame?.still ? 0 : cloudEvolution(shaderSeconds(this.scene.time.now)));
        const billows = frame?.still ? { first: [0, 0, 0, 0], third: [0, 0] } : billowDrift(this.scene.time.now);
        setUniform("uBillowA", billows.first);
        setUniform("uBillowB", billows.third);
        for (let index = 0; index < MAX_CONTRAILS; index++) {
            const trail = frame?.contrails?.at(index);
            setUniform(
                `uTrail${index}`,
                trail ? [trail.x, trail.y, trail.direction.x, trail.direction.y] : [0, 0, 1, 0],
            );
            setUniform(
                `uTrailInfo${index}`,
                trail
                    ? [trail.length, trail.speed, trail.strength, trail.flying ? trail.life : -trail.life]
                    : [0, 1, 0, 1],
            );
        }
        setUniform(
            "uTrailCurve",
            Array.from({ length: MAX_CONTRAILS }, (_, index) => frame?.contrails?.at(index)?.curvature ?? 0),
        );
        setUniform("uPlaneLights", frame?.contrails?.at(0)?.lights ?? 0);
        setUniform("uTime", shaderSeconds(this.scene.time.now));
        setUniform("uScreenPx", 1 / screenScale(this.scene));
        const wind = frame?.contrails?.at(0)?.wind;
        setUniform("uTrailWind", wind ? [wind.x, wind.y] : [0, 0]);
        const trailShadow = frame?.contrailShadow;
        setUniform("uTrailShadow", trailShadow ? [trailShadow.x, trailShadow.y, trailShadow.alpha] : [0, 0, 0]);
        const bow = frame?.rainbow;
        setUniform("uRainbow", bow ? [bow.x, bow.y, bow.radius, bow.strength] : [0, 0, 1, 0]);
        setUniform("uRainbowDir", bow ? [bow.direction.x, bow.direction.y] : [0, -1]);
        setUniform("uRainbowSpan", bow?.span ?? 1);
    }
}

/** The veils one over the other, as one premultiplied colour. */
function premultipliedVeil(veils: readonly { color: number; alpha: number }[]): number[] {
    return veils.reduce(
        ([red, green, blue, alpha], veil) => {
            const [r, g, b] = rgb(veil.color);
            const keep = 1 - veil.alpha;
            return [
                r * veil.alpha + red * keep,
                g * veil.alpha + green * keep,
                b * veil.alpha + blue * keep,
                veil.alpha + alpha * keep,
            ];
        },
        [0, 0, 0, 0],
    );
}

function rgb(color: number): number[] {
    return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

/** A white disc whose opacity falls as (1 - d²/r²)², d the distance to its centre and r its radius. */
function ensurePuffTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PUFF_TEXTURE)) return;
    const texture = scene.textures.createCanvas(PUFF_TEXTURE, PUFF_SIZE, PUFF_SIZE);
    if (!texture) return;
    const context = texture.getContext();
    const pixels = context.createImageData(PUFF_SIZE, PUFF_SIZE);
    const half = PUFF_SIZE / 2;
    for (let y = 0; y < PUFF_SIZE; y++) {
        for (let x = 0; x < PUFF_SIZE; x++) {
            const share = Math.max(0, 1 - ((x + 0.5 - half) ** 2 + (y + 0.5 - half) ** 2) / half ** 2);
            const index = (y * PUFF_SIZE + x) * 4;
            pixels.data[index] = 255;
            pixels.data[index + 1] = 255;
            pixels.data[index + 2] = 255;
            pixels.data[index + 3] = Math.round(share * share * 255);
        }
    }
    context.putImageData(pixels, 0, 0);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    texture.refresh();
}

/** Random texels for the 3D noise of the clouds: red at random, green the red of the texel 37 further along x, repeated. */
function ensureNoiseTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(NOISE_TEXTURE)) return;
    const texture = scene.textures.createCanvas(NOISE_TEXTURE, NOISE_SIZE, NOISE_SIZE);
    if (!texture) return;
    const context = texture.getContext();
    const pixels = context.createImageData(NOISE_SIZE, NOISE_SIZE);
    const red = Array.from({ length: NOISE_SIZE * NOISE_SIZE }, () => Math.floor(Math.random() * 256));
    for (let y = 0; y < NOISE_SIZE; y++) {
        for (let x = 0; x < NOISE_SIZE; x++) {
            const index = (y * NOISE_SIZE + x) * 4;
            pixels.data[index] = red[y * NOISE_SIZE + x];
            pixels.data[index + 1] = red[y * NOISE_SIZE + ((x + 37) % NOISE_SIZE)];
            pixels.data[index + 2] = 0;
            pixels.data[index + 3] = 255;
        }
    }
    context.putImageData(pixels, 0, 0);
    // After refresh(): uploading the canvas again puts back the filter of a pixel-art game, and the noise was blocks.
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    texture.setWrap(Phaser.Textures.WrapMode.REPEAT);
}
