import type * as Phaser from "phaser";

type Rgba = [number, number, number, number];

/** Snow from its lit side to its shade: a pixel of foliage takes the shade matching its own lightness. */
const SNOW_SHADES: readonly { from: number; color: [number, number, number] }[] = [
    { from: 0.55, color: [255, 255, 255] },
    { from: 0.4, color: [236, 243, 252] },
    { from: 0.28, color: [196, 213, 236] },
    { from: 0.18, color: [143, 166, 200] },
    { from: 0, color: [94, 114, 152] },
];
/** The darkest pixels draw the outline: it stays dark, in the blue of the shaded snow. */
const OUTLINE_LIGHTNESS = 0.14;
const OUTLINE: [number, number, number] = [36, 46, 72];
/** The trunk and its branches: brown, in the lower two thirds of the tree (an orange crown is not wood). */
const WOOD_FROM_ROW = 0.35;
const WOOD_MAX_LIGHTNESS = 0.75;
/** The shadow on the ground: grey pixels at the foot of the tree, and the half transparent ones. */
const SHADOW_FROM_ROW = 0.8;
const SHADOW_MAX_SATURATION = 0.25;
const OPAQUE_FROM = 200;
/** Snow settles in steps: a tree shows one of these many partial covers before its full one. */
export const SNOW_STEPS = 8;
/** Thickest layer of snow on a clump before the tree is all white, as a share of the image height. */
const SNOW_DEPTH = 0.35;
/** A pixel this dark is the line between two clumps: snow lands just below it, on the clump underneath. */
/** Layer on a clump inside the crown, as a share of the layer on the crown's outer surface. */
const INNER_SHARE = 0.45;
/** Colour spread under which a pixel in the lower half is the grey shade under the crown, not a leaf. */
const SHELTER_MAX_SPREAD = 30;
const SURFACE_LIGHTNESS = 0.2;
/** Trees do not all whiten together: each one starts up to this share of the ground's cover late. */
const TREE_DELAY = 0.35;

/**
 * The colour of a pixel of a tree once snow covers it: the trunk and the shadow on the ground keep their own, the
 * foliage turns to snow with its light and shade kept, its outline to a dark blue. `rowShare` is how far down the tree the pixel is (0 top, 1 foot).
 */
export function snowyTreePixel([red, green, blue, alpha]: Rgba, rowShare: number): Rgba {
    if (alpha < OPAQUE_FROM) return [red, green, blue, alpha];
    const max = Math.max(red, green, blue) / 255;
    const min = Math.min(red, green, blue) / 255;
    const lightness = (max + min) / 2;
    const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
    const wood = red > green && green >= blue && red - blue > 20;
    if (wood && rowShare >= WOOD_FROM_ROW && lightness <= WOOD_MAX_LIGHTNESS) return [red, green, blue, alpha];
    if (rowShare >= SHADOW_FROM_ROW && saturation < SHADOW_MAX_SATURATION) return [red, green, blue, alpha];
    if (lightness < OUTLINE_LIGHTNESS) return [...OUTLINE, alpha];
    const shade = SNOW_SHADES.find(({ from }) => lightness >= from) ?? SNOW_SHADES[SNOW_SHADES.length - 1];
    return [...shade.color, alpha];
}

/**
 * How far snow covers one tree, from 0 to SNOW_STEPS, when it covers `groundCover` (0 to 1) of the ground: each tree
 * (`seed`, 0 to 1, its own) starts a bit late, then catches up with the ground, all white once the ground is.
 */
export function treeSnowStep(groundCover: number, seed: number): number {
    if (groundCover >= 1) return SNOW_STEPS;
    const delay = TREE_DELAY * seed;
    const cover = Math.max(0, Math.min(1, (groundCover - delay) / (1 - TREE_DELAY)));
    return Math.floor(cover * SNOW_STEPS);
}

/** A stable number from 0 to 1 for a text: an entity id gives its tree its own pace. */
export function seedOf(text: string): number {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return (hash >>> 0) / 4294967296;
}

/**
 * Which pixels of a tree image hold snow at `step` of SNOW_STEPS (1 = snow): snow settles on what faces the sky, the
 * top of the crown first and, thinner, the top of each clump of leaves under it, then thickens across that surface,
 * its lower edge a little uneven. The trunk, under the leaves, stays bare until the tree is all white.
 */
export function accumulatedSnow(pixels: ArrayLike<number>, width: number, height: number, step: number): Uint8Array {
    const mask = new Uint8Array(width * height);
    if (step >= SNOW_STEPS) return mask.fill(1);
    if (step <= 0) return mask;
    const thickness = 1 + Math.pow(step / SNOW_STEPS, 1.4) * height * SNOW_DEPTH;
    const kind = (column: number, row: number): "sky" | "line" | "wood" | "leaf" => {
        if (column < 0 || row < 0 || column >= width || row >= height) return "sky";
        const at = (row * width + column) * 4;
        if (pixels[at + 3] < OPAQUE_FROM) return "sky";
        const [red, green, blue] = [pixels[at], pixels[at + 1], pixels[at + 2]];
        if ((Math.max(red, green, blue) + Math.min(red, green, blue)) / 510 < SURFACE_LIGHTNESS) return "line";
        // Under the leaves, the trunk and its grey shade are sheltered: only green-led foliage takes the early snow.
        const grey = Math.max(red, green, blue) - Math.min(red, green, blue) < SHELTER_MAX_SPREAD;
        return red > green || (grey && row > height / 2) ? "wood" : "leaf";
    };
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            if (kind(column, row) !== "leaf") continue;
            const above = kind(column, row - 1);
            if (above !== "sky" && above !== "line") continue;
            // The crown's outer surface gets the full layer, a clump inside it, shadowed by the leaves above, less.
            const radius = Math.max(1, (above === "sky" ? thickness : thickness * INNER_SHARE) + jitter(column, row));
            const reach = Math.ceil(radius);
            for (let down = 0; down <= reach; down++) {
                for (let side = -reach; side <= reach; side++) {
                    if (side * side + down * down > radius * radius) continue;
                    if (kind(column + side, row + down) !== "leaf") continue;
                    mask[(row + down) * width + column + side] = 1;
                }
            }
        }
    }
    return mask;
}

/** A stable -1 to +1 pixel for a point of the surface: the lower edge of the snow is not drawn with a compass. */
function jitter(column: number, row: number): number {
    const hash = Math.imul(((column >> 1) * 73856093) ^ ((row >> 2) * 19349663), 2654435761) >>> 0;
    return ((hash >>> 8) % 3) - 1;
}

/**
 * Key of the snowy image of the tree image `sourceKey`, made once in the browser and kept: undefined while that image
 * is not loaded. The snowy trees of the map are this picture of their own summer image, their trunk unchanged;
 * `step` below SNOW_STEPS covers only the top of its clumps (accumulatedSnow), the source image itself at 0.
 */
export function snowyTreeTexture(scene: Phaser.Scene, sourceKey: string, step = SNOW_STEPS): string | undefined {
    if (step <= 0) return scene.textures.exists(sourceKey) ? sourceKey : undefined;
    const key = step >= SNOW_STEPS ? `tree-snow:${sourceKey}` : `tree-snow:${sourceKey}:${step}`;
    if (scene.textures.exists(key)) return key;
    if (!scene.textures.exists(sourceKey)) return undefined;
    const frame = scene.textures.getFrame(sourceKey);
    const source = frame?.source.image;
    if (!frame || !source) return undefined;
    const { cutX, cutY, cutWidth: width, cutHeight: height } = frame;
    const canvas = scene.textures.createCanvas(key, width, height);
    const context = canvas?.getContext();
    if (!canvas || !context) return undefined;
    context.drawImage(source, cutX, cutY, width, height, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    const snow = accumulatedSnow(pixels, width, height, step);
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const at = (row * width + column) * 4;
            const rowShare = height <= 1 ? 1 : row / (height - 1);
            if (!snow[row * width + column]) continue;
            const snowy = snowyTreePixel([pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]], rowShare);
            pixels.set(snowy, at);
        }
    }
    context.putImageData(image, 0, 0);
    canvas.refresh();
    return key;
}
