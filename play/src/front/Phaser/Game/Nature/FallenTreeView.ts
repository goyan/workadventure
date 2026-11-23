import type * as Phaser from "phaser";
import { fallVector, lyingVector } from "./FallenTreeShape";
import { fallingTreeTexture, lyingTreeTexture, treeBody, treeFoot } from "./FallenTreeTexture";

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
    /** The top left corner of its image on the map: its foot is read in its image (treeFoot). */
    x: number;
    y: number;
    /** Where it lies, from its foot (degrees, 0 north, 90 east). */
    toward: number;
    depth: number;
    /** When it was laid down before the eyes of this player (time of the scene): it is seen falling; else lying. */
    fellAt?: number;
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
 * (its height drawn up the screen): its axis goes from its foot to (0, -cos tilt) + its lying length on the screen
 * (lyingVector) × sin tilt, so the image is turned along that axis and shortened to its length.
 */
export function leaningImage(toward: number, tilt: number): { rotation: number; scaleY: number } {
    const way = lyingVector(toward);
    const lean = Math.sin(tilt);
    const axis = { x: way.x * lean, y: -Math.cos(tilt) + way.y * lean };
    const length = Math.hypot(axis.x, axis.y);
    if (length < 1e-6) {
        const flat = fallVector(toward);
        return { rotation: Math.atan2(flat.x, -flat.y), scaleY: 0.02 };
    }
    return { rotation: Math.atan2(axis.x, -axis.y), scaleY: Math.max(0.02, length) };
}

/** How much of the tree lying shows against the tree falling, `elapsed` ms after it began to fall: it takes over during the bounce. */
export function lyingShare(elapsed: number): number {
    if (!Number.isFinite(elapsed)) return 1;
    return Math.min(1, Math.max(0, (elapsed - FALL_MS) / BOUNCE_MS));
}

/**
 * How much of the tree lying shows while a tree falling towards the player leans past the point where its standing
 * image, shortened to nothing, would turn upside down: it takes over from there, never the image upside down.
 */
export function turnedShare(toward: number, tilt: number): number {
    const way = lyingVector(toward);
    if (way.y <= 0) return 0;
    const up = -Math.cos(tilt) + way.y * Math.sin(tilt);
    return Math.min(1, Math.max(0, (up + 0.15) / 0.3));
}

interface Shown {
    /** The tree lying (lyingTreeTexture), its foot at its middle. */
    lying: Phaser.GameObjects.Image | undefined;
    /** While it falls: its standing image turned on its foot. */
    falling: Phaser.GameObjects.Image | undefined;
    toward: number;
    fellAt: number | undefined;
    shed: boolean;
    footX: number;
    footY: number;
    /** From its foot to its top, pixels of its image. */
    height: number;
}

interface Leaf {
    image: Phaser.GameObjects.Image;
    vx: number;
    vy: number;
    born: number;
}

/**
 * The trees the wind laid down, drawn lying on the ground (lyingTreeTexture: the plate of roots at the foot, the trunk,
 * the crown pressed flat); one laid down before the eyes of this player is seen falling first, its standing image
 * turned on its foot, a bounce and a few leaves shed at the end, the tree lying taking over during the bounce. The
 * object of the map itself shows nothing meanwhile (uprootedTexture). Drawn only: the server keeps the trees lying.
 */
export class FallenTreeView {
    private readonly shown = new Map<string, Shown>();
    private leaves: Leaf[] = [];
    private updatedAt: number | undefined;
    /** Changes whenever a tree laid down takes another pose: the shadows are drawn again then. */
    public version = 0;

    constructor(private readonly scene: Phaser.Scene & { markDirty(): void }) {}

    /** Shows the tree `id` lying (falling first if it just fell), or no more (undefined). */
    public show(id: string, tree: LyingTree | undefined): void {
        const shown = this.shown.get(id);
        this.version++;
        if (!tree) {
            if (shown) {
                shown.lying?.destroy();
                shown.falling?.destroy();
                this.shown.delete(id);
                this.scene.markDirty();
            }
            return;
        }
        const foot = treeFoot(this.scene, tree.textureKey);
        const footX = tree.x + foot.x;
        const footY = tree.y + foot.y;
        const body = treeBody(this.scene, tree.textureKey);
        const fellAt = shown?.fellAt ?? tree.fellAt;
        const lyingKey = lyingTreeTexture(this.scene, tree.textureKey, tree.toward);
        const lying = this.placed(shown?.lying, lyingKey, footX, footY, tree.depth);
        lying?.setOrigin(0.5, 0.5);
        const fallingKey = fellAt !== undefined ? fallingTreeTexture(this.scene, tree.textureKey) : undefined;
        const falling = this.placed(shown?.falling, fallingKey, footX, footY, tree.depth);
        if (falling && falling.width > 0 && falling.height > 0) {
            falling.setOrigin(foot.x / falling.width, foot.y / falling.height);
        }
        const next: Shown = {
            lying,
            falling,
            toward: tree.toward,
            fellAt,
            shed: shown?.shed ?? false,
            footX,
            footY,
            height: body ? body.footY - body.crownTop : foot.y,
        };
        this.shown.set(id, next);
        this.pose(next, this.scene.time.now);
        this.scene.markDirty();
    }

    /** How far the tree `id` leans from upright now (radians): pi / 2 lying; undefined for a tree not lying. */
    public tiltOf(id: string): number | undefined {
        const shown = this.shown.get(id);
        if (!shown) return undefined;
        return shown.fellAt === undefined ? Math.PI / 2 : fallTilt(this.scene.time.now - shown.fellAt);
    }

    /** At each image: the trees falling move on, the leaves they shed fly and fade. */
    public update(now: number): void {
        const seconds = this.updatedAt === undefined ? 0 : Math.min(0.1, Math.max(0, (now - this.updatedAt) / 1000));
        this.updatedAt = now;
        let moving = false;
        for (const shown of this.shown.values()) {
            if (shown.fellAt === undefined) continue;
            moving = true;
            const elapsed = now - shown.fellAt;
            if (!shown.shed && elapsed >= FALL_MS) {
                shown.shed = true;
                this.shed(shown, now);
            }
            if (elapsed >= FALL_MS + BOUNCE_MS) {
                shown.fellAt = undefined;
                shown.falling?.destroy();
                shown.falling = undefined;
            }
            this.pose(shown, now);
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
        for (const shown of this.shown.values()) {
            shown.lying?.destroy();
            shown.falling?.destroy();
        }
        this.shown.clear();
        for (const leaf of this.leaves) leaf.image.destroy();
        this.leaves = [];
    }

    /** An image of the view at the foot of a tree, made or kept; none without a texture. */
    private placed(
        image: Phaser.GameObjects.Image | undefined,
        key: string | undefined,
        x: number,
        y: number,
        depth: number,
    ): Phaser.GameObjects.Image | undefined {
        if (!key) {
            image?.destroy();
            return undefined;
        }
        const made = image ?? this.scene.add.image(0, 0, key).setTint(LYING_TINT);
        if (made.texture.key !== key) made.setTexture(key);
        return made.setPosition(x, y).setDepth(depth);
    }

    private pose(shown: Shown, now: number): void {
        if (shown.fellAt === undefined) {
            shown.lying?.setAlpha(1);
            return;
        }
        const elapsed = now - shown.fellAt;
        const tilt = fallTilt(elapsed);
        const { rotation, scaleY } = leaningImage(shown.toward, tilt);
        const share = Math.max(lyingShare(elapsed), turnedShare(shown.toward, tilt));
        shown.falling
            ?.setRotation(rotation)
            .setScale(1, scaleY)
            .setAlpha(1 - share);
        shown.lying?.setAlpha(share);
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
        // Where the crown lands: most of the height of the tree along the ground, as the tree lying is drawn.
        const way = lyingVector(shown.toward);
        const x = shown.footX + way.x * shown.height * 0.75;
        const y = shown.footY + way.y * shown.height * 0.75;
        const flat = fallVector(shown.toward);
        const depth = (shown.lying ?? shown.falling)?.depth ?? 0;
        for (let index = 0; index < IMPACT_LEAVES; index++) {
            const angle = Math.atan2(flat.y, flat.x) + (index / IMPACT_LEAVES - 0.5) * 2.4;
            const speed = 40 + (50 * ((index * 7) % 5)) / 5;
            this.leaves.push({
                image: this.scene.add
                    .image(x, y, LEAF_TEXTURE)
                    .setDepth(depth + 1)
                    .setScale(1.5),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                born: now,
            });
        }
    }
}
