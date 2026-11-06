import type * as Phaser from "phaser";
import type { GameScene } from "../Game/GameScene";
import { getSwimwearTexture, loadSwimwearAssets } from "./Swimwear";
import type { Swimwear, SwimwearAssets } from "./Swimwear";
import { getSeatedTexture } from "./SeatedPose";

/** A temporary outfit; swimming still owns the bob and water line, and walking keeps its original frames. */
export class SwimwearEffect {
    private sprite: Phaser.GameObjects.Sprite | undefined;
    private assets: SwimwearAssets | undefined;
    private destroyed = false;
    private readonly originalVisibility = new Map<Phaser.GameObjects.Sprite, boolean>();
    private readonly unavailableTextures = new Set<string>();

    constructor(
        private readonly scene: GameScene,
        private readonly container: Phaser.GameObjects.Container,
    ) {
        loadSwimwearAssets()
            .then((assets) => {
                if (this.destroyed) return;
                this.assets = assets;
                this.scene.markDirty();
            })
            .catch((error: unknown) => console.error("Could not prepare swimwear", error));
    }

    public update(
        active: boolean,
        swimming: boolean,
        sprites: Map<string, Phaser.GameObjects.Sprite>,
        style: Swimwear,
        color?: string,
    ): void {
        if (!active) {
            this.sprite?.setVisible(false);
            for (const [sprite, visible] of this.originalVisibility) sprite.setVisible(visible);
            this.originalVisibility.clear();
            return;
        }
        if (!this.assets) return;
        const textureKeys = [...sprites.keys()];
        const cacheKey = JSON.stringify([style, color, textureKeys]);
        if (this.unavailableTextures.has(cacheKey)) {
            this.update(false, swimming, sprites, style);
            return;
        }
        const key = getSwimwearTexture(this.scene, textureKeys, style, this.assets, color);
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
        this.sprite
            .setTexture(texture, first.frame.name)
            .setOrigin(first.originX, first.originY)
            .setPosition(first.x, first.y)
            .setAngle(first.angle)
            .setScale(first.scaleX, first.scaleY)
            .setFlip(first.flipX, first.flipY)
            .setAlpha(first.alpha);
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
        this.destroyed = true;
        this.sprite?.destroy();
        this.originalVisibility.clear();
    }
}
