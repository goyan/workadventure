import type { CatastropheMessage } from "@workadventure/messages";
import { METEOR_FALL_MS } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { meteorFrame } from "./MeteorFall";

const SHADOW_RADIUS_PX = 48;
const METEOR_RADIUS_PX = 10;
const METEOR_COLOR = 0xffb347;
const TRAIL_SEGMENTS = 3;
const FLASH_ALPHA = 0.6;
const BURST_STROKES = 12;
const BURST_RADIUS_PX = 96;
const WET_BURST_COLOR = 0x8fd3ff;
const DRY_BURST_COLOR = 0x8a6a45;

interface Meteor {
    x: number;
    y: number;
    /** When the meteor was launched, in ms of the game. */
    launchedAt: number;
    /** Whether the ground was under water at impact: decided once, when it lands. */
    wet: boolean | undefined;
}

/**
 * The fall of the meteors the server announces: a shadow that grows on the ground, the meteor coming in, a flash and a
 * burst at impact, blue on water and brown dust elsewhere. Drawn in code, all in one layer above everything. The
 * server alone decides what the water does.
 */
export class MeteorView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly meteors: Meteor[] = [];

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly isWet: (x: number, y: number) => boolean,
        private readonly reducedMotion: () => boolean,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** `receivedAt` in ms of the game: the impact is `message.impactInMs` later. */
    public add(message: CatastropheMessage, receivedAt: number): void {
        this.meteors.push({
            x: message.x,
            y: message.y,
            launchedAt: receivedAt + message.impactInMs - METEOR_FALL_MS,
            wet: undefined,
        });
    }

    public update(now: number): void {
        if (this.meteors.length === 0) return;
        const graphics = this.graphics;
        graphics.clear();
        const reduced = this.reducedMotion();
        for (let index = this.meteors.length - 1; index >= 0; index--) {
            const meteor = this.meteors[index];
            const frame = meteorFrame(now - meteor.launchedAt, METEOR_FALL_MS, reduced);
            if (frame.done) {
                this.meteors.splice(index, 1);
                continue;
            }
            this.drawShadow(meteor, frame.shadowScale);
            if (frame.burst === undefined) {
                this.drawMeteor(meteor, frame.offset);
            } else {
                meteor.wet ??= this.isWet(meteor.x, meteor.y);
                this.drawBurst(meteor, frame.burst, meteor.wet);
            }
            if (frame.flash > 0) this.drawFlash(frame.flash);
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.meteors.length = 0;
        this.graphics.destroy();
    }

    private drawShadow(meteor: Meteor, scale: number): void {
        this.graphics.fillStyle(0x000000, 0.35);
        const radius = SHADOW_RADIUS_PX * scale;
        this.graphics.fillEllipse(meteor.x, meteor.y, radius * 2, radius);
    }

    private drawMeteor(meteor: Meteor, offset: { x: number; y: number }): void {
        const length = Math.hypot(offset.x, offset.y);
        // The trail goes back along the way the meteor came from.
        const back = length > 0 ? { x: offset.x / length, y: offset.y / length } : { x: 0, y: 0 };
        for (let segment = TRAIL_SEGMENTS; segment >= 1; segment--) {
            const distance = segment * METEOR_RADIUS_PX * 1.6;
            this.graphics.fillStyle(METEOR_COLOR, 0.5 * (1 - segment / (TRAIL_SEGMENTS + 1)));
            this.graphics.fillCircle(
                meteor.x + offset.x + back.x * distance,
                meteor.y + offset.y + back.y * distance,
                METEOR_RADIUS_PX * (1 - segment * 0.2),
            );
        }
        this.graphics.fillStyle(METEOR_COLOR, 1);
        this.graphics.fillCircle(meteor.x + offset.x, meteor.y + offset.y, METEOR_RADIUS_PX);
    }

    private drawBurst(meteor: Meteor, burst: number, wet: boolean): void {
        this.graphics.lineStyle(3, wet ? WET_BURST_COLOR : DRY_BURST_COLOR, 1 - burst);
        const outer = BURST_RADIUS_PX * burst;
        const inner = outer * 0.6;
        for (let stroke = 0; stroke < BURST_STROKES; stroke++) {
            const angle = (stroke / BURST_STROKES) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            this.graphics.lineBetween(
                meteor.x + cos * inner,
                meteor.y + sin * inner,
                meteor.x + cos * outer,
                meteor.y + sin * outer,
            );
        }
    }

    private drawFlash(flash: number): void {
        const view = this.scene.cameras.main.worldView;
        this.graphics.fillStyle(0xffffff, FLASH_ALPHA * flash);
        this.graphics.fillRect(view.x, view.y, view.width, view.height);
    }
}
