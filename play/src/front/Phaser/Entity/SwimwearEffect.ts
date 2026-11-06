import type * as Phaser from "phaser";
import { getSwimwearTexture } from "./Swimwear";
import type { Swimwear } from "./Swimwear";
import { getSeatedTexture } from "./SeatedPose";

/** A temporary outfit; swimming still owns the bob and water line, and walking keeps its original frames. */
export class SwimwearEffect {
    private sprite: Phaser.GameObjects.Sprite | undefined;
    private readonly originalVisibility = new Map<Phaser.GameObjects.Sprite, boolean>();
    private readonly unavailableTextures = new Set<string>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
    ) {}

    public update(
        active: boolean,
        swimming: boolean,
        sprites: Map<string, Phaser.GameObjects.Sprite>,
        style: Swimwear,
    ): void {
        if (!active) {
            this.sprite?.setVisible(false);
            for (const [sprite, visible] of this.originalVisibility) sprite.setVisible(visible);
            this.originalVisibility.clear();
            return;
        }
        const textureKeys = [...sprites.keys()];
        const cacheKey = JSON.stringify([style, textureKeys]);
        if (this.unavailableTextures.has(cacheKey)) {
            this.update(false, swimming, sprites, style);
            return;
        }
        const key = getSwimwearTexture(this.scene, textureKeys, style);
        if (!key) {
            this.unavailableTextures.add(cacheKey);
            this.update(false, swimming, sprites, style);
            return;
        }
        const first = sprites.values().next().value;
        if (!first) return;
        if (!this.sprite) {
            this.sprite = this.scene.add.sprite(0, 0, key);
            this.container.addAt(this.sprite, sprites.size);
        }
        const texture = first.texture.key.endsWith("-seated-pose") ? getSeatedTexture(this.scene, key) : key;
        this.sprite.setTexture(texture, first.frame.name).setPosition(first.x, first.y).setAngle(first.angle);
        if (swimming) this.sprite.setCrop(0, 0, 32, 20);
        else this.sprite.setCrop();
        this.sprite.setVisible(
            [...sprites.values()].some((sprite) => this.originalVisibility.get(sprite) ?? sprite.visible),
        );
        for (const sprite of sprites.values()) {
            if (!this.originalVisibility.has(sprite)) this.originalVisibility.set(sprite, sprite.visible);
            sprite.setVisible(false);
        }
    }

    public destroy(): void {
        this.sprite?.destroy();
        this.originalVisibility.clear();
    }
}
