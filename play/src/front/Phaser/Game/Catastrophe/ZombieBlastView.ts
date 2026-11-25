import * as Phaser from "phaser";
import { ZOMBIE_GRENADE_BLAST_M, ZOMBIE_PX_PER_METRE } from "@workadventure/map-editor";
import { DEPTH_LAMP_LIGHT_INDEX, DEPTH_SEASONAL_GROUND_INDEX } from "../DepthIndexes";
import { floorDepth } from "../MapEditor/MapLayer/FloorDepth";

const SOFT = "zombie-fx-soft";
const RING = "zombie-fx-ring";
const GRENADE = "zombie-fx-grenade";
const SPECK = "zombie-fx-speck";
/**
 * The most bits of fire, smoke and debris at once: past it, the oldest go first. Past half of it (many players
 * shooting, a grenade a second each), a blast throws as little smoke and debris as in reduced motion.
 */
const MOST_BITS = 700;
/** The grenades drawn at once: a player has four in the air at most (a fuse of 4 s, a shot a second). */
const GRENADES_AT_ONCE = 64;

interface Bit {
    image: Phaser.GameObjects.Image;
    bornAt: number;
    lifeMs: number;
    x: number;
    y: number;
    /** Its height over the ground (px), and how fast it goes (px/s) along x, y and up. */
    z: number;
    vx: number;
    vy: number;
    vz: number;
    /** Falls under gravity (debris), or rises and slows (smoke, flames). */
    falls: boolean;
    fromScale: number;
    toScale: number;
    fromAlpha: number;
}

/**
 * The fire of the grenades of a horde, drawn: the grenade flying, bouncing and rolling with its shadow, then the blast
 * where it goes off (a flash that pierces the night, the shock wave running out over the ground to the radius of its
 * casualties, a fireball, smoke rising, debris thrown, a scorch left on the ground), and the flames of the zombies it
 * threw. Textures drawn once by the code, a pool of images: nothing while no grenade goes off.
 */
export class ZombieBlastView {
    private readonly bits: Bit[] = [];
    private readonly spare: Phaser.GameObjects.Image[] = [];
    private readonly grenades: { body: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        /**
         * How high over the ground one walks above a point of the ground (map pixels): the deck of a bridge, where a
         * grenade rolls and goes off over its slabs. None when absent.
         */
        private readonly liftAt: (x: number, y: number) => number = () => 0,
    ) {}

    /**
     * The depth of what is drawn `lift` px over the ground, `depth` the one it has on the ground: unchanged there; on
     * a deck, over its slabs, sorted as on the ground (floorDepth); what lies flat on the ground (`flat`: a shadow, a
     * scorch, the shock wave) just over the slabs, under everything that stands on them, in the same order.
     */
    private depthOn(lift: number, depth: number, flat = false): number {
        if (lift <= 0) return depth;
        return floorDepth(lift, flat ? depth - DEPTH_SEASONAL_GROUND_INDEX : depth);
    }

    private makeTextures(): void {
        if (this.scene.textures.exists(SOFT)) return;
        const soft = this.scene.textures.createCanvas(SOFT, 64, 64);
        const softContext = soft?.getContext();
        if (soft && softContext) {
            const gradient = softContext.createRadialGradient(32, 32, 0, 32, 32, 32);
            gradient.addColorStop(0, "rgba(255,255,255,1)");
            gradient.addColorStop(0.45, "rgba(255,255,255,0.55)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            softContext.fillStyle = gradient;
            softContext.fillRect(0, 0, 64, 64);
            soft.refresh();
        }
        const ring = this.scene.textures.createCanvas(RING, 128, 128);
        const ringContext = ring?.getContext();
        if (ring && ringContext) {
            const gradient = ringContext.createRadialGradient(64, 64, 48, 64, 64, 64);
            gradient.addColorStop(0, "rgba(255,255,255,0)");
            gradient.addColorStop(0.82, "rgba(255,255,255,0.8)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ringContext.fillStyle = gradient;
            ringContext.fillRect(0, 0, 128, 128);
            ring.refresh();
        }
        // A grenade, pixel by pixel: an olive body, a dark band, a spoon on top.
        const grenade = this.scene.textures.createCanvas(GRENADE, 6, 8);
        const grenadeContext = grenade?.getContext();
        if (grenade && grenadeContext) {
            const pixels: [number, number, string][] = [
                [2, 0, "#4a4a42"],
                [3, 0, "#6b6b60"],
                [3, 1, "#6b6b60"],
                [1, 2, "#3f4a2a"],
                [2, 2, "#56663a"],
                [3, 2, "#56663a"],
                [4, 2, "#3f4a2a"],
            ];
            for (let y = 3; y < 7; y++) {
                for (let x = 0; x < 6; x++) {
                    const edge = x === 0 || x === 5 || y === 6;
                    pixels.push([x, y, y === 4 ? "#2c3320" : edge ? "#3a4426" : x === 1 ? "#7a8a52" : "#5b6b3e"]);
                }
            }
            for (const [x, y, color] of pixels) {
                grenadeContext.fillStyle = color;
                grenadeContext.fillRect(x, y, 1, 1);
            }
            grenade.refresh();
        }
        const speck = this.scene.textures.createCanvas(SPECK, 3, 3);
        const speckContext = speck?.getContext();
        if (speck && speckContext) {
            speckContext.fillStyle = "#ffffff";
            speckContext.fillRect(0, 0, 3, 3);
            speck.refresh();
        }
    }

    /** The grenades in flight or on the ground now (map pixels, their height in pixels): drawn with their shadows. */
    public setGrenades(flying: readonly { x: number; y: number; z: number }[]): void {
        if (flying.length > 0) this.makeTextures();
        for (let at = 0; at < GRENADES_AT_ONCE; at++) {
            const grenade = flying[at];
            let drawn = this.grenades[at];
            if (!grenade) {
                if (drawn) {
                    drawn.body.setVisible(false);
                    drawn.shadow.setVisible(false);
                }
                continue;
            }
            if (!drawn) {
                drawn = {
                    shadow: this.scene.add.image(0, 0, SOFT).setTint(0x000000).setAlpha(0.35),
                    body: this.scene.add.image(0, 0, GRENADE).setScale(1.5),
                };
                this.grenades[at] = drawn;
            }
            const shrink = Math.max(0.3, 1 - grenade.z / (6 * ZOMBIE_PX_PER_METRE));
            const lift = Math.round(this.liftAt(grenade.x, grenade.y));
            drawn.shadow
                .setPosition(grenade.x, grenade.y - lift)
                .setScale(0.18 * shrink, 0.08 * shrink)
                .setDepth(this.depthOn(lift, DEPTH_SEASONAL_GROUND_INDEX + 0.12, true))
                .setVisible(true);
            drawn.body
                .setPosition(grenade.x, grenade.y - lift - 4 - grenade.z)
                .setDepth(this.depthOn(lift, grenade.y + 1))
                .setRotation((grenade.x + grenade.z) * 0.05)
                .setVisible(true);
        }
    }

    /**
     * A grenade goes off at a point of the ground (map pixels) at `now` (ms, the clock of the game): its blast, drawn,
     * over the deck of a bridge when it is on one.
     */
    public blast(groundX: number, groundY: number, now: number, reducedMotion: boolean): void {
        this.makeTextures();
        const px = ZOMBIE_PX_PER_METRE;
        const lift = Math.round(this.liftAt(groundX, groundY));
        const x = groundX;
        // Where it is drawn, and its depths, over the deck it went off on.
        const y = groundY - lift;
        const on = (depth: number, flat = false): number => this.depthOn(lift, depth, flat);
        const light = reducedMotion || this.bits.length > MOST_BITS / 2;
        // The flash, over the night.
        this.spawn(SOFT, x, y, 0, 0, 0, 0, false, now, 160, 0xfff4d0, 4.5, 6, 1, DEPTH_LAMP_LIGHT_INDEX + 1, true);
        // The shock wave on the ground, out to the radius of its casualties.
        const blastScale = (ZOMBIE_GRENADE_BLAST_M * px * 2) / 128;
        this.spawn(
            RING,
            x,
            y,
            0,
            0,
            0,
            0,
            false,
            now,
            420,
            0xffe8c0,
            0.2,
            blastScale,
            0.3,
            on(DEPTH_SEASONAL_GROUND_INDEX + 0.14, true),
            true,
        );
        // The fireball.
        for (let puff = 0; puff < 6; puff++) {
            const angle = (puff / 6) * Math.PI * 2;
            const reach = 0.6 * px;
            this.spawn(
                SOFT,
                x + Math.cos(angle) * reach,
                y + Math.sin(angle) * reach * 0.6,
                0.8 * px,
                Math.cos(angle) * 2 * px,
                Math.sin(angle) * 1.2 * px,
                1.5 * px,
                false,
                now,
                650 + puff * 40,
                puff % 2 === 0 ? 0xff8a1c : 0xffc23a,
                0.6,
                2.2,
                0.95,
                on(groundY + 260),
                true,
            );
        }
        // The smoke, rising and spreading, slower in reduced motion.
        const smokes = light ? 4 : 12;
        for (let puff = 0; puff < smokes; puff++) {
            const angle = (puff / smokes) * Math.PI * 2;
            this.spawn(
                SOFT,
                x + Math.cos(angle) * 0.8 * px,
                y + Math.sin(angle) * 0.5 * px,
                1.5 * px,
                Math.cos(angle) * 0.6 * px,
                Math.sin(angle) * 0.4 * px,
                (1.6 + (puff % 3) * 0.4) * px,
                false,
                now + puff * 30,
                2800 + (puff % 4) * 300,
                puff % 3 === 0 ? 0x3a3632 : 0x5a5650,
                0.8,
                3.4,
                0.75,
                on(groundY + 300),
                false,
            );
        }
        // The debris: clods and splinters thrown up and out.
        const specks = light ? 6 : 26;
        for (let piece = 0; piece < specks; piece++) {
            const angle = (piece * 2.399963) % (Math.PI * 2);
            const speed = (4 + (piece % 5) * 1.6) * px;
            this.spawn(
                SPECK,
                x,
                y,
                0.3 * px,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed * 0.6,
                (4 + (piece % 4) * 1.5) * px,
                true,
                now,
                1100,
                piece % 3 === 0 ? 0x2a2018 : 0x5a4a30,
                1,
                1,
                1,
                on(groundY + 2),
                false,
            );
        }
        // The scorch it leaves on the ground.
        this.spawn(
            SOFT,
            x,
            y,
            0,
            0,
            0,
            0,
            false,
            now,
            25_000,
            0x14100c,
            2.6,
            2.6,
            0.7,
            on(DEPTH_SEASONAL_GROUND_INDEX + 0.11, true),
            false,
        );
        this.scene.markDirty();
    }

    /** A flame over a zombie thrown by a blast, burning (map pixels, its foot on the ground; how high it is). */
    public flame(x: number, groundY: number, z: number, now: number, seed: number): void {
        this.makeTextures();
        const px = ZOMBIE_PX_PER_METRE;
        const lift = Math.round(this.liftAt(x, groundY));
        const y = groundY - lift;
        // Tongues of flame rising off the body, and its glow.
        for (let tongue = 0; tongue < 3; tongue++) {
            const side = (((seed + tongue) * 7919) % 11) / 11 - 0.5;
            this.spawn(
                SOFT,
                x + side * 14,
                y,
                z + 6 + tongue * 7,
                side * 0.4 * px,
                0,
                (1.8 + tongue * 0.4) * px,
                false,
                now,
                380 + tongue * 60,
                tongue === 0 ? 0xffd040 : tongue === 1 ? 0xff8a18 : 0xe04a10,
                0.55 - tongue * 0.1,
                0.15,
                0.95,
                this.depthOn(lift, groundY + 3),
                true,
            );
        }
        if (seed % 3 === 0)
            this.spawn(
                SOFT,
                x,
                y,
                z + 14,
                0,
                0,
                0,
                false,
                now,
                300,
                0xff6a10,
                1.1,
                1.2,
                0.35,
                this.depthOn(lift, groundY + 2),
                true,
            );
    }

    private spawn(
        texture: string,
        x: number,
        y: number,
        z: number,
        vx: number,
        vy: number,
        vz: number,
        falls: boolean,
        now: number,
        lifeMs: number,
        tint: number,
        fromScale: number,
        toScale: number,
        fromAlpha: number,
        depth: number,
        additive: boolean,
    ): void {
        if (this.bits.length >= MOST_BITS) this.retire(this.bits.shift());
        const image = this.spare.pop() ?? this.scene.add.image(0, 0, texture);
        image
            .setTexture(texture)
            .setTint(tint)
            .setDepth(depth)
            .setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
            .setVisible(false);
        this.bits.push({ image, bornAt: now, lifeMs, x, y, z, vx, vy, vz, falls, fromScale, toScale, fromAlpha });
    }

    private retire(bit: Bit | undefined): void {
        if (!bit) return;
        bit.image.setVisible(false);
        this.spare.push(bit.image);
    }

    /** At each image: the bits move on, grow, fade, and go once their time is up. */
    public update(now: number, deltaMs: number): void {
        if (this.bits.length === 0) return;
        const seconds = Math.min(0.1, Math.max(0, deltaMs / 1000));
        const gravity = 9.81 * ZOMBIE_PX_PER_METRE;
        const kept: Bit[] = [];
        for (const bit of this.bits) {
            const age = now - bit.bornAt;
            if (age >= bit.lifeMs) {
                this.retire(bit);
                continue;
            }
            kept.push(bit);
            if (age < 0) continue;
            const share = age / bit.lifeMs;
            if (bit.falls) {
                bit.vz -= gravity * seconds;
                bit.z += bit.vz * seconds;
                if (bit.z <= 0) {
                    bit.z = 0;
                    bit.vz = 0;
                    bit.vx *= 0.5;
                    bit.vy *= 0.5;
                }
            } else {
                bit.z += bit.vz * seconds;
                // Smoke and flames slow as they rise and spread.
                bit.vx *= 1 - 0.8 * seconds;
                bit.vy *= 1 - 0.8 * seconds;
                bit.vz *= 1 - 0.5 * seconds;
            }
            bit.x += bit.vx * seconds;
            bit.y += bit.vy * seconds;
            const scale = bit.fromScale + (bit.toScale - bit.fromScale) * Math.sqrt(share);
            bit.image
                .setPosition(bit.x, bit.y - bit.z)
                .setScale(scale)
                .setAlpha(bit.fromAlpha * (1 - share) * (1 - share * 0.3))
                .setVisible(true);
        }
        this.bits.length = 0;
        this.bits.push(...kept);
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const bit of this.bits) bit.image.destroy();
        for (const image of this.spare) image.destroy();
        for (const grenade of this.grenades) {
            grenade.body.destroy();
            grenade.shadow.destroy();
        }
        this.bits.length = 0;
        this.spare.length = 0;
        this.grenades.length = 0;
    }
}
