import * as Phaser from "phaser";
import type { LampFrame } from "./LampSignal";
import { flashAlpha, neonColor, spotAngle } from "./LampStyle";
import { LAMP_BALL_TEXTURE, LAMP_BEAM_TEXTURE, LAMP_DISC_TEXTURE, LAMP_TUBE_TEXTURE } from "./LampTextures";

/** One lamp on the map: drawn from the music at every image. */
export interface LampVisual {
    update(frame: LampFrame, now: number): void;
    destroy(): void;
}

export type LampKind = "spot" | "disco" | "neon" | "strobe";

export interface LampPlacement {
    scene: Phaser.Scene;
    x: number;
    y: number;
    depth: number;
    /** Photosensitivity: no rotation, no flash, steady light only (prefers-reduced-motion). */
    reducedMotion: boolean;
}

/** The colours the spot and the discs go through, one step per beat. */
const PALETTE = [0xff3b6b, 0x3bd0ff, 0xffd23b, 0x6bff3b, 0xb36bff];

/** A level that rises at once and falls slowly: lights stay lit between two notes. */
function followLevel(current: number, target: number): number {
    return target > current ? target : current + (target - current) * 0.12;
}

function additive<T extends Phaser.GameObjects.Image>(image: T, depth: number): T {
    return image.setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
}

class SpotLamp implements LampVisual {
    private readonly beam: Phaser.GameObjects.Image;
    private level = 0;
    private colourIndex = 0;

    constructor(private readonly placement: LampPlacement) {
        this.beam = additive(placement.scene.add.image(placement.x, placement.y, LAMP_BEAM_TEXTURE), placement.depth)
            .setOrigin(0.5, 0)
            .setDisplaySize(200, 330);
    }

    public update(frame: LampFrame, now: number): void {
        if (frame.beat) {
            this.colourIndex = (this.colourIndex + 1) % PALETTE.length;
        }
        this.level = followLevel(this.level, Math.max(frame.mid, frame.bass));
        this.beam
            .setRotation(this.placement.reducedMotion ? 0 : spotAngle(now, 0.8 + frame.bass))
            .setTint(PALETTE[this.colourIndex])
            .setAlpha(0.45 + 0.55 * this.level);
    }

    public destroy(): void {
        this.beam.destroy();
    }
}

const DISCO_DOTS = 7;

class DiscoLamp implements LampVisual {
    private readonly ball: Phaser.GameObjects.Image;
    private readonly dots: Phaser.GameObjects.Image[] = [];
    private angle = 0;
    private lastNow: number | undefined;
    private level = 0;

    constructor(private readonly placement: LampPlacement) {
        this.ball = placement.scene.add
            .image(placement.x, placement.y, LAMP_BALL_TEXTURE)
            .setDepth(placement.depth)
            .setDisplaySize(26, 26);
        for (let index = 0; index < DISCO_DOTS; index++) {
            this.dots.push(
                additive(placement.scene.add.image(placement.x, placement.y, LAMP_DISC_TEXTURE), placement.depth)
                    .setDisplaySize(44, 44)
                    .setTint(PALETTE[index % PALETTE.length]),
            );
        }
    }

    public update(frame: LampFrame, now: number): void {
        const delta = this.lastNow === undefined ? 0 : now - this.lastNow;
        this.lastNow = now;
        this.level = followLevel(this.level, (frame.bass + frame.mid + frame.treble) / 3);
        // The spots on the floor turn faster as the music gets louder; they stand still when motion is reduced.
        if (!this.placement.reducedMotion) {
            this.angle += delta * (0.0004 + 0.0025 * this.level);
        }
        this.ball.setAlpha(0.75 + 0.25 * frame.treble);
        const radius = 70;
        this.dots.forEach((dot, index) => {
            const theta = this.angle + (index / DISCO_DOTS) * Math.PI * 2;
            // Seen from above at an angle: the circle is flattened.
            dot.setPosition(
                this.placement.x + Math.cos(theta) * radius,
                this.placement.y + 50 + Math.sin(theta) * radius * 0.5,
            ).setAlpha(0.35 + 0.55 * this.level);
        });
    }

    public destroy(): void {
        this.ball.destroy();
        this.dots.forEach((dot) => dot.destroy());
    }
}

class NeonLamp implements LampVisual {
    private readonly glow: Phaser.GameObjects.Image;
    private readonly tube: Phaser.GameObjects.Image;
    private level = 0;

    constructor(placement: LampPlacement) {
        this.glow = additive(
            placement.scene.add.image(placement.x, placement.y, LAMP_DISC_TEXTURE),
            placement.depth,
        ).setDisplaySize(180, 70);
        this.tube = additive(
            placement.scene.add.image(placement.x, placement.y, LAMP_TUBE_TEXTURE),
            placement.depth + 1,
        ).setDisplaySize(96, 12);
    }

    public update(frame: LampFrame): void {
        this.level = followLevel(this.level, Math.max(frame.bass, frame.mid, frame.treble));
        const colour = neonColor(frame);
        this.tube.setTint(colour).setAlpha(0.75 + 0.25 * this.level);
        this.glow.setTint(colour).setAlpha(0.25 + 0.6 * this.level);
    }

    public destroy(): void {
        this.glow.destroy();
        this.tube.destroy();
    }
}

class StrobeLamp implements LampVisual {
    private readonly body: Phaser.GameObjects.Image;
    private readonly flash: Phaser.GameObjects.Image;
    private lastBeatAt: number | undefined;

    constructor(private readonly placement: LampPlacement) {
        this.body = placement.scene.add
            .image(placement.x, placement.y, LAMP_BALL_TEXTURE)
            .setDepth(placement.depth)
            .setDisplaySize(18, 18)
            .setTint(0x888888);
        // The flash is small on purpose: the lamp, never the whole screen.
        this.flash = additive(
            placement.scene.add.image(placement.x, placement.y, LAMP_DISC_TEXTURE),
            placement.depth + 1,
        ).setDisplaySize(140, 140);
    }

    public update(frame: LampFrame, now: number): void {
        if (frame.beat) {
            this.lastBeatAt = now;
        }
        // The beat already comes at most three times a second (the ceiling is the signal's); with motion reduced, no
        // flash at all, only a steady glow.
        const alpha = this.placement.reducedMotion
            ? 0.15
            : flashAlpha(this.lastBeatAt === undefined ? undefined : now - this.lastBeatAt);
        this.flash.setAlpha(alpha);
    }

    public destroy(): void {
        this.body.destroy();
        this.flash.destroy();
    }
}

export function createLamp(kind: LampKind, placement: LampPlacement): LampVisual {
    switch (kind) {
        case "spot":
            return new SpotLamp(placement);
        case "disco":
            return new DiscoLamp(placement);
        case "neon":
            return new NeonLamp(placement);
        case "strobe":
            return new StrobeLamp(placement);
    }
}
