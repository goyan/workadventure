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
 * Key of the snowy image of the tree image `sourceKey`, made once in the browser and kept: undefined while that image
 * is not loaded. The snowy trees of the map are this picture of their own summer image, their trunk unchanged.
 */
export function snowyTreeTexture(scene: Phaser.Scene, sourceKey: string): string | undefined {
    const key = `tree-snow:${sourceKey}`;
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
        for (let column = 0; column < width; column++) {
            const at = (row * width + column) * 4;
            const snowy = snowyTreePixel(
                [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]],
                height <= 1 ? 1 : row / (height - 1),
            );
            pixels.set(snowy, at);
        }
    }
    context.putImageData(image, 0, 0);
    canvas.refresh();
    return key;
}
