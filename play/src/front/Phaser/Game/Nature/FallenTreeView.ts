import type * as Phaser from "phaser";
import { TREE_FOOT } from "./FallenTreeTexture";

/** How the ground darkens a tree lying on it: its crown seen against the ground, not against the sky. */
const LYING_TINT = 0xc8c8c8;

/** A tree lying on the ground, as it is drawn: its own image, its foot where it stood, the way the wind blew. */
export interface LyingTree {
    textureKey: string;
    /** Its foot, map pixels. */
    footX: number;
    footY: number;
    /** Where it lies, from its foot (degrees, 0 north, 90 east). */
    toward: number;
    depth: number;
}

/** The angle (radians, clockwise from up, as Phaser turns an image) that lays a standing image the way given. */
export function lyingRotation(toward: number): number {
    return ((Number.isFinite(toward) ? toward : 0) * Math.PI) / 180;
}

/**
 * The trees the wind laid down, drawn lying on the ground: each its own image turned about its foot, its crown the way
 * the wind blew. What stands of them (the stump) is the object of the map itself (FallenTreeTexture.stumpTexture).
 */
export class FallenTreeView {
    private readonly lying = new Map<string, Phaser.GameObjects.Image>();

    constructor(private readonly scene: Phaser.Scene & { markDirty(): void }) {}

    /** Shows the tree `id` lying, or no more (undefined). */
    public show(id: string, tree: LyingTree | undefined): void {
        const image = this.lying.get(id);
        if (!tree) {
            if (image) {
                image.destroy();
                this.lying.delete(id);
                this.scene.markDirty();
            }
            return;
        }
        const shown = image ?? this.scene.add.image(0, 0, tree.textureKey).setTint(LYING_TINT);
        if (shown.texture.key !== tree.textureKey) shown.setTexture(tree.textureKey);
        shown
            .setOrigin(TREE_FOOT.x / Math.max(1, shown.width), TREE_FOOT.y / Math.max(1, shown.height))
            .setPosition(tree.footX, tree.footY)
            .setRotation(lyingRotation(tree.toward))
            .setDepth(tree.depth);
        this.lying.set(id, shown);
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const image of this.lying.values()) image.destroy();
        this.lying.clear();
    }
}
