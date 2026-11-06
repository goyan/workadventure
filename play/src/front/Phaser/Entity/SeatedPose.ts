import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";

export const SEATED_DIRECTIONS = [
    PositionMessage_Direction.DOWN,
    PositionMessage_Direction.LEFT,
    PositionMessage_Direction.RIGHT,
    PositionMessage_Direction.UP,
];

/** Bend the thighs towards the facing direction; keep the lower legs vertical. */
export function drawSeatedFrame(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    sourceX: number,
    sourceY: number,
    x: number,
    direction: PositionMessage_Direction,
): void {
    context.imageSmoothingEnabled = false;
    if (direction === PositionMessage_Direction.LEFT || direction === PositionMessage_Direction.RIGHT) {
        const sign = direction === PositionMessage_Direction.LEFT ? -1 : 1;
        // Rotating the whole hip strip projected 14 pixels upwards through the chest. Keep the trunk intact.
        context.drawImage(image, sourceX, sourceY, 32, 26, x, 0, 32, 26);
        context.drawImage(image, sourceX + 9, sourceY + 26, 14, 2, x + 9 + sign * 2, 26, 14, 2);
        context.drawImage(image, sourceX + 9, sourceY + 28, 14, 4, x + 9 + sign * 4, 27, 14, 4);
    } else {
        context.drawImage(image, sourceX, sourceY, 32, 23, x, 0, 32, 23);
        if (direction === PositionMessage_Direction.DOWN) {
            context.drawImage(image, sourceX + 8, sourceY + 23, 16, 4, x + 7, 23, 18, 2);
            context.drawImage(image, sourceX + 8, sourceY + 27, 16, 5, x + 7, 25, 18, 4);
        } else {
            // From behind, knees and shoes disappear behind the seat; the hips remain visible.
            context.drawImage(image, sourceX + 8, sourceY + 23, 16, 4, x + 8, 23, 16, 2);
        }
    }
}

/** Shared by every avatar using this layer, rather than generating textures per character. */
export function getSeatedTexture(scene: Phaser.Scene, textureKey: string): string {
    const key = `${textureKey}-seated-pose`;
    if (scene.textures.exists(key)) return key;
    const source = scene.textures.get(textureKey);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) return textureKey;
    for (const [index, direction] of SEATED_DIRECTIONS.entries()) {
        const frame = source.get(index * 3 + 1);
        const image = frame.source.image;
        if (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement)) return textureKey;
        if (/^(hair|hat|eyes)\d+$/.test(textureKey))
            context.drawImage(image, frame.cutX, frame.cutY, 32, 32, index * 32, 0, 32, 32);
        else drawSeatedFrame(context, image, frame.cutX, frame.cutY, index * 32, direction);
    }
    const texture = scene.textures.addCanvas(key, canvas);
    for (let index = 0; index < 4; index++) texture?.add(index, 0, index * 32, 0, 32, 32);
    return texture ? key : textureKey;
}
