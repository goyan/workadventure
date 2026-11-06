import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { SEATED_DIRECTIONS } from "./SeatedPose";

/** Unknown external avatars have no body metadata: only the catalog's human bodies get this accessory. */
export function isHumanAvatar(textureKeys: Iterable<string>): boolean {
    return [...textureKeys].some((key) => /^(male|female|body)\d+$/.test(key));
}

/** Match the head of a walk frame to its still frame, including sideways movement. */
export function headFrameOffset(current: Uint8ClampedArray, still: Uint8ClampedArray): { x: number; y: number } {
    let best = { x: 0, y: 0 };
    let bestScore = -1;
    for (const y of [0, -1, 1, -2, 2]) {
        for (const x of [0, -1, 1, -2, 2]) {
            let score = 0;
            for (let row = 0; row < 20; row++) {
                for (let column = 0; column < 32; column++) {
                    if (column + x < 0 || column + x >= 32 || row + y < 0 || row + y >= 20) continue;
                    const a = (row * 32 + column) * 4;
                    const b = ((row + y) * 32 + column + x) * 4;
                    if (
                        still[a + 3] >= 128 &&
                        current[b + 3] >= 128 &&
                        still[a] === current[b] &&
                        still[a + 1] === current[b + 1] &&
                        still[a + 2] === current[b + 2]
                    )
                        score++;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                best = { x, y };
            }
        }
    }
    return best;
}

/** Paint into the same 32-pixel frame grid as the character, rather than positioning a separate vector shape. */
export function drawHeadphonesFrame(
    context: CanvasRenderingContext2D,
    direction: PositionMessage_Direction,
    offset: { x: number; y: number },
): void {
    context.save();
    // The human head occupies an odd number of pixels around column 16; use column 17 on the integer grid.
    context.translate(17 + offset.x, 16 + offset.y);
    const rect = (color: string, x: number, y: number, width: number, height: number): void => {
        context.fillStyle = color;
        context.fillRect(x, y, width, height);
    };
    const outline = "#39404f";
    const cushion = "#73969f";
    const note = "#eac47e";
    const side = direction === PositionMessage_Direction.LEFT || direction === PositionMessage_Direction.RIGHT;
    if (side) {
        const cup = direction === PositionMessage_Direction.LEFT ? 2 : -7;
        rect(outline, -5, -16, 10, 1);
        rect(outline, -6, -15, 2, 2);
        rect(outline, 4, -15, 2, 2);
        rect(outline, cup, -13, 3, 8);
        rect(outline, cup - 1, -8, 6, 6);
        rect(cushion, cup, -7, 4, 4);
        rect(note, cup + 2, -7, 1, 3);
        rect(note, cup + 1, -4, 2, 1);
    } else {
        rect(outline, -8, -16, 16, 1);
        rect(outline, -10, -15, 2, 2);
        rect(outline, 8, -15, 2, 2);
        rect(outline, -11, -13, 3, 9);
        rect(outline, 8, -13, 3, 9);
        rect(outline, -12, -8, 4, 6);
        rect(outline, 8, -8, 4, 6);
        rect(cushion, -11, -7, 2, 4);
        rect(cushion, 9, -7, 2, 4);
        rect(note, 10, -7, 1, 3);
        rect(note, 9, -4, 2, 1);
    }
    context.restore();
}

function headPixels(context: CanvasRenderingContext2D, frame: Phaser.Textures.Frame): Uint8ClampedArray {
    context.clearRect(0, 0, 32, 20);
    const image = frame.source.image;
    if (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement))
        return new Uint8ClampedArray(32 * 20 * 4);
    context.drawImage(image, frame.cutX, frame.cutY, 32, 20, 0, 0, 32, 20);
    return context.getImageData(0, 0, 32, 20).data;
}

function getHeadphonesTexture(scene: Phaser.Scene, body: Phaser.GameObjects.Sprite): string | undefined {
    const key = `music-headphones-${body.texture.key}`;
    if (scene.textures.exists(key)) return key;
    const walking = body.texture.has("11");
    const columns = walking ? 3 : 4;
    const count = walking ? 12 : 4;
    const canvas = document.createElement("canvas");
    canvas.width = columns * 32;
    canvas.height = walking ? 128 : 32;
    const context = canvas.getContext("2d");
    const sample = document.createElement("canvas");
    sample.width = 32;
    sample.height = 20;
    const sampleContext = sample.getContext("2d");
    if (!context || !sampleContext) return undefined;
    context.imageSmoothingEnabled = false;
    for (let index = 0; index < count; index++) {
        let offset = { x: 0, y: 0 };
        if (walking) {
            try {
                offset = headFrameOffset(
                    headPixels(sampleContext, body.texture.get(index)),
                    headPixels(sampleContext, body.texture.get(Math.floor(index / 3) * 3 + 1)),
                );
            } catch (error) {
                if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
            }
        }
        context.save();
        context.translate((index % columns) * 32, Math.floor(index / columns) * 32);
        drawHeadphonesFrame(context, SEATED_DIRECTIONS[walking ? Math.floor(index / 3) : index], offset);
        context.restore();
    }
    const texture = scene.textures.addCanvas(key, canvas);
    for (let index = 0; index < count; index++)
        texture?.add(index, 0, (index % columns) * 32, Math.floor(index / columns) * 32, 32, 32);
    return texture ? key : undefined;
}

/** Bind the accessory strictly to the body's current frame, origin and transform, including when it stops. */
export class MusicHeadphonesEffect {
    private sprite: Phaser.GameObjects.Sprite | undefined;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {}

    public update(active: boolean, body?: Phaser.GameObjects.Sprite): void {
        if (!active || !body) {
            this.sprite?.setVisible(false);
            return;
        }
        const key = getHeadphonesTexture(this.scene, body);
        if (!key) {
            this.sprite?.setVisible(false);
            return;
        }
        if (!this.sprite) {
            this.sprite = this.scene.add.sprite(0, 0, key, body.frame.name);
            this.container.add(this.sprite);
        }
        this.sprite
            .setTexture(key, body.frame.name)
            .setOrigin(body.originX, body.originY)
            .setPosition(body.x, body.y)
            .setAngle(body.angle)
            .setScale(body.scaleX, body.scaleY)
            .setFlip(body.flipX, body.flipY)
            .setAlpha(body.alpha)
            .setVisible(true);
    }

    public destroy(): void {
        this.sprite?.destroy();
    }
}
