import type * as Phaser from "phaser";
import type { PositionMessage_Direction } from "@workadventure/messages";
import type { TorchFlameShape } from "./TorchFlameShape";
import { torchFlamePose } from "./TorchProtocol";

/**
 * The layers of the flame, from its base (y = 0) upwards: each a rectangle `x`, `y`, `width`, `height` of the still
 * flame, in pixels. Red outside, orange, then a yellow heart.
 */
const FLAME_LAYERS: readonly { colour: number; rects: readonly [number, number, number, number][] }[] = [
    {
        colour: 0xd8401c,
        rects: [
            [-3, -4, 6, 4],
            [-2, -7, 4, 3],
            [-1, -9, 2, 2],
        ],
    },
    {
        colour: 0xff8a2a,
        rects: [
            [-2, -3, 4, 3],
            [-1, -6, 2, 3],
        ],
    },
    { colour: 0xffd36b, rects: [[-1, -2, 2, 2]] },
];
const FLAME_TIP_PX = 9;
const EMBER_COLOUR = 0xffd36b;

/**
 * An original pixel-art torch held upright in the hand: a wooden handle and its flame, drawn in code (no external
 * texture or avatar-specific asset). The flame is drawn from its base (the origin) upwards, in the shape it has now
 * (see torchFlameShape): it stretches and shrinks, its tip leans more than its base, and an ember rises now and then.
 */
export class TorchFlameEffect {
    private readonly stick: Phaser.GameObjects.Graphics;
    private readonly flame: Phaser.GameObjects.Graphics;
    private drawn: TorchFlameShape | undefined;

    constructor(
        scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {
        this.stick = scene.add.graphics();
        // About 3 × 10 px from the flame down to the hand: small next to a 32 px avatar.
        this.stick.fillStyle(0x3b2414).fillRect(-2, 0, 4, 2);
        this.stick.fillStyle(0x7a4a26).fillRect(-1, 2, 2, 8);
        this.stick.setVisible(false);
        this.flame = scene.add.graphics();
        this.flame.setVisible(false);
        container.add(this.stick);
        container.add(this.flame);
    }

    public update(
        active: boolean,
        direction: PositionMessage_Direction,
        seated: boolean,
        shape: TorchFlameShape,
    ): void {
        if (active) {
            this.container.bringToTop(this.stick);
            this.container.bringToTop(this.flame);
            this.draw(shape);
        }
        const pose = torchFlamePose(direction, seated);
        this.stick.setPosition(pose.x, pose.y).setVisible(active);
        this.flame.setPosition(pose.x, pose.y).setVisible(active);
    }

    /** Draws the flame again, only when its shape changed: a few rectangles. */
    private draw(shape: TorchFlameShape): void {
        const previous = this.drawn;
        if (
            previous &&
            previous.sway === shape.sway &&
            previous.height === shape.height &&
            previous.width === shape.width &&
            previous.ember?.x === shape.ember?.x &&
            previous.ember?.y === shape.ember?.y &&
            previous.ember?.alpha === shape.ember?.alpha
        ) {
            return;
        }
        this.drawn = shape;
        this.flame.clear();
        for (const { colour, rects } of FLAME_LAYERS) {
            this.flame.fillStyle(colour);
            for (const [x, y, width, height] of rects) {
                const top = y * shape.height;
                // The higher a part of the flame, the more it leans: the base stays on the handle.
                const lean = (shape.sway * -y) / FLAME_TIP_PX;
                this.flame.fillRect(x * shape.width + lean, top, width * shape.width, height * shape.height);
            }
        }
        if (shape.ember) {
            this.flame.fillStyle(EMBER_COLOUR, shape.ember.alpha).fillRect(shape.ember.x, shape.ember.y, 1, 1);
        }
    }

    public destroy(): void {
        this.stick.destroy();
        this.flame.destroy();
    }
}
