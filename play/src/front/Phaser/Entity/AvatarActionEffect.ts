import type * as Phaser from "phaser";
import type { PositionMessage_Direction } from "@workadventure/messages";
import { AvatarAction } from "./AvatarAction";
import { SEATED_DIRECTIONS } from "./SeatedPose";

/** Render actions on every avatar layer together. No tween can outlive the character or its action. */
export class AvatarActionEffect {
    private readonly graphics: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        this.graphics = scene.add.graphics();
        container.add(this.graphics);
    }

    public update(
        action: AvatarAction,
        time: number,
        sprites: Iterable<Phaser.GameObjects.Sprite>,
        seated: boolean,
        direction: PositionMessage_Direction,
    ): void {
        const beat = Math.sin((time / 600) * Math.PI * 2);
        // Running in place: the walking frames, about twice as fast as walking, the body up when over the foot.
        const stride = [0, 1, 2, 1][Math.floor(time / 90) % 4];
        const bounce = action === AvatarAction.Run && stride === 1 ? 1 : 0;
        for (const sprite of sprites) {
            sprite.setPosition(
                action === AvatarAction.Dance ? beat * 2 : 0,
                (seated ? -4 : 0) - (action === AvatarAction.Dance ? Math.abs(beat) * 3 : 0) - bounce,
            );
            sprite.setAngle(action === AvatarAction.Sleep ? 90 : action === AvatarAction.Dance ? beat * 12 : 0);
            if (action === AvatarAction.Dance && !seated) {
                sprite.anims.stop();
                const step = [0, 1, 2, 1][Math.floor(time / 150) % 4];
                sprite.setFrame(Math.max(0, SEATED_DIRECTIONS.indexOf(direction)) * 3 + step);
            }
            if (action === AvatarAction.Run) {
                sprite.anims.stop();
                sprite.setFrame(Math.max(0, SEATED_DIRECTIONS.indexOf(direction)) * 3 + stride);
            }
        }
        const graphics = this.graphics;
        graphics.clear();
        switch (action) {
            case AvatarAction.Coffee: {
                // Raise a small cup from the hand to the mouth, in the avatar's facing direction.
                const sip = Math.max(0, Math.sin(((time % 3000) / 3000) * Math.PI * 2));
                const left = direction === SEATED_DIRECTIONS[1];
                const x = Math.round((left ? -10 : 6) + (left ? 3 : -3) * sip);
                const y = Math.round((seated ? -4 : 0) + 6 - 8 * sip);
                graphics.fillStyle(0x3a2a20).fillRect(x - 1, y - 1, 7, 7);
                graphics.fillStyle(0xffffff).fillRect(x, y, 5, 5);
                const handleX = left ? x - 3 : x + 5;
                graphics.fillStyle(0x3a2a20).fillRect(handleX, y + 1, 3, 4);
                graphics.fillStyle(0xffffff).fillRect(handleX + 1, y + 2, 1, 2);
                graphics.fillStyle(0x6b3b20).fillRect(x, y, 5, 1);
                const steam = (time % 1000) / 1000;
                graphics
                    .lineStyle(1, 0xffffff, 0.6 * (1 - steam))
                    .lineBetween(x + 2, y - 2 - steam * 3, x + 3, y - 4 - steam * 3);
                break;
            }
            case AvatarAction.Sleep: {
                graphics.lineStyle(1, 0xd8eaff, 0.8);
                const y = -19 - ((time % 2000) / 2000) * 5;
                graphics
                    .lineBetween(5, y, 10, y)
                    .lineBetween(10, y, 5, y + 5)
                    .lineBetween(5, y + 5, 10, y + 5);
                break;
            }
            case AvatarAction.Toilet:
                // Opaque blocks cover the lower body and extend around it; no naked texture is rendered.
                for (let row = 0; row < 5; row++) {
                    for (let column = 0; column < 6; column++) {
                        const shade = (row + column + Math.floor(time / 300)) % 3;
                        graphics
                            .fillStyle([0x6d8399, 0xabb7c5, 0xd3dbe4][shade])
                            .fillRect(-12 + column * 4, -2 + row * 4, 4, 4);
                    }
                }
                break;
            default:
                break;
        }
    }

    public destroy(): void {
        this.graphics.destroy();
    }
}
