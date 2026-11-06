import type * as Phaser from "phaser";

export enum Swimwear {
    Auto = "auto",
    Shorts = "shorts",
    TwoPiece = "twoPiece",
}

export const SWIMWEAR_VARIABLE = "_avatarSwimwear";

export function readSwimwear(value: unknown): Swimwear {
    return value === Swimwear.Shorts || value === Swimwear.TwoPiece ? value : Swimwear.Auto;
}

export function resolveSwimwear(style: Swimwear, textureKeys: string[]): Swimwear {
    if (style !== Swimwear.Auto) return style;
    // Custom bodies have no gender metadata: shorts by default, with an explicit choice in the wheel or Bath tab.
    return textureKeys.some((key) => /^female\d+$/.test(key)) ? Swimwear.TwoPiece : Swimwear.Shorts;
}

export function sampleAvatarSkinTone(context: CanvasRenderingContext2D): string {
    const pixels = context.getImageData(12, 10, 8, 6).data;
    const colors = new Map<string, number>();
    let best = "rgb(210,164,120)";
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        const [red, green, blue, alpha] = pixels.slice(i, i + 4);
        if (alpha < 128 || red + green + blue < 100) continue;
        const color = `rgb(${red},${green},${blue})`;
        const next = (colors.get(color) ?? 0) + 1;
        colors.set(color, next);
        if (next > count) {
            best = color;
            count = next;
        }
    }
    return best;
}

/** Preserve the head, then draw a covered bathing outfit in the same pixel grid as the avatar. */
export function drawSwimwearFrame(
    context: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    style: Swimwear,
    frameIndex = 1,
    skinTone?: string,
): void {
    const skin = source.getContext("2d");
    if (!skin) return;
    context.imageSmoothingEnabled = false;
    // Faces and ponytails reach row 19; the outfit must start below them, including in profile.
    context.drawImage(source, 0, 0, 32, 20, 0, 0, 32, 20);
    const side = Math.floor(frameIndex / 3) === 1 || Math.floor(frameIndex / 3) === 2;
    const back = Math.floor(frameIndex / 3) === 3;
    const step = (frameIndex % 3) - 1;
    const left = side ? 12 : 11;
    const width = side ? 8 : 10;
    skinTone ??= sampleAvatarSkinTone(skin);
    const outfit = style === Swimwear.TwoPiece ? "#e45d89" : "#3284c7";
    const outline = "#253342";
    context.fillStyle = outline;
    context.fillRect(left - 1, 20, width + 2, 7);
    context.fillRect(left, 27, width, 1);
    if (!side) {
        context.fillRect(8, 21, 3, 6);
        context.fillRect(21, 21, 3, 6);
    }
    context.fillStyle = skinTone;
    context.fillRect(left, 20, width, 8);
    if (!side) {
        context.fillRect(9, 21, 2, 5);
        context.fillRect(21, 21, 2, 5);
    }
    if (side) {
        context.fillRect(left + 2, 28, 4, 2 + step);
    } else {
        context.fillRect(left, 28, 3, 2 + step);
        context.fillRect(left + width - 3, 28, 3, 2 - step);
    }
    context.fillStyle = outline;
    if (side) {
        context.fillRect(left + 1, 30 + step, 5, 1);
    } else {
        context.fillRect(left, 30 + step, 3, 1);
        context.fillRect(left + width - 3, 30 - step, 3, 1);
    }
    context.fillStyle = outfit;
    context.fillRect(left, 25, width, style === Swimwear.TwoPiece ? 2 : 3);
    if (style === Swimwear.TwoPiece) {
        context.fillRect(left, 21, width, back ? 1 : 2);
        context.fillRect(left, 20, 1, 2);
        context.fillRect(left + width - 1, 20, 1, 2);
    }
    context.fillStyle = "#d8f2ff";
    context.fillRect(left, 25, width, 1);
    context.fillStyle = "rgba(0,0,0,0.15)";
    context.fillRect(left + width - 2, 20, 2, 8);
    if (side) {
        context.fillStyle = outline;
        const arm = Math.floor(frameIndex / 3) === 1 ? left + width - 2 : left;
        context.fillRect(arm, 22, 1, 4);
        context.fillStyle = skinTone;
        context.fillRect(arm, 26, 1, 1);
    }
}

/** Compose the layers once per outfit; all 12 frame indices match the original walking sheets. */
export function getSwimwearTexture(
    scene: Phaser.Scene,
    textureKeys: string[],
    preference: Swimwear,
): string | undefined {
    const style = resolveSwimwear(preference, textureKeys);
    const key = `swimwear-${style}-${textureKeys.join("-")}`;
    if (scene.textures.exists(key)) return key;
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const source = document.createElement("canvas");
    source.width = 32;
    source.height = 32;
    const sourceContext = source.getContext("2d");
    if (!context || !sourceContext || textureKeys.length === 0) return undefined;
    try {
        let skinTone: string | undefined;
        for (let index = 0; index < 12; index++) {
            sourceContext.clearRect(0, 0, 32, 32);
            for (const textureKey of textureKeys.filter((key) => !/^(clothes|accessory)\d+$/.test(key))) {
                const frame = scene.textures.get(textureKey).get(index);
                const image = frame.source.image;
                if (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement)) return undefined;
                sourceContext.drawImage(image, frame.cutX, frame.cutY, 32, 32, 0, 0, 32, 32);
            }
            context.save();
            context.translate((index % 3) * 32, Math.floor(index / 3) * 32);
            // Sample the face once from the front, never from the hair at the back of the head.
            skinTone ??= sampleAvatarSkinTone(sourceContext);
            drawSwimwearFrame(context, source, style, index, skinTone);
            for (const textureKey of textureKeys.filter((key) => /^(hair|hat)\d+$/.test(key))) {
                const frame = scene.textures.get(textureKey).get(index);
                const image = frame.source.image;
                if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement)
                    context.drawImage(image, frame.cutX, frame.cutY + 20, 32, 12, 0, 20, 32, 12);
            }
            context.restore();
        }
    } catch (error) {
        // External avatar images may prohibit reading pixels; keep the original swimming appearance then.
        if (error instanceof DOMException && error.name === "SecurityError") return undefined;
        throw error;
    }
    const texture = scene.textures.addCanvas(key, canvas);
    for (let index = 0; index < 12; index++)
        texture?.add(index, 0, (index % 3) * 32, Math.floor(index / 3) * 32, 32, 32);
    return texture ? key : undefined;
}
