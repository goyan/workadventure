import type * as Phaser from "phaser";
import { TREE_FOOT } from "./FallenTreeTexture";

/** How the ground darkens a tree lying on it: its crown seen against the ground, not against the sky. */
const LYING_TINT = 0xc8c8c8;
/** A tree falls in this long, faster and faster, as a pole tipping over. */
export const FALL_MS = 1400;
/** At the end, it bounces a little off the ground (radians up, over this long), then lies still. */
const BOUNCE_MS = 320;
const BOUNCE_TILT = 0.09;
/** The leaves its crown sheds as it hits the ground, and how long they fly. */
const IMPACT_LEAVES = 10;
const LEAF_MS = 900;
const LEAF_TEXTURE = "fallen-tree-leaf";

/** A tree lying on the ground, as it is drawn: its own image, its foot where it stood, the way the wind blew. */
export interface LyingTree {
    textureKey: string;
    /** Its foot, map pixels. */
    footX: number;
    footY: number;
    /** Where it lies, from its foot (degrees, 0 north, 90 east). */
    toward: number;
    depth: number;
    /** When it was laid down before the eyes of this player (time of the scene): it is seen falling; else lying. */
    fellAt?: number;
}

/** The angle (radians, clockwise from up, as Phaser turns an image) that lays a standing image the way given. */
export function lyingRotation(toward: number): number {
    return ((Number.isFinite(toward) ? toward : 0) * Math.PI) / 180;
}

/** The way a tree falls, as a unit vector on the map (y down): north up, east right. */
export function fallVector(toward: number): { x: number; y: number } {
    const angle = lyingRotation(toward);
    return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/**
 * How far a tree leans from upright (radians) `elapsed` ms after it began to fall: faster and faster to the ground in
 * FALL_MS (a quarter turn), a small bounce, then lying (pi / 2).
 */
export function fallTilt(elapsed: number): number {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
    if (elapsed < FALL_MS) return (Math.PI / 2) * (elapsed / FALL_MS) ** 2;
    if (elapsed < FALL_MS + BOUNCE_MS)
        return Math.PI / 2 - BOUNCE_TILT * Math.sin((Math.PI * (elapsed - FALL_MS)) / BOUNCE_MS);
    return Math.PI / 2;
}

/**
 * How the standing image of a tree is drawn leaning `tilt` the way `toward`, seen from above at the angle of the game
 * (its height drawn up the screen): its axis goes from its foot to (0, -cos tilt) + the way it falls × sin tilt, so the
 * image is turned along that axis and shortened to its length. Lying (pi / 2), the image of lyingRotation, unshortened.
 */
export function leaningImage(toward: number, tilt: number): { rotation: number; scaleY: number } {
    const way = fallVector(toward);
    const lean = Math.sin(tilt);
    const axis = { x: way.x * lean, y: -Math.cos(tilt) + way.y * lean };
    const length = Math.hypot(axis.x, axis.y);
    return {
        rotation: length < 1e-6 ? lyingRotation(toward) : Math.atan2(axis.x, -axis.y),
        scaleY: Math.max(0.02, length),
    };
}

interface Shown {
    image: Phaser.GameObjects.Image;
    toward: number;
    fellAt: number | undefined;
    shed: boolean;
}

interface Leaf {
    image: Phaser.GameObjects.Image;
    vx: number;
    vy: number;
    born: number;
}

/**
 * The trees the wind laid down, drawn lying on the ground: each its own image turned about its foot, its crown the way
 * the wind blew; one laid down before the eyes of this player is seen falling first, a bounce and a few leaves shed
 * at the end. What stands of them (the stump) is the object of the map itself (FallenTreeTexture.stumpTexture).
 * Drawn only: the server keeps the trees lying.
 */
export class FallenTreeView {
    private readonly lying = new Map<string, Shown>();
    private leaves: Leaf[] = [];
    private updatedAt: number | undefined;
    /** Changes whenever a tree laid down takes another pose: the shadows are drawn again then. */
    public version = 0;

    constructor(private readonly scene: Phaser.Scene & { markDirty(): void }) {}

    /** Shows the tree `id` lying (falling first if it just fell), or no more (undefined). */
    public show(id: string, tree: LyingTree | undefined): void {
        const shown = this.lying.get(id);
        this.version++;
        if (!tree) {
            if (shown) {
                shown.image.destroy();
                this.lying.delete(id);
                this.scene.markDirty();
            }
            return;
        }
        const image = shown?.image ?? this.scene.add.image(0, 0, tree.textureKey).setTint(LYING_TINT);
        if (image.texture.key !== tree.textureKey) image.setTexture(tree.textureKey);
        image
            .setOrigin(TREE_FOOT.x / Math.max(1, image.width), TREE_FOOT.y / Math.max(1, image.height))
            .setPosition(tree.footX, tree.footY)
            .setDepth(tree.depth);
        const fellAt = shown?.fellAt ?? tree.fellAt;
        this.lying.set(id, { image, toward: tree.toward, fellAt, shed: shown?.shed ?? false });
        this.pose(this.lying.get(id)!, this.scene.time.now);
        this.scene.markDirty();
    }

    /** How far the tree `id` leans from upright now (radians): pi / 2 lying; undefined for a tree not lying. */
    public tiltOf(id: string): number | undefined {
        const shown = this.lying.get(id);
        if (!shown) return undefined;
        return shown.fellAt === undefined ? Math.PI / 2 : fallTilt(this.scene.time.now - shown.fellAt);
    }

    /** At each image: the trees falling move on, the leaves they shed fly and fade. */
    public update(now: number): void {
        const seconds = this.updatedAt === undefined ? 0 : Math.min(0.1, Math.max(0, (now - this.updatedAt) / 1000));
        this.updatedAt = now;
        let moving = false;
        for (const shown of this.lying.values()) {
            if (shown.fellAt === undefined) continue;
            moving = true;
            this.pose(shown, now);
            const elapsed = now - shown.fellAt;
            if (!shown.shed && elapsed >= FALL_MS) {
                shown.shed = true;
                this.shed(shown, now);
            }
            if (elapsed >= FALL_MS + BOUNCE_MS) shown.fellAt = undefined;
        }
        if (this.leaves.length > 0) {
            moving = true;
            this.leaves = this.leaves.filter((leaf) => {
                const age = now - leaf.born;
                if (age >= LEAF_MS) {
                    leaf.image.destroy();
                    return false;
                }
                // They slow down as they settle.
                const slowing = 1 - age / LEAF_MS;
                leaf.image
                    .setPosition(leaf.image.x + leaf.vx * seconds * slowing, leaf.image.y + leaf.vy * seconds * slowing)
                    .setRotation(leaf.image.rotation + 10 * seconds)
                    .setAlpha(slowing);
                return true;
            });
        }
        if (moving) {
            this.version++;
            this.scene.markDirty();
        }
    }

    public destroy(): void {
        for (const shown of this.lying.values()) shown.image.destroy();
        this.lying.clear();
        for (const leaf of this.leaves) leaf.image.destroy();
        this.leaves = [];
    }

    private pose(shown: Shown, now: number): void {
        const tilt = shown.fellAt === undefined ? Math.PI / 2 : fallTilt(now - shown.fellAt);
        const { rotation, scaleY } = leaningImage(shown.toward, tilt);
        shown.image.setRotation(rotation).setScale(1, scaleY);
    }

    /** A few leaves torn from the crown as it hits the ground, flying on the way it fell. */
    private shed(shown: Shown, now: number): void {
        if (!this.scene.textures.exists(LEAF_TEXTURE)) {
            const canvas = this.scene.textures.createCanvas(LEAF_TEXTURE, 3, 2);
            const context = canvas?.getContext();
            if (canvas && context) {
                context.fillStyle = "#3d5a22";
                context.fillRect(0, 0, 3, 2);
                canvas.refresh();
            }
        }
        const way = fallVector(shown.toward);
        // Where the crown lands: the height of the image along the way it fell.
        const reach = shown.image.height * 0.7;
        const x = shown.image.x + way.x * reach;
        const y = shown.image.y + way.y * reach;
        for (let index = 0; index < IMPACT_LEAVES; index++) {
            const angle = Math.atan2(way.y, way.x) + (index / IMPACT_LEAVES - 0.5) * 2.4;
            const speed = 40 + (50 * ((index * 7) % 5)) / 5;
            this.leaves.push({
                image: this.scene.add
                    .image(x, y, LEAF_TEXTURE)
                    .setDepth(shown.image.depth + 1)
                    .setScale(1.5),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                born: now,
            });
        }
    }
}
