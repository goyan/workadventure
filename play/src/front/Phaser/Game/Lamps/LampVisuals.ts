import * as Phaser from "phaser";
import type { LampFrame } from "./LampSignal";
import { flashAlpha, neonColor, spotAngle } from "./LampStyle";
import { LAMP_BALL_TEXTURE, LAMP_BEAM_TEXTURE, LAMP_DISC_TEXTURE, LAMP_TUBE_TEXTURE } from "./LampTextures";

/** One lamp on the map: drawn from the music at every image, and following the object it is lit from. */
export interface LampVisual {
    /** Moves the lamp: the object it belongs to was moved (in the editor, while it is being dragged). */
    moveTo(x: number, y: number): void;
    /** A lamp whose Jam plays nothing is off: nothing is drawn, the object itself stays. */
    setVisible(visible: boolean): void;
    /** How bright the lamp is, from 0 to 1: the light dies away when the music stops instead of being cut. */
    setBrightness(brightness: number): void;
    update(frame: LampFrame, now: number): void;
    destroy(): void;
}

export type LampKind = "spot" | "disco" | "neon" | "strobe";

export interface LampPlacement {
    scene: Phaser.Scene;
    x: number;
    y: number;
    depth: number;
    /** Photosensitivity: no rotation, no flash, steady light only. Asked at each image: the setting can change. */
    reducedMotion: () => boolean;
    /**
     * Whether the lamp draws its own body (the ball, the tube, the box). A demo lamp does; a lamp that belongs to an
     * object of the map does not: the object is the body, and only the light is drawn over it.
     */
    drawsBody: boolean;
    /**
     * Where the images of the lamp are drawn. The lamps of a zone share one, which clips what is in it to the zone: the
     * light of a room stays in the room. Without one, the images go straight on the scene (nothing clips them).
     */
    container?: Phaser.GameObjects.Container;
}

/** An image of a lamp, drawn in the container of its zone when it has one. */
function newImage(placement: LampPlacement, texture: string): Phaser.GameObjects.Image {
    const image = newImage(placement, texture);
    placement.container?.add(image);
    return image;
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
    private brightness = 1;
    private colourIndex = 0;

    constructor(private readonly placement: LampPlacement) {
        this.beam = additive(newImage(placement, LAMP_BEAM_TEXTURE), placement.depth)
            .setOrigin(0.5, 0)
            .setDisplaySize(200, 330);
    }

    public moveTo(x: number, y: number): void {
        this.beam.setPosition(x, y);
    }

    public setVisible(visible: boolean): void {
        this.beam.setVisible(visible);
    }

    public setBrightness(brightness: number): void {
        this.brightness = brightness;
    }

    public update(frame: LampFrame, now: number): void {
        if (frame.beat) {
            this.colourIndex = (this.colourIndex + 1) % PALETTE.length;
        }
        this.level = followLevel(this.level, Math.max(frame.mid, frame.bass));
        this.beam
            .setRotation(this.placement.reducedMotion() ? 0 : spotAngle(now, 0.8 + frame.bass))
            .setTint(PALETTE[this.colourIndex])
            .setAlpha((0.45 + 0.55 * this.level) * this.brightness);
    }

    public destroy(): void {
        this.beam.destroy();
    }
}

const DISCO_DOTS = 7;
const DISCO_RADIUS = 70;

class DiscoLamp implements LampVisual {
    private readonly ball: Phaser.GameObjects.Image;
    private readonly dots: Phaser.GameObjects.Image[] = [];
    private x: number;
    private y: number;
    private angle = 0;
    private lastNow: number | undefined;
    private level = 0;
    private brightness = 1;

    constructor(private readonly placement: LampPlacement) {
        this.x = placement.x;
        this.y = placement.y;
        this.ball = newImage(placement, LAMP_BALL_TEXTURE).setDepth(placement.depth).setDisplaySize(26, 26);
        for (let index = 0; index < DISCO_DOTS; index++) {
            this.dots.push(
                additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth)
                    .setDisplaySize(44, 44)
                    .setTint(PALETTE[index % PALETTE.length]),
            );
        }
    }

    public moveTo(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.ball.setPosition(x, y);
    }

    public setVisible(visible: boolean): void {
        this.ball.setVisible(visible && this.placement.drawsBody);
        this.dots.forEach((dot) => dot.setVisible(visible));
    }

    public setBrightness(brightness: number): void {
        this.brightness = brightness;
    }

    public update(frame: LampFrame, now: number): void {
        const delta = this.lastNow === undefined ? 0 : now - this.lastNow;
        this.lastNow = now;
        this.level = followLevel(this.level, (frame.bass + frame.mid + frame.treble) / 3);
        // The spots on the floor turn faster as the music gets louder; they stand still when motion is reduced.
        if (!this.placement.reducedMotion()) {
            this.angle += delta * (0.0004 + 0.0025 * this.level);
        }
        this.ball.setAlpha((0.75 + 0.25 * frame.treble) * this.brightness);
        this.dots.forEach((dot, index) => {
            const theta = this.angle + (index / DISCO_DOTS) * Math.PI * 2;
            // Seen from above at an angle: the circle is flattened.
            dot.setPosition(
                this.x + Math.cos(theta) * DISCO_RADIUS,
                this.y + 50 + Math.sin(theta) * DISCO_RADIUS * 0.5,
            ).setAlpha((0.35 + 0.55 * this.level) * this.brightness);
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
    private brightness = 1;

    constructor(private readonly placement: LampPlacement) {
        this.glow = additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth).setDisplaySize(180, 70);
        this.tube = additive(newImage(placement, LAMP_TUBE_TEXTURE), placement.depth + 1).setDisplaySize(96, 12);
    }

    public moveTo(x: number, y: number): void {
        this.glow.setPosition(x, y);
        this.tube.setPosition(x, y);
    }

    public setVisible(visible: boolean): void {
        this.glow.setVisible(visible);
        this.tube.setVisible(visible && this.placement.drawsBody);
    }

    public setBrightness(brightness: number): void {
        this.brightness = brightness;
    }

    public update(frame: LampFrame): void {
        this.level = followLevel(this.level, Math.max(frame.bass, frame.mid, frame.treble));
        const colour = neonColor(frame);
        this.tube.setTint(colour).setAlpha((0.75 + 0.25 * this.level) * this.brightness);
        this.glow.setTint(colour).setAlpha((0.25 + 0.6 * this.level) * this.brightness);
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
    private brightness = 1;

    constructor(private readonly placement: LampPlacement) {
        this.body = newImage(placement, LAMP_BALL_TEXTURE)
            .setDepth(placement.depth)
            .setDisplaySize(18, 18)
            .setTint(0x888888);
        // The flash is small on purpose: the lamp, never the whole screen.
        this.flash = additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth + 1).setDisplaySize(140, 140);
    }

    public moveTo(x: number, y: number): void {
        this.body.setPosition(x, y);
        this.flash.setPosition(x, y);
    }

    public setVisible(visible: boolean): void {
        this.body.setVisible(visible && this.placement.drawsBody);
        this.flash.setVisible(visible);
    }

    public setBrightness(brightness: number): void {
        this.brightness = brightness;
    }

    public update(frame: LampFrame, now: number): void {
        if (frame.beat) {
            this.lastBeatAt = now;
        }
        // The beat already comes at most three times a second (the ceiling is the signal's); with motion reduced, no
        // flash at all, only a steady glow.
        const alpha = this.placement.reducedMotion()
            ? 0.15
            : flashAlpha(this.lastBeatAt === undefined ? undefined : now - this.lastBeatAt);
        this.flash.setAlpha(alpha * this.brightness);
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
