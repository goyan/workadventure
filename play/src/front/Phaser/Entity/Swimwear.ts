import type * as Phaser from "phaser";

export enum Swimwear {
    Auto = "auto",
    Shorts = "shorts",
    TwoPiece = "twoPiece",
}

export const SWIMWEAR_VARIABLE = "_avatarSwimwear";
export const SWIMWEAR_COLOR_VARIABLE = "_avatarSwimwearColor";

export function readSwimwearColor(value: unknown): string | undefined {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

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

export interface SwimwearAssets {
    body: HTMLImageElement;
    shorts: HTMLImageElement;
    briefs: HTMLImageElement;
}

let assetsPromise: Promise<SwimwearAssets> | undefined;

/** The existing body and underwear sheets contain all twelve walking frames in the avatar's native grid. */
export function loadSwimwearAssets(): Promise<SwimwearAssets> {
    if (assetsPromise) return assetsPromise;
    const image = (path: string, baseUrl: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const asset = new Image();
            asset.crossOrigin = "anonymous";
            const clean = (): void => {
                asset.onload = null;
                asset.onerror = null;
            };
            asset.onload = () => {
                clean();
                resolve(asset);
            };
            asset.onerror = () => {
                clean();
                reject(new Error(`Could not load swimwear asset: ${path}`));
            };
            asset.src = `${baseUrl}resources/customisation/${path}`;
        });
    assetsPromise = import("../../Enum/ComputedConst")
        .then(({ ABSOLUTE_PUSHER_URL }) =>
            Promise.all([
                image("character_color/character_color2.png", ABSOLUTE_PUSHER_URL),
                image("character_clothes/character_clothes1.png", ABSOLUTE_PUSHER_URL),
                image("character_clothes/character_clothes5.png", ABSOLUTE_PUSHER_URL),
            ]),
        )
        .then(([body, shorts, briefs]) => ({ body, shorts, briefs }))
        .catch((error: unknown) => {
            assetsPromise = undefined;
            throw error;
        });
    return assetsPromise;
}

/** Recolor native skin shades without changing the silhouette or the animation's pixel positions. */
export function tintBodyPixels(pixels: Uint8ClampedArray, skinTone: readonly number[]): Uint8ClampedArray {
    const tinted = new Uint8ClampedArray(pixels);
    const reference = [255, 225, 175];
    for (let i = 0; i < tinted.length; i += 4) {
        if (!tinted[i + 3]) continue;
        for (let channel = 0; channel < 3; channel++)
            tinted[i + channel] = Math.round((pixels[i + channel] * skinTone[channel]) / reference[channel]);
    }
    return tinted;
}

/** Keep the native body's arms, legs and walking poses; the swimsuit is a clothing layer over it. */
export function drawSwimwearFrame(
    context: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    assets: SwimwearAssets,
    style: Swimwear,
    frameIndex = 1,
    skinTone?: string,
    color?: string,
): void {
    const selectedColor = readSwimwearColor(color);
    const outfitColor = selectedColor
        ? [1, 3, 5].map((offset) => parseInt(selectedColor.slice(offset, offset + 2), 16))
        : style === Swimwear.TwoPiece
          ? [223, 102, 145]
          : [71, 146, 204];
    const skin = source.getContext("2d");
    if (!skin) return;
    const body = document.createElement("canvas");
    body.width = 32;
    body.height = 32;
    const bodyContext = body.getContext("2d");
    if (!bodyContext) return;
    const column = (frameIndex % 3) * 32;
    const row = Math.floor(frameIndex / 3) * 32;
    bodyContext.drawImage(assets.body, column, row, 32, 32, 0, 0, 32, 32);
    const tone = (skinTone ?? sampleAvatarSkinTone(skin)).match(/\d+/g)?.map(Number) ?? [210, 164, 120];
    const pixels = bodyContext.getImageData(0, 0, 32, 32);
    const tinted = tintBodyPixels(pixels.data, tone);
    if (style === Swimwear.TwoPiece) {
        const direction = Math.floor(frameIndex / 3);
        const step = frameIndex % 3 === 1 ? 0 : 1;
        // The profile top covers the whole torso; the native arm and dark outlines stay in front.
        const left = direction === 2 ? 16 : direction === 1 ? 11 : 12;
        const width = direction === 1 || direction === 2 ? 6 : 9;
        const height = direction === 3 ? 2 : 4;
        for (let y = 20 + step; y < 20 + step + height; y++) {
            for (let x = left; x < left + width; x++) {
                const offset = (y * 32 + x) * 4;
                if (!pixels.data[offset + 3] || pixels.data[offset] === 83) continue;
                const shade = pixels.data[offset] / 255;
                const color = y === 19 + step + height ? outfitColor.map((channel) => channel * 0.7) : outfitColor;
                for (let channel = 0; channel < 3; channel++)
                    tinted[offset + channel] = Math.round(color[channel] * shade);
            }
        }
    }
    pixels.data.set(tinted);
    bodyContext.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(body, 0, 20, 32, 12, 0, 20, 32, 12);

    const garment = document.createElement("canvas");
    garment.width = 32;
    garment.height = 32;
    const garmentContext = garment.getContext("2d");
    if (!garmentContext) return;
    const twoPiece = style === Swimwear.TwoPiece;
    garmentContext.drawImage(twoPiece ? assets.briefs : assets.shorts, column, row, 32, 32, 0, 0, 32, 32);
    const garmentPixels = garmentContext.getImageData(0, 0, 32, 32);
    const reference = twoPiece ? 126.8 : 203.7;
    for (let i = 0; i < garmentPixels.data.length; i += 4) {
        if (!garmentPixels.data[i + 3]) continue;
        const shade =
            (garmentPixels.data[i] * 0.2126 + garmentPixels.data[i + 1] * 0.7152 + garmentPixels.data[i + 2] * 0.0722) /
            reference;
        for (let channel = 0; channel < 3; channel++)
            garmentPixels.data[i + channel] = Math.round(outfitColor[channel] * shade);
    }
    garmentContext.putImageData(garmentPixels, 0, 0);
    context.drawImage(garment, 0, 0);
    // The original head is the same frame, including long hair; it is never rebuilt or recolored.
    context.drawImage(source, 0, 0, 32, 20, 0, 0, 32, 20);
}

/** Compose the layers once per outfit; all 12 frame indices match the original walking sheets. */
export function getSwimwearTexture(
    scene: Phaser.Scene,
    textureKeys: string[],
    preference: Swimwear,
    assets: SwimwearAssets,
    color?: string,
): string | undefined {
    const style = resolveSwimwear(preference, textureKeys);
    const key = `swimwear-${style}-${readSwimwearColor(color) ?? "default"}-${textureKeys.join("-")}`;
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
            drawSwimwearFrame(context, source, assets, style, index, skinTone, color);
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
