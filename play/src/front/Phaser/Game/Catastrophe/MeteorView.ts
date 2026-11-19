import type { CatastropheMessage } from "@workadventure/messages";
import { METEOR_FALL_MS } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { LAMP_MIN_FLASH_INTERVAL_MS } from "../Lamps/LampSignal";
import { flashAllowed, meteorFrame, waveCircles } from "./MeteorFall";

const SHADOW_RADIUS_PX = 48;
const METEOR_RADIUS_PX = 10;
const METEOR_COLOR = 0xffb347;
const TRAIL_SEGMENTS = 3;
const FLASH_ALPHA = 0.6;
const BURST_STROKES = 12;
const BURST_RADIUS_PX = 96;
const WET_BURST_COLOR = 0x8fd3ff;
const DRY_BURST_COLOR = 0x8a6a45;
const WAVE_COLOR = 0xdff3ff;
const WAVE_WIDTHS = [4, 3, 2];

interface Meteor {
    x: number;
    y: number;
    /** When the meteor was launched, in ms of the game. */
    launchedAt: number;
    /** Whether the meteor falls into water: read when it is announced, before the impact empties its crater. */
    wet: boolean;
    /** Whether its impact flashes the screen: decided once, when it lands (see `flashAllowed`). */
    flashes: boolean | undefined;
}

/**
 * The fall of the meteors the server announces: a shadow that grows on the ground, the meteor coming in, a flash and a
 * burst at impact, blue on water and brown dust elsewhere, then on water the circles of the wave running to the
 * shores. Drawn in code, all in one layer above everything. The
 * server alone decides what the water does.
 */
export class MeteorView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly meteors: Meteor[] = [];
    /** When the last full-screen flash began, in ms of the game: at most 3 flashes a second for the whole screen. */
    private lastFlashAt: number | undefined;

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
            wet: this.isWet(message.x, message.y),
            flashes: undefined,
        });
    }

    public update(now: number): void {
        if (this.meteors.length === 0) return;
        const graphics = this.graphics;
        graphics.clear();
        const reduced = this.reducedMotion();
        let flashed = false;
        for (let index = this.meteors.length - 1; index >= 0; index--) {
            const meteor = this.meteors[index];
            const sinceLaunch = now - meteor.launchedAt;
            const frame = meteorFrame(sinceLaunch, METEOR_FALL_MS, reduced);
            // The circles of the wave run on the water long after the burst: none on dry ground, none in reduced motion.
            const circles = meteor.wet && !reduced ? waveCircles(sinceLaunch - METEOR_FALL_MS) : [];
            if (frame.done && circles.length === 0) {
                this.meteors.splice(index, 1);
                continue;
            }
            this.drawWave(meteor, circles);
            if (frame.done) continue;
            this.drawShadow(meteor, frame.shadowScale);
            if (frame.burst === undefined) {
                this.drawMeteor(meteor, frame.offset);
            } else {
                if (meteor.flashes === undefined) {
                    meteor.flashes = flashAllowed(now, this.lastFlashAt, LAMP_MIN_FLASH_INTERVAL_MS);
                    if (meteor.flashes) this.lastFlashAt = now;
                }
                this.drawBurst(meteor, frame.burst, meteor.wet);
            }
            if (frame.flash > 0 && meteor.flashes && !flashed) {
                this.drawFlash(frame.flash);
                flashed = true;
            }
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

    private drawWave(meteor: Meteor, circles: { radius: number; alpha: number }[]): void {
        circles.forEach((circle, index) => {
            this.graphics.lineStyle(WAVE_WIDTHS[index] ?? 2, WAVE_COLOR, circle.alpha);
            this.graphics.strokeCircle(meteor.x, meteor.y, circle.radius);
        });
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
