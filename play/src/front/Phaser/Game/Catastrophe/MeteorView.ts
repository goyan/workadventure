import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import {
    FIREBALL_EMBERS_PER_TILE,
    FIREBALL_MAX_EMBERS,
    METEOR_DEFAULT_TILES,
    METEOR_FALL_MS,
    meteorShape,
    TERRAIN_CELL,
} from "@workadventure/map-editor";
import type { MeteorShape } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { LAMP_MIN_FLASH_INTERVAL_MS } from "../Lamps/LampSignal";
import { isEffectShown } from "../../../Stores/EffectsStore";
import { drawLower } from "../Terrain/GroundDrop";
import {
    fireballSparks,
    flashAllowed,
    meteorFrame,
    steamPuffs,
    waterRingOf,
    waveCircles,
    wetStretches,
} from "./MeteorFall";
import type { WaterRing } from "./MeteorFall";

/** The meteor of the usual size is drawn this wide; the others in proportion to their crater. */
const METEOR_RADIUS_PX = 10;
/** The smallest a meteor is drawn, in pixels: the one of a crater of one tile is still seen falling. */
const METEOR_SMALLEST_PX = 4;
/** A comet is ice: pale blue. A fireball is fire: orange, with a yellow heart and a tail that turns red. */
const COMET_COLOR = 0xbfe6ff;
const FIREBALL_COLOR = 0xffb347;
const FIREBALL_HEART_COLOR = 0xfff1a8;
const FIREBALL_TAIL_COLOR = 0xe5533d;
const TRAIL_SEGMENTS = 3;
const FIREBALL_TRAIL_SEGMENTS = 7;
const FIRE_BURST_COLOR = 0xff8a2a;
const SPARK_COLOR = 0xffd36b;
const STEAM_COLOR = 0xffffff;
const FLASH_ALPHA = 0.6;
const BURST_STROKES = 12;
/** The burst of an impact goes this many times the radius of the crater. */
const BURST_REACH = 1.5;
const WET_BURST_COLOR = 0x8fd3ff;
const DRY_BURST_COLOR = 0x8a6a45;
const WAVE_COLOR = 0xdff3ff;
const WAVE_WIDTHS = [4, 3, 2];
/** A circle of the wave is read on the water every so many pixels along it, and at this many points at most. */
const WAVE_SAMPLE_PX = 12;
const WAVE_MAX_SAMPLES = 360;

interface Meteor {
    x: number;
    y: number;
    /** Its crater and its wave, in cells, and the radius of its crater in map pixels. */
    shape: MeteorShape;
    craterPx: number;
    /** How wide it is drawn next to the usual meteor. */
    scale: number;
    /** A fireball, which burns where it lands, and not a comet, which brings water and a wave. */
    burning: boolean;
    /** How many sparks a fireball throws at impact. */
    sparks: number;
    /** When the meteor was launched, in ms of the game. */
    launchedAt: number;
    /** Whether the meteor falls into water: read when it is announced, before the impact empties its crater. */
    wet: boolean;
    /** Whether its impact flashes the screen: decided once, when it lands (see `flashAllowed`). */
    flashes: boolean | undefined;
}

/**
 * The fall of the comets and the fireballs the server announces: a shadow that grows on the ground, the body coming
 * in, a flash and a burst at impact. A comet (ice blue) bursts blue on water and brown dust elsewhere, then on water
 * the circles of its wave run to the shores. A fireball (orange, a tail of flames) bursts in fire and sparks, with
 * steam rising where it fell into water, and no wave. Drawn in code, all in one layer above everything. The server
 * alone decides what the water and the meadow do.
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
        /**
         * Whether the water of the map makes its own waves (the water with inertia): the circles drawn for the
         * wave of a comet would then run next to the real one, so none is drawn.
         */
        private readonly realWaves: () => boolean = () => false,
        /** Whether the water shader draws the waves of the comets (waterRings): no circles are drawn over it then. */
        private readonly shaderWaves: () => boolean = () => false,
        /**
         * How much lower what lies at a point is drawn, the relief seen in 3/4: the ground or the water over it
         * (GameScene.surfaceDropAt).
         */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** The fronts of the waves of the comets fallen into water now, for the water shader. */
    public waterRings(now: number): WaterRing[] {
        if (this.reducedMotion() || this.realWaves() || !isEffectShown("meteor")) return [];
        const rings: WaterRing[] = [];
        for (const meteor of this.meteors) {
            if (!meteor.wet || meteor.burning) continue;
            const ring = waterRingOf(meteor, now - meteor.launchedAt - METEOR_FALL_MS);
            if (ring) rings.push(ring);
        }
        return rings;
    }

    /** `receivedAt` in ms of the game: the impact is `message.impactInMs` later. */
    public add(message: CatastropheMessage, receivedAt: number): void {
        const shape = meteorShape(message.radiusTiles);
        this.meteors.push({
            x: message.x,
            y: message.y,
            shape,
            craterPx: shape.discCells * TERRAIN_CELL,
            scale: shape.radiusTiles / METEOR_DEFAULT_TILES,
            burning: message.kind === CatastropheKind.CATASTROPHE_FIREBALL,
            sparks: Math.min(FIREBALL_MAX_EMBERS, shape.radiusTiles * FIREBALL_EMBERS_PER_TILE),
            launchedAt: receivedAt + message.impactInMs - METEOR_FALL_MS,
            wet: this.isWet(message.x, message.y),
            flashes: undefined,
        });
    }

    public update(now: number): void {
        // Turned off on this computer: the meteors fall unseen (their craters and waves are the server's).
        const visible = isEffectShown("meteor");
        if (this.graphics.visible !== visible) {
            this.graphics.setVisible(visible);
            this.scene.markDirty();
        }
        if (!visible) {
            // Hidden (its own switch, or Basique): the falls are let go, nothing drawn and the map not drawn again for
            // them. Their craters and waves are the server's.
            this.meteors.length = 0;
            return;
        }
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
            const sinceImpact = sinceLaunch - METEOR_FALL_MS;
            const circles =
                meteor.wet && !meteor.burning && !reduced && !this.realWaves()
                    ? waveCircles(sinceImpact, meteor.shape)
                    : [];
            // What a fireball leaves after its burst: sparks flying out, and steam where it fell into water.
            const sparks =
                meteor.burning && !reduced ? fireballSparks(sinceImpact, meteor.craterPx, meteor.sparks) : [];
            const steam = meteor.burning && meteor.wet && !reduced ? steamPuffs(sinceImpact, meteor.craterPx) : [];
            if (frame.done && circles.length === 0 && sparks.length === 0 && steam.length === 0) {
                this.meteors.splice(index, 1);
                continue;
            }
            // Where the ground or the water it falls on is drawn: lower at the bottom of a hollow, higher on a mount.
            drawLower([this.graphics], Math.round(this.dropAt(meteor.x, meteor.y)), () => {
                if (!this.shaderWaves()) this.drawWave(meteor, circles);
                this.drawSteam(meteor, steam);
                this.drawSparks(meteor, sparks);
                if (frame.done) return;
                this.drawShadow(meteor, frame.shadowScale);
                if (frame.burst === undefined) {
                    this.drawMeteor(meteor, frame.offset);
                } else {
                    if (meteor.flashes === undefined) {
                        meteor.flashes = flashAllowed(now, this.lastFlashAt, LAMP_MIN_FLASH_INTERVAL_MS);
                        if (meteor.flashes) this.lastFlashAt = now;
                    }
                    this.drawBurst(
                        meteor,
                        frame.burst,
                        meteor.burning ? FIRE_BURST_COLOR : meteor.wet ? WET_BURST_COLOR : DRY_BURST_COLOR,
                    );
                }
            });
            if (frame.done) continue;
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
        const radius = meteor.craterPx * scale;
        this.graphics.fillEllipse(meteor.x, meteor.y, radius * 2, radius);
    }

    private drawMeteor(meteor: Meteor, offset: { x: number; y: number }): void {
        const size = Math.max(METEOR_SMALLEST_PX, METEOR_RADIUS_PX * meteor.scale);
        const length = Math.hypot(offset.x, offset.y);
        // The trail goes back along the way the meteor came from.
        const back = length > 0 ? { x: offset.x / length, y: offset.y / length } : { x: 0, y: 0 };
        const segments = meteor.burning ? FIREBALL_TRAIL_SEGMENTS : TRAIL_SEGMENTS;
        const color = meteor.burning ? FIREBALL_COLOR : COMET_COLOR;
        for (let segment = segments; segment >= 1; segment--) {
            const distance = segment * size * 1.6;
            // The tail of a fireball turns red as it cools, away from its head.
            const tail = meteor.burning && segment > segments / 2 ? FIREBALL_TAIL_COLOR : color;
            this.graphics.fillStyle(tail, 0.5 * (1 - segment / (segments + 1)));
            this.graphics.fillCircle(
                meteor.x + offset.x + back.x * distance,
                meteor.y + offset.y + back.y * distance,
                size * (1 - (segment / (segments + 1)) * 0.8),
            );
        }
        this.graphics.fillStyle(color, 1);
        this.graphics.fillCircle(meteor.x + offset.x, meteor.y + offset.y, size);
        if (meteor.burning) {
            this.graphics.fillStyle(FIREBALL_HEART_COLOR, 1);
            this.graphics.fillCircle(meteor.x + offset.x, meteor.y + offset.y, size * 0.55);
        }
    }

    private drawSparks(meteor: Meteor, sparks: { x: number; y: number; alpha: number }[]): void {
        const size = Math.max(2, 2 * meteor.scale);
        for (const spark of sparks) {
            this.graphics.fillStyle(SPARK_COLOR, spark.alpha);
            this.graphics.fillRect(meteor.x + spark.x - size / 2, meteor.y + spark.y - size / 2, size, size);
        }
    }

    private drawSteam(meteor: Meteor, puffs: { radius: number; rise: number; alpha: number }[]): void {
        for (const puff of puffs) {
            this.graphics.fillStyle(STEAM_COLOR, puff.alpha);
            this.graphics.fillCircle(meteor.x, meteor.y - puff.rise, puff.radius);
        }
    }

    /** The circles of the wave, only where they lie on water: a wave does not run over the land. */
    private drawWave(meteor: Meteor, circles: { radius: number; alpha: number }[]): void {
        circles.forEach((circle, index) => {
            const samples = Math.max(
                8,
                Math.min(WAVE_MAX_SAMPLES, Math.ceil((2 * Math.PI * circle.radius) / WAVE_SAMPLE_PX)),
            );
            const turn = (2 * Math.PI) / samples;
            const wet: boolean[] = [];
            for (let sample = 0; sample < samples; sample++) {
                wet.push(
                    this.isWet(
                        meteor.x + Math.cos(sample * turn) * circle.radius,
                        meteor.y + Math.sin(sample * turn) * circle.radius,
                    ),
                );
            }
            this.graphics.lineStyle(WAVE_WIDTHS[index] ?? 2, WAVE_COLOR, circle.alpha);
            for (const stretch of wetStretches(wet)) {
                this.graphics.beginPath();
                this.graphics.arc(
                    meteor.x,
                    meteor.y,
                    circle.radius,
                    (stretch.from - 0.5) * turn,
                    (stretch.to - 0.5) * turn,
                );
                this.graphics.strokePath();
            }
        });
    }

    private drawBurst(meteor: Meteor, burst: number, color: number): void {
        this.graphics.lineStyle(3 * Math.max(1, meteor.scale), color, 1 - burst);
        const outer = meteor.craterPx * BURST_REACH * burst;
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
