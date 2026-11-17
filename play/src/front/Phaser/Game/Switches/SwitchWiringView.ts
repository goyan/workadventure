import { DEPTH_MAP_EDITOR_AREAS_INDEX } from "../DepthIndexes";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import type { SwitchableTarget } from "./SwitchTargets";

const WIRE_COLOUR = 0xfacc15;
const RING_RADIUS = 10;

/** A switch and the objects it commands, as points of the map. */
export interface SwitchWiringShape {
    from: { x: number; y: number };
    to: { x: number; y: number }[];
}

export function wiringOf(switchEntity: Entity, targets: readonly SwitchableTarget[]): SwitchWiringShape {
    return {
        from: {
            x: switchEntity.x + switchEntity.displayWidth / 2,
            y: switchEntity.y + switchEntity.displayHeight / 2,
        },
        to: targets.map((target) => target.point),
    };
}

/** In the map editor: a line from the selected switch to each object it commands, and a ring around each. */
export class SwitchWiringView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private key = "";

    constructor(scene: GameScene) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
    }

    /** Draws the wiring, or nothing. True when what is drawn changed. */
    public draw(wiring: SwitchWiringShape | undefined): boolean {
        const key = wiring
            ? `${wiring.from.x},${wiring.from.y}:${wiring.to.map((point) => `${point.x},${point.y}`).join(";")}`
            : "";
        if (key === this.key) {
            return false;
        }
        this.key = key;
        this.graphics.clear();
        if (wiring) {
            this.graphics.lineStyle(2, WIRE_COLOUR, 0.9);
            for (const point of wiring.to) {
                this.graphics.lineBetween(wiring.from.x, wiring.from.y, point.x, point.y);
                this.graphics.strokeCircle(point.x, point.y, RING_RADIUS);
            }
        }
        return true;
    }

    public destroy(): void {
        this.graphics.destroy();
    }
}
