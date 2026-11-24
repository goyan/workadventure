import { FALL_HASH_GLSL } from "./FallHash";
import { COPY_SALT } from "./ParticleDensity";
import { EXPOSURE_S } from "./PerspectiveFall";

/**
 * The shaders of PrecipitationLayer (GLSL ES 1.00). Each vertex shader works out, for its instance (a copy of a cell
 * of the sky), what Rain.rainDropAt, PerspectiveFall.perspectiveDropAt, Snowfall.snowflakeAt or
 * PerspectiveFall.perspectiveFlakeAt work out on the processor, step by step, and draws it as a quad: a streak or the
 * square of a pixel-art flake. What does not show goes out of the clip space.
 *
 * A group of instances is a plane of drops or a kind of flakes: its cells read by one instance each, copy after copy
 * (`uGrids`: the first column and row of the hash, brought under 4096, and how many columns and rows; `uOrigins`: where
 * its first cell is, in map pixels, worked out on the processor in 64 bits; `uStarts`: its first instance).
 */

const COMMON_VERT = `
precision highp float;
attribute float inVertex;   // the corner of the quad, 0 to 3
attribute float inIndex;    // the instance
uniform mat4 uProjection;
uniform mat3 uView;         // map pixels to the pixels of the drawing (the camera)
uniform sampler2D uMask;
uniform vec4 uMaskArea;     // the area of the outdoor mask, map pixels; a width of 0: everything is outdoors
uniform sampler2D uClouds;
uniform vec4 uCloudArea;    // the area of the levels of the clouds, map pixels; a width of 0: no local factor
uniform vec2 uCloudLevel;   // the level of the thickest cloud, the personal effect of the clouds on the rain
uniform float uSeconds;     // fallSeconds (0 when nothing moves)
uniform float uCopies;      // the most drops or flakes a cell holds (cellCopies)

${FALL_HASH_GLSL}

const float PI = 3.14159265359;
// Out of the clip space: the instance draws nothing.
const vec4 HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);

bool outdoor(vec2 point) {
    if (uMaskArea.z <= 0.0) return true;
    vec2 uv = (point - uMaskArea.xy) / uMaskArea.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return false;
    return texture2D(uMask, uv).r > 0.5;
}

bool hasLocal() {
    return uCloudArea.z > 0.0;
}

// rainUnderCloud of the cloud over this point (1 where no cloud is known).
float underCloud(vec2 point) {
    if (!hasLocal()) return 1.0;
    vec2 uv = (point - uCloudArea.xy) / uCloudArea.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
    float thickness = clamp(texture2D(uClouds, uv).r * 255.0 / uCloudLevel.x, 0.0, 1.0);
    return 1.0 + uCloudLevel.y * (0.9 * thickness - 0.5);
}

vec4 onScreen(vec2 point) {
    return uProjection * vec4((uView * vec3(point, 1.0)).xy, 1.0, 1.0);
}

// The copy of the instance "within" its group, and the column and row of its cell from the first (grid: columns in z).
vec3 cellOf(float within, vec4 grid) {
    float cells = grid.z * grid.w;
    float copy = floor((within + 0.5) / cells);
    float cellIndex = within - copy * cells;
    float row = floor((cellIndex + 0.5) / grid.z);
    return vec3(copy, cellIndex - row * grid.z, row);
}

float fract1(float value) {
    return value - floor(value);
}
`;

/** The group of the instance among `slots`, from their starts. */
function groupOf(slots: number): string {
    return `
    int group = 0;
    for (int k = 1; k < ${slots}; k++) {
        if (inIndex >= uStarts[k]) group = k;
    }
    vec4 grid = uGrids[group];
    vec3 at = cellOf(inIndex - uStarts[group], grid);
    float copy = at.x;
    float salt = copy * ${COPY_SALT.toFixed(1)};
    // The column and the row as the hash reads them, and the corner of the cell.
    float column = grid.x + at.y;
    float row = grid.y + at.z;
    vec2 corner = uOrigins[group] + at.yz * CELL;`;
}

/** The streak of a drop from its head to its tail, `width` map pixels wide: vAlong 0 at the head, 1 at the tail. */
const STREAK_QUAD = `
void streak(vec2 head, vec2 tail, float width, float alpha) {
    vec2 line = head - tail;
    if (dot(line, line) < 1e-8) {
        gl_Position = HIDDEN;
        return;
    }
    vec2 across = normalize(vec2(line.y, -line.x)) * width * 0.5;
    float along = inVertex < 1.5 ? 0.0 : 1.0;
    float side = fract1(inVertex * 0.5) < 0.25 ? -1.0 : 1.0;
    vAlong = along;
    vAlpha = alpha;
    gl_Position = onScreen(mix(head, tail, along) + across * side);
}
`;

/** The flat rain (Rain.rainDropAt). */
export const RAIN_VERT = `${COMMON_VERT}
uniform float uStarts[3];
uniform vec4 uGrids[3];
uniform vec2 uOrigins[3];  // pixels of the finer grid
uniform vec4 uPlaneA[3];   // cell, speed, fall, length (pixels of the finer grid)
uniform vec4 uPlaneB[3];   // alpha, from, full, width (map pixels)
uniform vec3 uPlaneC[3];   // across, down, plane
uniform vec2 uRain;        // intensity, fineness (rainFineness)
varying float vAlong;
varying float vAlpha;
${STREAK_QUAD}
void main() {
    #define CELL uPlaneA[group].x
    ${groupOf(3)}
    vec4 a = uPlaneA[group];
    vec4 b = uPlaneB[group];
    vec3 c = uPlaneC[group];
    float fine = uRain.y;
    float level = min(1.0, uRain.x * underCloud((corner + 0.5 * a.x) / fine));
    float shown = min(1.0, (level - b.y) / (b.z - b.y));
    if (!copyShown(copy, uCopies, shown, fallHash(column, row, 11.0 + c.z + salt))) {
        gl_Position = HIDDEN;
        return;
    }
    // Each drop a little faster or slower than its plane: no curtain falling as one.
    float falls = fallHash(column, row, 3.0 + c.z + salt)
        + uSeconds * a.y * (0.85 + 0.3 * fallHash(column, row, 7.0 + salt)) / a.z;
    float cycle = floor(falls);
    float fallen = (falls - cycle) * a.z;
    vec2 head = (corner + vec2(
        fallHash(column + cycle, row, 5.0 + c.z + salt),
        fallHash(column, row + cycle, 13.0 + c.z + salt)
    ) * a.x + c.xy * fallen) / fine;
    vec2 tail = head - c.xy * a.w / fine;
    // A drop shows where its whole streak is outdoors (head, middle and tail): no trail over the edge of a roof.
    if (!outdoor(head) || !outdoor(mix(head, tail, 0.5)) || !outdoor(tail)) {
        gl_Position = HIDDEN;
        return;
    }
    streak(head, tail, b.w / fine, b.x);
}
`;

/** The rain in perspective (PerspectiveFall.perspectiveDropAt). */
export const RAIN_PERSPECTIVE_VERT = `${COMMON_VERT}
uniform float uStarts[3];
uniform vec4 uGrids[3];
uniform vec2 uOrigins[3];  // map pixels, the shift of the air included
uniform vec4 uSizeA[3];    // cell, shown, speed of the size (map px a second), size (0 to 2)
uniform vec2 uSizeB[3];    // width on the ground (screen pixels), opacity
uniform vec4 uCamera;      // the point under the camera, its height, the height the drops fall from
uniform vec2 uWind;        // the air, map pixels a second
uniform vec4 uCull;        // the view, map pixels
uniform vec2 uLook;        // map pixels a screen pixel, the widest streak (screen pixels)
varying float vAlong;
varying float vAlpha;
${STREAK_QUAD}
vec3 project(vec2 point, float z) {
    float scale = uCamera.z / max(1e-6, uCamera.z - z);
    return vec3(uCamera.xy + (point - uCamera.xy) * scale, scale);
}

void main() {
    #define CELL uSizeA[group].x
    ${groupOf(3)}
    vec4 a = uSizeA[group];
    float size = a.w;
    float pick = fallHash(column, row, 301.0 + size + salt);
    if (!copyShown(copy, uCopies, a.y * (hasLocal() ? 1.5 : 1.0), pick)) {
        gl_Position = HIDDEN;
        return;
    }
    float top = uCamera.w;
    // Each drop a little faster or slower than its size: no curtain falling as one.
    float speed = a.z * (0.9 + 0.2 * fallHash(column, row, 311.0 + size + salt));
    float falls = fallHash(column, row, 321.0 + size + salt) + uSeconds * speed / top;
    float cycle = floor(falls);
    float z = top * (1.0 - (falls - cycle));
    vec2 point = corner + vec2(
        fallHash(column + cycle, row, 331.0 + size + salt),
        fallHash(column, row + cycle, 341.0 + size + salt)
    ) * a.x;
    // Where it lands: the air carries it on until then. It shows where it lands outdoors.
    vec2 land = point + uWind * z / speed;
    if ((hasLocal() && !copyShown(copy, uCopies, a.y * underCloud(land), pick)) || !outdoor(land)) {
        gl_Position = HIDDEN;
        return;
    }
    vec3 head = project(point, z);
    if (head.x < uCull.x || head.x > uCull.x + uCull.z || head.y < uCull.y || head.y > uCull.y + uCull.w) {
        gl_Position = HIDDEN;
        return;
    }
    // Its streak: where it was ${EXPOSURE_S} s before, higher and upwind.
    vec3 tail = project(point - uWind * ${EXPOSURE_S.toFixed(2)}, min(uCamera.z * 0.99, z + speed * ${EXPOSURE_S.toFixed(2)}));
    vec2 b = uSizeB[group];
    // Near the camera a drop is out of focus: wider and fainter as it grows (by steps, as the processor drew them).
    float width = max(1.0, floor(min(uLook.y, b.x * head.z) * 2.0 + 0.5) / 2.0);
    float alpha = floor(b.y * min(1.0, sqrt(2.5 / head.z)) * 10.0 + 0.5) / 10.0;
    streak(head.xy, tail.xy, width * uLook.x, alpha);
}
`;

/** Pixels a shape takes in the atlas of the flakes, side by side (the biggest is 5 wide). */
export const FLAKE_ATLAS_CELL = 6;

/** A flake drawn as the square of its pixel-art shape: vShape the texel of the atlas of the shapes (FLAKE_SHAPES). */
const FLAKE_QUAD = `
uniform float uFlakeAlpha;  // snowTones: how much of its opacity a flake keeps at night
varying vec2 vShape;
varying float vAlpha;

// The flake of this shape (1 to 5 pixels) whose top left is snapped to its pixel grid, "pixel" map pixels a pixel.
void flake(vec2 at, float size, float pixel, float alpha) {
    float shape = clamp(floor(size + 0.5), 1.0, 5.0);
    vec2 topLeft = floor(at / pixel - size * 0.5 + 0.5) * pixel;
    vec2 local = vec2(inVertex < 1.5 ? 0.0 : 1.0, fract1(inVertex * 0.5) < 0.25 ? 0.0 : 1.0) * shape;
    vShape = vec2((shape - 1.0) * ${FLAKE_ATLAS_CELL.toFixed(1)}, 0.0) + local;
    vAlpha = alpha * uFlakeAlpha;
    gl_Position = onScreen(topLeft + local * pixel);
}
`;

/** The flat snow (Snowfall.snowflakeAt). */
export const SNOW_VERT = `${COMMON_VERT}
uniform float uStarts[6];
uniform vec4 uGrids[6];
uniform vec2 uOrigins[6];  // pixels of the finer grid, the shift of the air and of the fall included
uniform vec4 uSnowA[6];    // cell, share of the cells showing one, speed across and down (finer pixels a second)
uniform vec4 uSnowB[6];    // salt (kind × 10 + plane), shape, opacity, sway (finer pixels)
uniform vec4 uCull;        // the view, pixels of the finer grid
uniform vec2 uSnow;        // fineness (rainFineness), 1 when nothing moves
${FLAKE_QUAD}
void main() {
    #define CELL uSnowA[group].x
    ${groupOf(6)}
    vec4 a = uSnowA[group];
    vec4 b = uSnowB[group];
    salt += b.x;
    float fine = uSnow.x;
    float pick = fallHash(column, row, 101.0 + salt);
    // Never shown, even under the thickest cloud (rainUnderCloud: at most 1.4).
    if (!copyShown(copy, uCopies, a.y * (hasLocal() ? 1.5 : 1.0), pick)) {
        gl_Position = HIDDEN;
        return;
    }
    // One hash for the length of its falls, the moment they start and how it sways.
    float own = fallHash(column, row, 131.0 + salt);
    float falls = 9.0 + 6.0 * own;
    float period = falls + 0.8;
    float clock = uSeconds + fallHash(column, row, 137.0 + salt) * period;
    float turn = floor(clock / period);
    float age = clock - turn * period;
    bool lying = age >= falls;
    vec2 speed = a.zw;
    vec2 anchor = corner + vec2(fallHash(column + turn, row, 191.0 + salt), fallHash(column, row + turn, 211.0 + salt)) * a.x;
    // Snowfall.fallingFlake: it lands where its parcel of air is when its fall is over, swaying less and less.
    vec2 land = anchor + speed * (falls - age);
    float fall = age / falls;
    float left = max(0.0, 1.0 - fall);
    vec2 place = land;
    if (left > 0.0) {
        float sways = (0.35 + 0.4 * fallHash(column, row, 139.0 + salt)) * falls;
        float sway = sin((min(1.0, fall) * sways + fallHash(column, row, 149.0 + salt)) * 2.0 * PI) * b.w * left;
        place = land - left * speed * falls + vec2(sway, 0.0);
    }
    if (place.x < uCull.x || place.x > uCull.x + uCull.z || place.y < uCull.y || place.y > uCull.y + uCull.w) {
        gl_Position = HIDDEN;
        return;
    }
    // Where it appeared: a flake shows or not for its whole fall.
    if ((hasLocal() && !copyShown(copy, uCopies, a.y * underCloud((anchor - speed * age) / fine), pick))
        || !outdoor(place / fine)) {
        gl_Position = HIDDEN;
        return;
    }
    float fadeIn = uSnow.y > 0.5 ? 1.0 : min(1.0, max(0.0, age / 0.43));
    float fadeOut = lying ? 1.0 - (age - falls) / 0.8 : 1.0;
    flake(place / fine, b.y, 1.0 / fine, b.z * fadeIn * fadeOut);
}
`;

/** The snow in perspective (PerspectiveFall.perspectiveFlakeAt). */
export const SNOW_PERSPECTIVE_VERT = `${COMMON_VERT}
uniform float uStarts[3];
uniform vec4 uGrids[3];
uniform vec2 uOrigins[3];  // map pixels, the shift of the air included
uniform vec4 uKindA[3];    // cell, shown, speed of the kind (map px a second), sway (map pixels)
uniform vec2 uKindB[3];    // kind (0 to 2), shape
uniform vec4 uCamera;      // the point under the camera, its height, the height the flakes fall from
uniform vec2 uWind;        // the air, map pixels a second
uniform vec4 uCull;        // the view, map pixels
uniform vec3 uLook;        // map pixels a pixel of a flake on the ground, the most it grows, 1 when nothing moves
${FLAKE_QUAD}
vec3 project(vec2 point, float z) {
    float scale = uCamera.z / max(1e-6, uCamera.z - z);
    return vec3(uCamera.xy + (point - uCamera.xy) * scale, scale);
}

void main() {
    #define CELL uKindA[group].x
    ${groupOf(3)}
    vec4 a = uKindA[group];
    vec2 b = uKindB[group];
    float kind = b.x;
    float pick = fallHash(column, row, 401.0 + kind + salt);
    if (!copyShown(copy, uCopies, a.y * (hasLocal() ? 1.5 : 1.0), pick)) {
        gl_Position = HIDDEN;
        return;
    }
    float top = uCamera.w;
    float own = fallHash(column, row, 411.0 + kind + salt);
    float speed = a.z * (0.85 + 0.3 * own);
    float fallS = top / speed;
    float falls = fallHash(column, row, 413.0 + kind + salt) + uSeconds / fallS;
    float cycle = floor(falls);
    float age = (falls - cycle) * fallS;
    float z = top - speed * age;
    // The swirl: round and round, as wide as the flake flutters, its own pace and way round.
    float turnS = 2.0 + 2.5 * fallHash(column, row, 415.0 + kind + salt);
    float way = fallHash(column, row, 417.0 + kind + salt) < 0.5 ? 1.0 : -1.0;
    float angle = 2.0 * PI * (way * (age / turnS) + fallHash(column, row, 419.0 + kind + salt));
    vec2 point = corner + vec2(
        fallHash(column + cycle, row, 421.0 + kind + salt),
        fallHash(column, row + cycle, 431.0 + kind + salt)
    ) * a.x;
    vec2 land = point + uWind * z / speed;
    if ((hasLocal() && !copyShown(copy, uCopies, a.y * underCloud(land), pick)) || !outdoor(land)) {
        gl_Position = HIDDEN;
        return;
    }
    vec3 seen = project(point + 2.0 * a.w * vec2(cos(angle), sin(angle)), z);
    if (seen.x < uCull.x || seen.x > uCull.x + uCull.z || seen.y < uCull.y || seen.y > uCull.y + uCull.w) {
        gl_Position = HIDDEN;
        return;
    }
    // The shape of the flake as on the ground, its pixels as many times bigger as the flake is near.
    float fadeIn = uLook.z > 0.5 ? 1.0 : min(1.0, max(0.0, age / 0.43));
    flake(seen.xy, b.y, uLook.x * min(uLook.y, seen.z), fadeIn * min(1.0, sqrt(3.0 / seen.z)));
}
`;

/** The colour of a streak: the whole of it faint, its half by the head twice (the two strokes of the processor). */
export const STREAK_FRAG = `
precision mediump float;
uniform vec3 uColor;
varying float vAlong;
varying float vAlpha;

void main() {
    float faint = 0.45 * vAlpha;
    float alpha = vAlong <= 0.5 ? 1.0 - (1.0 - faint) * (1.0 - vAlpha) : faint;
    gl_FragColor = vec4(uColor * alpha, alpha);
}
`;

/** A flake: its lit and its shaded pixels, read in the atlas of the shapes (red lit, green shaded, none elsewhere). */
export const FLAKE_FRAG = `
precision mediump float;
uniform sampler2D uShapes;
uniform vec2 uShapesSize;
uniform vec3 uLight;
uniform vec3 uShade;
varying vec2 vShape;
varying float vAlpha;

void main() {
    vec4 texel = texture2D(uShapes, (floor(vShape) + 0.5) / uShapesSize);
    if (texel.r + texel.g < 0.5) discard;
    vec3 color = texel.r > 0.5 ? uLight : uShade;
    gl_FragColor = vec4(color * vAlpha, vAlpha);
}
`;
