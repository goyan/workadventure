import type * as Phaser from "phaser";
import { distinguishable } from "../Weather/ScreenScale";
import { isAquaticKind } from "./AquaticLife";
import type { AquaticLife } from "./AquaticLife";
import { ensureAquaticTexture } from "./AquaticSprites";

/** Just above the relief and its water (TERRAIN_DEPTH in TerrainView), under the objects and the avatars. */
export const AQUATIC_DEPTH = 0.66;
/** An animal this close to the screen counts as on it: its image is wider than its point. */
const MARGIN_PX = 32;
/** Seen through the water. */
const AQUATIC_ALPHA = 0.7;

/**
 * Draws the animals of the water of the relief: an image each, where AquaticLife says, turned towards where it
 * goes. Nothing is drawn while the player hides them.
 */
/** About how long a fish and a dolphin are, in map pixels: under one screen pixel they are not drawn. */
const FISH_PX = 8;
const DOLPHIN_PX = 24;

export class AquaticLifeView {
    private readonly images = new Map<number, Phaser.GameObjects.Image>();

    constructor(
        private readonly scene: Pick<Phaser.Scene, "add" | "cameras" | "textures"> & { markDirty(): void },
        private readonly life: AquaticLife,
        private readonly isShown: () => boolean,
        private readonly reducedMotion: () => boolean,
        /** How much lower the surface of the water is drawn at a point: a lake at the bottom of a hollow, in 3/4. */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
        /** Whether a point of the water is hidden by the south rim of its hollow (3/4): its animals are not drawn. */
        private readonly hiddenAt: (x: number, y: number) => boolean = () => false,
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
        const view = this.scene.cameras.main.worldView;
        const onScreen = (x: number, y: number): boolean =>
            x >= view.x - MARGIN_PX &&
            x <= view.x + view.width + MARGIN_PX &&
            y >= view.y - MARGIN_PX &&
            y <= view.y + view.height + MARGIN_PX;
        // The scene is drawn again only when something the player can see changed.
        let changed = false;
        for (const animal of this.life.shown(now, this.reducedMotion())) {
            if (!isAquaticKind(animal.kind)) continue;
            // A bright fish on dark water is told apart down to a single pixel: not drawn under it only.
            if (!distinguishable(this.scene, animal.kind >> 1 === 1 ? DOLPHIN_PX : FISH_PX, 1)) continue;
            seen.add(animal.id);
            const x = Math.round(animal.x);
            const y = Math.round(animal.y + this.dropAt(animal.x, animal.y));
            const alpha = animal.alpha * AQUATIC_ALPHA;
            let image = this.images.get(animal.id);
            if (!image) {
                image = this.scene.add.image(x, y, ensureAquaticTexture(this.scene, animal.kind));
                image.setDepth(AQUATIC_DEPTH);
                this.images.set(animal.id, image);
                changed ||= onScreen(x, y);
            } else if (image.x !== x || image.y !== y || image.alpha !== alpha || image.flipX !== animal.facingLeft) {
                changed ||= onScreen(x, y) || onScreen(image.x, image.y);
            }
            image.setPosition(x, y);
            image.setVisible(!this.hiddenAt(animal.x, animal.y));
            image.setAlpha(alpha);
            image.setFlipX(animal.facingLeft);
        }
        for (const [id, image] of this.images) {
            if (seen.has(id)) continue;
            changed ||= onScreen(image.x, image.y);
            image.destroy();
            this.images.delete(id);
        }
        if (changed) this.scene.markDirty();
    }

    public destroy(): void {
        this.clear();
    }

    private clear(): void {
        for (const image of this.images.values()) image.destroy();
        this.images.clear();
    }
}
