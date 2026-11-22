import type { FishingLineMessage, PositionMessage_Direction } from "@workadventure/messages";
import { DEPTH_OVERLAY_INDEX } from "../DepthIndexes";
import { FISHING_LINE } from "./FishingProtocol";
import { bobOffset, gaugeFill, lineCurve, rodHand, rodTip } from "./FishingShapes";

/** Above every avatar, under the roofs and the night. */
const FISHING_DEPTH = DEPTH_OVERLAY_INDEX - 1;
const ROD_COLOUR = 0x6b4a2b;
const LINE_COLOUR = 0xf2f2f2;
const FLOAT_RED = 0xd9362b;
const FLOAT_WHITE = 0xffffff;
const BITE_COLOUR = 0xffd23f;
/** A waiting line hangs this much; a pulled one is taut. */
const SLACK_PX = 6;
const GAUGE_WIDTH = 34;
const GAUGE_HEIGHT = 5;
/** Above the name of the player, which sits over their head. */
const GAUGE_ABOVE_PX = 54;

/** An avatar that holds a rod, as the view needs it. */
export interface RodHolder {
    userId: number;
    x: number;
    y: number;
    direction: PositionMessage_Direction;
    seated: boolean;
}

export interface FishingScene {
    add: Pick<Phaser.GameObjects.GameObjectFactory, "graphics">;
    markDirty(): void;
}

/**
 * Draws the fishing of the room in one Graphics: the rod of every avatar that holds one, the line from its tip to
 * its float, the float (which plunges when a fish bites), and the gauge of the local player's cast.
 */
export class FishingView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private drawn = "";

    constructor(
        private readonly scene: FishingScene,
        private readonly reducedMotion: boolean,
        /** How much lower the surface of the water is drawn at a point: the float lies on it. */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        this.graphics = scene.add.graphics();
        this.graphics.setDepth(FISHING_DEPTH);
    }

    public update(
        time: number,
        holders: readonly RodHolder[],
        lines: readonly FishingLineMessage[],
        charge: { x: number; y: number; tiles: number } | undefined,
    ): void {
        const moving = charge !== undefined || (lines.length > 0 && !this.reducedMotion);
        // Drawn again only when something changed, or moves.
        const signature =
            holders
                .map((holder) => `${holder.userId}:${holder.x}:${holder.y}:${holder.direction}:${holder.seated}`)
                .join("|") +
            "#" +
            lines.map((line) => `${line.userId}:${line.x}:${line.y}:${line.state}`).join("|");
        if (!moving && signature === this.drawn) return;
        this.drawn = signature;
        const graphics = this.graphics;
        graphics.clear();

        const tips = new Map<number, { x: number; y: number }>();
        for (const holder of holders) {
            // The player is drawn lower at the bottom of a hollow (3/4): its rod with it.
            const lower = this.dropAt(holder.x, holder.y);
            const hand = rodHand(holder.x, holder.y + lower, holder.direction, holder.seated);
            const tip = rodTip(holder.x, holder.y + lower, holder.direction, holder.seated);
            tips.set(holder.userId, tip);
            graphics.lineStyle(2, ROD_COLOUR, 1);
            graphics.lineBetween(hand.x, hand.y, tip.x, tip.y);
        }

        for (const line of lines) {
            const float = {
                x: line.x,
                y: line.y + this.dropAt(line.x, line.y) + bobOffset(line.state, time, this.reducedMotion),
            };
            const tip = tips.get(line.userId);
            if (tip) {
                const points = lineCurve(tip, float, line.state === FISHING_LINE.waiting ? SLACK_PX : 0);
                graphics.lineStyle(1, LINE_COLOUR, 0.8);
                graphics.beginPath();
                graphics.moveTo(points[0].x, points[0].y);
                for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
                graphics.strokePath();
            }
            graphics.fillStyle(FLOAT_RED, 1);
            graphics.fillCircle(float.x, float.y, 3);
            graphics.fillStyle(FLOAT_WHITE, 1);
            graphics.fillRect(float.x - 1, float.y - 5, 2, 3);
            if (line.state === FISHING_LINE.bite) {
                // An exclamation mark over the float, and a ring around it.
                graphics.fillStyle(BITE_COLOUR, 1);
                graphics.fillRect(float.x - 1, float.y - 20, 3, 8);
                graphics.fillRect(float.x - 1, float.y - 10, 3, 3);
                graphics.lineStyle(1, FLOAT_WHITE, 0.7);
                graphics.strokeCircle(float.x, float.y, 7);
            }
        }

        if (charge) {
            const left = Math.round(charge.x - GAUGE_WIDTH / 2);
            const top = Math.round(charge.y - GAUGE_ABOVE_PX);
            const fill = gaugeFill(charge.tiles);
            graphics.fillStyle(0x000000, 0.55);
            graphics.fillRect(left - 1, top - 1, GAUGE_WIDTH + 2, GAUGE_HEIGHT + 2);
            graphics.fillStyle(fill >= 1 ? BITE_COLOUR : 0x6fd36f, 1);
            graphics.fillRect(left, top, Math.round(GAUGE_WIDTH * fill), GAUGE_HEIGHT);
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.graphics.destroy();
    }
}
