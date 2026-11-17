import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";

const ON_COLOUR = 0x4ade80;
const OFF_COLOUR = 0x6b7280;
const RADIUS = 2;
/** From the top-right corner of the image of the switch. */
const INSET = 4;

/** The small light of a switch: green while one of the objects it commands is on, grey otherwise. */
export class SwitchIndicator {
    private readonly dot: Phaser.GameObjects.Arc;
    private lit: boolean | undefined;
    private key = "";

    constructor(scene: GameScene) {
        this.dot = scene.add.circle(0, 0, RADIUS, OFF_COLOUR).setStrokeStyle(1, 0x111827, 0.8);
    }

    /** Follows the switch and shows whether a target is on. True when something changed on the screen. */
    public update(entity: Entity, lit: boolean): boolean {
        const x = entity.x + entity.displayWidth - INSET;
        const y = entity.y + INSET;
        const key = `${x},${y},${entity.depth},${entity.visible}`;
        if (key === this.key && lit === this.lit) {
            return false;
        }
        this.key = key;
        this.lit = lit;
        this.dot
            .setPosition(x, y)
            .setDepth(entity.depth + 0.1)
            .setVisible(entity.visible)
            .setFillStyle(lit ? ON_COLOUR : OFF_COLOUR);
        return true;
    }

    public destroy(): void {
        this.dot.destroy();
    }
}
