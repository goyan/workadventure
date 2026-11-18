import type * as Phaser from "phaser";
import type { AquaticLife } from "./AquaticLife";
import { ensureAquaticTexture } from "./AquaticSprites";

/** Just above the relief and its water (TERRAIN_DEPTH in TerrainView), under the objects and the avatars. */
const AQUATIC_DEPTH = 0.66;
/** Seen through the water. */
const AQUATIC_ALPHA = 0.7;

/**
 * Draws the animals of the water of the relief: an image each, where AquaticLife says, turned towards where it
 * goes. Nothing is drawn while the player hides them.
 */
export class AquaticLifeView {
    private readonly images = new Map<number, Phaser.GameObjects.Image>();

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly life: AquaticLife,
        private readonly isShown: () => boolean,
        private readonly reducedMotion: () => boolean,
    ) {}

    public update(now: number): void {
        if (!this.isShown()) {
            if (this.images.size > 0) {
                this.clear();
                this.scene.markDirty();
            }
            return;
        }
        if (this.life.isEmpty() && this.images.size === 0) return;
        const seen = new Set<number>();
        for (const animal of this.life.shown(now, this.reducedMotion())) {
            seen.add(animal.id);
            let image = this.images.get(animal.id);
            if (!image) {
                image = this.scene.add.image(animal.x, animal.y, ensureAquaticTexture(this.scene, animal.kind));
                image.setDepth(AQUATIC_DEPTH);
                this.images.set(animal.id, image);
            }
            image.setPosition(Math.round(animal.x), Math.round(animal.y));
            image.setAlpha(animal.alpha * AQUATIC_ALPHA);
            image.setFlipX(animal.facingLeft);
        }
        for (const [id, image] of this.images) {
            if (seen.has(id)) continue;
            image.destroy();
            this.images.delete(id);
        }
        // They swim: the scene is drawn again while there are some.
        this.scene.markDirty();
    }

    public destroy(): void {
        this.clear();
    }

    private clear(): void {
        for (const image of this.images.values()) image.destroy();
        this.images.clear();
    }
}
