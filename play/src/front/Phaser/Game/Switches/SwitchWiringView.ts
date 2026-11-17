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

/** What a presence sensor watches: an area of the map, or a cone (a disc when fully open) in front of it. */
export type SwitchWatchShape =
    | { kind: "rect"; x: number; y: number; width: number; height: number }
    | { kind: "cone"; x: number; y: number; reach: number; direction: number; angle: number };

const WATCH_COLOUR = 0x38bdf8;

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
    public draw(wiring: SwitchWiringShape | undefined, watch?: SwitchWatchShape): boolean {
        const key =
            (wiring
                ? `${wiring.from.x},${wiring.from.y}:${wiring.to.map((point) => `${point.x},${point.y}`).join(";")}`
                : "") + (watch ? `|${JSON.stringify(watch)}` : "");
        if (key === this.key) {
            return false;
        }
        this.key = key;
        this.graphics.clear();
        if (watch) {
            this.graphics.lineStyle(2, WATCH_COLOUR, 0.9);
            this.graphics.fillStyle(WATCH_COLOUR, 0.15);
            if (watch.kind === "rect") {
                this.graphics.fillRect(watch.x, watch.y, watch.width, watch.height);
                this.graphics.strokeRect(watch.x, watch.y, watch.width, watch.height);
            } else if (watch.angle >= 360) {
                this.graphics.fillCircle(watch.x, watch.y, watch.reach);
                this.graphics.strokeCircle(watch.x, watch.y, watch.reach);
            } else {
                // Degrees clockwise on the screen from the east, as Phaser draws its arcs.
                const from = Phaser.Math.DegToRad(watch.direction - watch.angle / 2);
                const to = Phaser.Math.DegToRad(watch.direction + watch.angle / 2);
                this.graphics.beginPath();
                this.graphics.moveTo(watch.x, watch.y);
                this.graphics.arc(watch.x, watch.y, watch.reach, from, to);
                this.graphics.closePath();
                this.graphics.fillPath();
                this.graphics.strokePath();
            }
        }
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
