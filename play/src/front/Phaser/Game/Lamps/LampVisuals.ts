import * as Phaser from "phaser";
import type { LampFrame } from "./LampSignal";
import { flashAlpha, followLevel, mixColor, neonColor, spotAngle } from "./LampStyle";
import {
    LAMP_BALL_TEXTURE,
    LAMP_BEAM_TEXTURE,
    LAMP_DISC_TEXTURE,
    LAMP_MIRROR_BALL_TEXTURE,
    LAMP_TUBE_TEXTURE,
    MIRROR_BALL_FRAMES,
} from "./LampTextures";

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
    /** Where the images of the lamp are drawn (the lamps of a zone share one); without one, straight on the scene. */
    container?: Phaser.GameObjects.Container;
    /**
     * Where the light of the lamp is kept (its zone): beams stop at its walls, halos fade out within it, and the mirror
     * ball spreads its spots over it.
     */
    bounds?: { x: number; y: number; width: number; height: number };
}

/** A halo of `wanted` pixels, shrunk so that its soft edge dies out inside the zone, the lamp being where it is. */
function haloSize(placement: LampPlacement, wanted: number, axis: "width" | "height"): number {
    return fitInBounds(placement.bounds, placement.x, placement.y, wanted, axis);
}

/** `wanted`, shrunk to twice the distance from `x, y` to the nearest edge of the zone on that axis (at least 16). */
function fitInBounds(
    bounds: LampPlacement["bounds"],
    x: number,
    y: number,
    wanted: number,
    axis: "width" | "height",
): number {
    if (!bounds) {
        return wanted;
    }
    const centre = axis === "width" ? x : y;
    const start = axis === "width" ? bounds.x : bounds.y;
    // The disc texture is transparent at its rim: a disc this wide fades out exactly at the edge.
    const room = 2 * Math.min(centre - start, start + bounds[axis] - centre);
    return Math.max(16, Math.min(wanted, room));
}

/** How far a beam leaving `x, y` along `dx, dy` (a unit vector) goes before it meets the edge of the zone. */
function reachInBounds(bounds: LampPlacement["bounds"], x: number, y: number, dx: number, dy: number): number {
    if (!bounds) {
        return Infinity;
    }
    const along = (position: number, direction: number, start: number, size: number): number =>
        direction > 0
            ? (start + size - position) / direction
            : direction < 0
              ? (start - position) / direction
              : Infinity;
    return Math.max(0, Math.min(along(x, dx, bounds.x, bounds.width), along(y, dy, bounds.y, bounds.height)));
}

/** An image of a lamp, drawn in the container of its zone when it has one. */
function newImage(placement: LampPlacement, texture: string): Phaser.GameObjects.Image {
    const image = placement.scene.add.image(placement.x, placement.y, texture);
    placement.container?.add(image);
    return image;
}

/** The colours the spot and the discs go through, one step per beat. */
export const PALETTE = [0x45dcff, 0xff55bb, 0xaa77ff, 0x638bff, 0x65efaa, 0xffc36b];

function additive<T extends Phaser.GameObjects.Image>(image: T, depth: number): T {
    return image.setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
}

const SPOT_LENGTH = 260;

class SpotLamp implements LampVisual {
    private readonly beam: Phaser.GameObjects.Image;
    private readonly core: Phaser.GameObjects.Image;
    private readonly pool: Phaser.GameObjects.Image;
    private level = 0;
    private brightness = 1;
    private colourIndex = 0;
    private colour = PALETTE[0];
    private lastNow: number | undefined;
    private sweepTime: number;
    private x: number;
    private y: number;
    private pulse = 0;

    constructor(private readonly placement: LampPlacement) {
        this.x = placement.x;
        this.y = placement.y;
        this.sweepTime = placement.x * 7 + placement.y * 11;
        this.colourIndex = Math.floor(Math.abs(placement.x + placement.y) / 32) % PALETTE.length;
        this.colour = PALETTE[this.colourIndex];
        this.beam = additive(newImage(placement, LAMP_BEAM_TEXTURE), placement.depth)
            .setOrigin(0.5, 0)
            .setDisplaySize(140, 260);
        this.core = additive(newImage(placement, LAMP_BEAM_TEXTURE), placement.depth)
            .setOrigin(0.5, 0)
            .setDisplaySize(52, 260);
        this.pool = additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth).setDisplaySize(160, 80);
    }

    public moveTo(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.beam.setPosition(x, y);
        this.core.setPosition(x, y);
    }

    public setVisible(visible: boolean): void {
        this.beam.setVisible(visible);
        this.core.setVisible(visible);
        this.pool.setVisible(visible);
    }

    public setBrightness(brightness: number): void {
        this.brightness = brightness;
    }

    public update(frame: LampFrame, now: number): void {
        const delta = this.lastNow === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastNow));
        this.lastNow = now;
        if (frame.beat) {
            this.colourIndex = (this.colourIndex + 1) % PALETTE.length;
            // The colour jumps on the beat, like a moving head: a slow blend reads as a lamp, not a club.
            this.colour = PALETTE[this.colourIndex];
            this.pulse = 1;
        }
        this.pulse *= Math.exp(-delta / 200);
        this.level = followLevel(this.level, Math.max(frame.mid, frame.bass), delta);
        this.colour = mixColor(this.colour, PALETTE[this.colourIndex], 1 - Math.exp(-delta / 350));
        if (!this.placement.reducedMotion()) this.sweepTime += delta * (0.45 + 0.9 * this.level + 0.6 * this.pulse);
        const angle = this.placement.reducedMotion() ? 0 : spotAngle(this.sweepTime, 1);
        // The beam stops at the wall of its room: its image is never cut, so nothing of it shows past the wall.
        const reach = Math.min(
            SPOT_LENGTH,
            reachInBounds(this.placement.bounds, this.x, this.y, -Math.sin(angle), Math.cos(angle)),
        );
        const length = Math.max(1, reach);
        // The beam opens and burns brighter on each bass punch.
        this.beam
            .setRotation(angle)
            .setTint(this.colour)
            .setDisplaySize(140 * (1 + 0.35 * frame.bass), length)
            .setAlpha(Math.min(1, 0.35 + 0.3 * this.level + 0.3 * this.pulse + 0.4 * frame.bass) * this.brightness);
        this.core
            .setRotation(angle)
            .setDisplaySize(52, length)
            .setTint(mixColor(this.colour, 0xffffff, 0.3))
            .setAlpha((0.45 + 0.5 * this.level) * this.brightness);
        const poolX = this.x - Math.sin(angle) * length * 0.8;
        const poolY = this.y + Math.cos(angle) * length * 0.8;
        const bounds = this.placement.bounds;
        this.pool
            .setPosition(poolX, poolY)
            .setDisplaySize(
                fitInBounds(bounds, poolX, poolY, 160, "width"),
                fitInBounds(bounds, poolX, poolY, 80, "height"),
            )
            .setTint(this.colour)
            .setAlpha((0.65 + 0.35 * this.level) * this.brightness);
    }

    public destroy(): void {
        this.beam.destroy();
        this.core.destroy();
        this.pool.destroy();
    }
}

const DISCO_DOTS = 30;
const DISCO_RAYS = 8;
const MIRROR_BALL_PX = 34;
/** Radians per millisecond at rest, and what the music adds: about one turn in 8 s, twice as fast when it is loud. */
const DISCO_SPIN = 0.0008;
const DISCO_SPIN_LOUD = 0.0012;

/** Where each spot of a mirror ball falls: a fixed place on a disc of radius 1, kept from image to image. */
const DISCO_SPOTS = Array.from({ length: DISCO_DOTS }, (_, index) => ({
    // Golden angle: evenly spread, no visible rings.
    angle: index * 2.399963,
    distance: 0.25 + 0.75 * Math.sqrt((index + 0.5) / DISCO_DOTS),
}));

/**
 * A turning mirror ball. Its body is drawn even on an object of the map (the object's own image does not turn), and
 * throws coloured spots that sweep the whole room, with faint rays from the ball to a few of them.
 */
class DiscoLamp implements LampVisual {
    private readonly halo: Phaser.GameObjects.Image;
    private readonly ball: Phaser.GameObjects.Image;
    /** The same ball added in light over it, in the colour of the moment: the room's lights in its mirrors. */
    private readonly sheen: Phaser.GameObjects.Image;
    private readonly rays: Phaser.GameObjects.Image[];
    private readonly dots: Phaser.GameObjects.Image[];
    private x: number;
    private y: number;
    private spin = 0;
    private lastNow: number | undefined;
    private level = 0;
    private pulse = 0;
    private colourShift = 0;
    private direction = 1;
    private brightness = 1;

    constructor(private readonly placement: LampPlacement) {
        this.x = placement.x;
        this.y = placement.y;
        this.dots = DISCO_SPOTS.map((_, index) =>
            additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth).setDisplaySize(
                22 + (index % 3) * 8,
                14 + (index % 3) * 5,
            ),
        );
        this.rays = Array.from({ length: DISCO_RAYS }, () =>
            additive(newImage(placement, LAMP_BEAM_TEXTURE), placement.depth).setOrigin(0.5, 0),
        );
        this.halo = additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth).setDisplaySize(
            haloSize(placement, 90, "width"),
            haloSize(placement, 90, "height"),
        );
        this.ball = newImage(placement, LAMP_MIRROR_BALL_TEXTURE)
            .setDepth(placement.depth + 1)
            .setDisplaySize(MIRROR_BALL_PX, MIRROR_BALL_PX);
        this.sheen = additive(newImage(placement, LAMP_MIRROR_BALL_TEXTURE), placement.depth + 2).setDisplaySize(
            MIRROR_BALL_PX,
            MIRROR_BALL_PX,
        );
    }

    public moveTo(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.ball.setPosition(x, y);
        this.sheen.setPosition(x, y);
        this.halo.setPosition(x, y);
    }

    public setVisible(visible: boolean): void {
        this.ball.setVisible(visible);
        this.sheen.setVisible(visible);
        this.halo.setVisible(visible);
        this.rays.forEach((ray) => ray.setVisible(visible));
        this.dots.forEach((dot) => dot.setVisible(visible));
    }

    public setBrightness(brightness: number): void {
        this.brightness = brightness;
    }

    public update(frame: LampFrame, now: number): void {
        const delta = this.lastNow === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastNow));
        this.lastNow = now;
        const still = this.placement.reducedMotion();
        this.level = followLevel(this.level, Math.max(frame.bass, frame.mid, frame.treble), delta);
        if (frame.beat) {
            this.pulse = 1;
            this.colourShift = (this.colourShift + 1) % PALETTE.length;
        }
        // A new bar, a new scene: the spots sweep back the other way.
        if (frame.bar) this.direction = -this.direction;
        this.pulse *= Math.exp(-delta / 220);
        if (!still) {
            this.spin += this.direction * delta * (DISCO_SPIN + DISCO_SPIN_LOUD * this.level);
        }
        const turn = (((this.spin / (2 * Math.PI)) % 1) + 1) % 1;
        const ballFrame = Math.floor(turn * MIRROR_BALL_FRAMES) % MIRROR_BALL_FRAMES;
        this.ball.setFrame(ballFrame).setAlpha(this.brightness);
        this.sheen
            .setFrame(ballFrame)
            .setTint(PALETTE[this.colourShift])
            .setAlpha(Math.min(1, 0.3 + 0.2 * this.level + 0.5 * frame.bass) * this.brightness);
        this.halo
            .setTint(PALETTE[this.colourShift])
            .setAlpha(Math.min(1, 0.2 + 0.25 * this.level + 0.25 * this.pulse + 0.45 * frame.bass) * this.brightness);

        const bounds = this.placement.bounds;
        const centreX = bounds ? bounds.x + bounds.width / 2 : this.x;
        const centreY = bounds ? bounds.y + bounds.height / 2 : this.y + 60;
        // The spots stay a soft edge away from the walls: none spills past them.
        const radiusX = bounds ? Math.max(40, bounds.width / 2 - 24) : 120;
        const radiusY = bounds ? Math.max(30, bounds.height / 2 - 24) : 80;
        this.dots.forEach((dot, index) => {
            const spot = DISCO_SPOTS[index];
            const theta = spot.angle + this.spin;
            const twinkle = 0.5 + 0.5 * Math.sin(this.spin * 9 + index * 1.7);
            dot.setPosition(
                centreX + Math.cos(theta) * spot.distance * radiusX,
                centreY + Math.sin(theta) * spot.distance * radiusY,
            )
                .setTint(this.dotColour(index))
                .setAlpha(Math.min(1, 0.35 + 0.25 * this.level + 0.25 * twinkle + 0.35 * frame.bass) * this.brightness);
        });
        this.rays.forEach((ray, index) => {
            const targetIndex = Math.floor((index * DISCO_DOTS) / DISCO_RAYS);
            const target = this.dots[targetIndex];
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            ray.setPosition(this.x, this.y)
                .setRotation(Math.atan2(dy, dx) - Math.PI / 2)
                .setDisplaySize(8, Math.max(1, Math.hypot(dx, dy)))
                .setTint(this.dotColour(targetIndex))
                .setAlpha((0.08 + 0.12 * this.level + 0.2 * this.pulse) * this.brightness);
        });
    }

    public destroy(): void {
        this.ball.destroy();
        this.sheen.destroy();
        this.halo.destroy();
        this.rays.forEach((ray) => ray.destroy());
        this.dots.forEach((dot) => dot.destroy());
    }

    private dotColour(index: number): number {
        return mixColor(PALETTE[(index + this.colourShift) % PALETTE.length], 0xffffff, 0.2);
    }
}

class NeonLamp implements LampVisual {
    private readonly glow: Phaser.GameObjects.Image;
    private readonly tube: Phaser.GameObjects.Image;
    private level = 0;
    private brightness = 1;
    private lastNow: number | undefined;
    private colour = PALETTE[0];
    private colourIndex = 0;
    private pulse = 0;

    constructor(private readonly placement: LampPlacement) {
        this.colourIndex = Math.floor(Math.abs(placement.x + placement.y) / 32) % PALETTE.length;
        this.colour = PALETTE[this.colourIndex];
        this.glow = additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth).setDisplaySize(
            haloSize(placement, 240, "width"),
            haloSize(placement, 110, "height"),
        );
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

    public update(frame: LampFrame, now: number): void {
        const delta = this.lastNow === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastNow));
        this.lastNow = now;
        this.level = followLevel(this.level, Math.max(frame.bass, frame.mid, frame.treble), delta);
        if (frame.beat) {
            this.colourIndex = (this.colourIndex + 1) % PALETTE.length;
            this.pulse = 1;
        }
        this.pulse *= Math.exp(-delta / 180);
        const targetColour = mixColor(PALETTE[this.colourIndex], neonColor(frame), 0.2);
        this.colour = mixColor(this.colour, targetColour, 1 - Math.exp(-delta / 300));
        this.tube.setTint(mixColor(this.colour, 0xffffff, 0.45)).setAlpha((0.65 + 0.25 * this.level) * this.brightness);
        this.glow
            .setTint(this.colour)
            .setAlpha(Math.min(1, 0.4 + 0.25 * this.level + 0.2 * this.pulse + 0.45 * frame.bass) * this.brightness);
    }

    public destroy(): void {
        this.glow.destroy();
        this.tube.destroy();
    }
}

const STROBE_MIN_BASS = 0.55;

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
        this.flash = additive(newImage(placement, LAMP_DISC_TEXTURE), placement.depth + 1).setDisplaySize(
            haloSize(placement, 200, "width"),
            haloSize(placement, 200, "height"),
        );
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
        // The strobe answers the heavy hits only (a kick, a drop): flashing on every beat tires instead of thrilling.
        if (frame.beat && frame.bass >= STROBE_MIN_BASS) {
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
