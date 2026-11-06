import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";

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

/** A pixel accessory over the head, following its frame and pose without changing its texture. */
export class MusicHeadphonesEffect {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private direction: PositionMessage_Direction | undefined;
    private readonly headOffsets = new WeakMap<Phaser.Textures.Frame, { x: number; y: number }>();

    constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        this.graphics = scene.add.graphics();
        container.add(this.graphics);
        this.graphics.setVisible(false);
    }

    public update(active: boolean, direction: PositionMessage_Direction, body?: Phaser.GameObjects.Sprite): void {
        this.graphics.setVisible(active && body !== undefined);
        if (!active || !body) return;
        const offset = this.getHeadOffset(body);
        const angle = (body.angle * Math.PI) / 180;
        this.graphics
            .setPosition(
                body.x + offset.x * Math.cos(angle) - offset.y * Math.sin(angle),
                body.y + offset.x * Math.sin(angle) + offset.y * Math.cos(angle),
            )
            .setAngle(body.angle);
        if (direction === this.direction) return;
        this.direction = direction;
        const graphics = this.graphics;
        graphics.clear();
        const side = direction === PositionMessage_Direction.LEFT || direction === PositionMessage_Direction.RIGHT;
        graphics.fillStyle(0x39404f);
        if (side) {
            const cup = direction === PositionMessage_Direction.LEFT ? 2 : -7;
            graphics
                .fillRect(-5, -16, 10, 1)
                .fillRect(-6, -15, 2, 2)
                .fillRect(4, -15, 2, 2)
                .fillRect(cup, -13, 3, 8)
                .fillRect(cup - 1, -8, 6, 6);
            graphics.fillStyle(0x73969f).fillRect(cup, -7, 4, 4);
            graphics
                .fillStyle(0xeac47e)
                .fillRect(cup + 2, -7, 1, 3)
                .fillRect(cup + 1, -4, 2, 1);
        } else {
            graphics
                .fillRect(-8, -16, 16, 1)
                .fillRect(-10, -15, 2, 2)
                .fillRect(8, -15, 2, 2)
                .fillRect(-11, -13, 3, 9)
                .fillRect(8, -13, 3, 9)
                .fillRect(-12, -8, 4, 6)
                .fillRect(8, -8, 4, 6);
            graphics.fillStyle(0x73969f).fillRect(-11, -7, 2, 4).fillRect(9, -7, 2, 4);
            graphics.fillStyle(0xeac47e).fillRect(10, -7, 1, 3).fillRect(9, -4, 2, 1);
        }
    }

    private getHeadOffset(body: Phaser.GameObjects.Sprite): { x: number; y: number } {
        const frame = body.frame;
        if (!frame || !body.texture?.has("11")) return { x: 0, y: 0 };
        const cached = this.headOffsets.get(frame);
        if (cached) return cached;
        const still = body.texture.get(Math.floor(Number(frame.name) / 3) * 3 + 1);
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 20;
        const context = canvas.getContext("2d");
        if (!context) return { x: 0, y: 0 };
        const pixels = (source: Phaser.Textures.Frame): Uint8ClampedArray => {
            context.clearRect(0, 0, 32, 20);
            const image = source.source.image;
            if (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement))
                return new Uint8ClampedArray(32 * 20 * 4);
            context.drawImage(image, source.cutX, source.cutY, 32, 20, 0, 0, 32, 20);
            return context.getImageData(0, 0, 32, 20).data;
        };
        let offset = { x: 0, y: 0 };
        try {
            offset = headFrameOffset(pixels(frame), pixels(still));
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
        }
        this.headOffsets.set(frame, offset);
        return offset;
    }

    public destroy(): void {
        this.graphics.destroy();
    }
}
