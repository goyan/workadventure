import type * as Phaser from "phaser";
import { CHAR_DEGREES } from "../Fire/TreeFireState";
import { treePixelPart } from "./SnowyTreeTexture";

type Rgba = [number, number, number, number];
type Rgb = readonly [number, number, number];

/**
 * What the foliage turns to at each degree, from its lit side to its shade, and how much of that it takes (the rest
 * stays its own colour): scorched, burnt, black, black.
 */
const CHAR: readonly { light: Rgb; dark: Rgb; share: number }[] = [
    { light: [158, 112, 52], dark: [62, 42, 22], share: 0.8 },
    { light: [98, 68, 38], dark: [36, 25, 15], share: 0.85 },
    { light: [60, 54, 50], dark: [18, 16, 15], share: 1 },
    { light: [52, 47, 44], dark: [14, 13, 12], share: 1 },
];
/** How dark the trunk gets at each degree, as a share of its own colour. */
const WOOD_SHARE: readonly number[] = [0.85, 0.65, 0.45, 0.4];
/** The share of the foliage that is gone at each degree: only a tree burnt through is thinned, to a ragged crown. */
const HOLES: readonly number[] = [0, 0, 0.12, 0.45];
/** The foliage goes by clumps of this many pixels, not pixel by pixel. */
const CLUMP_PX = 2;

const degreeIndex = (degree: number): number => Math.min(CHAR_DEGREES, Math.max(1, Math.round(degree))) - 1;

/**
 * The colour of a pixel of a tree charred to `degree` (1 to CHAR_DEGREES): the foliage turns brown then black with
 * its light and shade kept, the trunk darkens, the shadow on the ground stays. `rowShare` is how far down the tree
 * the pixel is (0 top, 1 foot).
 */
export function charredTreePixel(pixel: Rgba, rowShare: number, degree: number): Rgba {
    const [red, green, blue, alpha] = pixel;
    const part = treePixelPart(pixel, rowShare);
    if (part === "clear" || part === "shadow") return [red, green, blue, alpha];
    const index = degreeIndex(degree);
    if (part === "wood") {
        const share = WOOD_SHARE[index];
        return [Math.round(red * share), Math.round(green * share), Math.round(blue * share), alpha];
    }
    const lightness = (Math.max(red, green, blue) + Math.min(red, green, blue)) / 510;
    const { light, dark, share } = CHAR[index];
    const charred = (own: number, at: number): number =>
        Math.round(own * (1 - share) + (dark[at] + (light[at] - dark[at]) * lightness) * share);
    return [charred(red, 0), charred(green, 1), charred(blue, 2), alpha];
}

/**
 * Whether the foliage is gone at a pixel of a tree charred to `degree`: by small clumps, always the same ones, and
 * every clump gone at a degree is gone at the next.
 */
export function charHole(column: number, row: number, degree: number): boolean {
    const share = HOLES[degreeIndex(degree)];
    if (share <= 0) return false;
    const x = Math.floor(column / CLUMP_PX);
    const y = Math.floor(row / CLUMP_PX);
    const hash = Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0;
    return (hash >>> 8) / 0x1000000 < share;
}

/**
 * Key of the image of the tree image `sourceKey` charred to `degree`, made once in the browser and kept; the source
 * image itself at 0, undefined while that image is not loaded. No file of the catalogue: every tree has its own.
 */
export function charredTreeTexture(scene: Phaser.Scene, sourceKey: string, degree: number): string | undefined {
    if (degree <= 0) return scene.textures.exists(sourceKey) ? sourceKey : undefined;
    const key = `tree-char:${sourceKey}:${degreeIndex(degree) + 1}`;
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
    for (let row = 0; row < height; row++) {
        const rowShare = height <= 1 ? 1 : row / (height - 1);
        for (let column = 0; column < width; column++) {
            const at = (row * width + column) * 4;
            const pixel: Rgba = [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]];
            if (treePixelPart(pixel, rowShare) === "leaf" && charHole(column, row, degree)) {
                pixels[at + 3] = 0;
                continue;
            }
            pixels.set(charredTreePixel(pixel, rowShare, degree), at);
        }
    }
    context.putImageData(image, 0, 0);
    canvas.refresh();
    return key;
}
