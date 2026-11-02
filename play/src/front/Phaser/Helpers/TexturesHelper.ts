import * as Phaser from "phaser";
import { asError } from "catch-unknown";
import type { EntityAnimation } from "@workadventure/map-editor";

import Sprite = Phaser.GameObjects.Sprite;

export class TexturesHelper {
    public static async getSnapshot(
        scene: Phaser.Scene,
        ...sprites: { sprite: Sprite; frame?: string | number }[]
    ): Promise<string> {
        if (!scene.game.renderer) {
            // In headless mode, we cannot take snapshots.
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            // TODO: send a correct PNG????
            return "";
        }
        const rt = scene.make.renderTexture({}, false);
        try {
            for (const { sprite, frame } of sprites) {
                if (frame) {
                    sprite.setFrame(frame);
                }
                rt.draw(sprite, sprite.displayWidth * 0.5, sprite.displayHeight * 0.5);
            }
            rt.render();
            return new Promise<string>((resolve, reject) => {
                try {
                    rt.snapshot(
                        (url) => {
                            if (url instanceof HTMLImageElement) {
                                resolve(url.src);
                            } else {
                                console.error("Unexpected color object received for snapshot", url);
                                resolve("");
                            }
                            rt.destroy();
                        },
                        "image/png",
                        1,
                    );
                } catch (error) {
                    rt.destroy();
                    reject(asError(error));
                }
            });
        } catch (error) {
            rt.destroy();
            throw new Error("Could not get the snapshot", { cause: error });
        }
    }

    public static createRectangleTexture(
        scene: Phaser.Scene,
        textureKey: string,
        width: number,
        height: number,
        color: number,
    ): void {
        const rectangleTexture = scene.add.graphics().fillStyle(color, 1).fillRect(0, 0, width, height);
        rectangleTexture.generateTexture(textureKey, width, height);
        rectangleTexture.destroy();
    }

    public static createCircleTexture(
        scene: Phaser.Scene,
        textureKey: string,
        radius: number,
        color: number,
        outlineColor?: number,
        outlineThickness?: number,
    ): void {
        const circleTexture = scene.add.graphics().fillStyle(color, 1).fillCircle(radius, radius, radius);
        if (outlineColor) {
            circleTexture.lineStyle(outlineThickness ?? 1, outlineColor).strokeCircle(radius, radius, radius);
        }
        circleTexture.generateTexture(textureKey, radius * 2, radius * 2);
        circleTexture.destroy();
    }

    public static async loadEntityImage(
        scene: Phaser.Scene,
        key: string,
        url: string,
        animation?: EntityAnimation,
    ): Promise<void> {
        await new Promise<void>((resolve) => {
            if (scene.textures.exists(key)) {
                resolve();
                return;
            }
            scene.load.once(`filecomplete-image-${key}`, () => {
                resolve();
            });
            scene.load.image(key, url);
            scene.load.start();
        });
        if (animation) {
            TexturesHelper.addEntityAnimation(scene, key, animation);
        }
    }

    /**
     * Cuts the loaded strip of an animated entity into its frames and creates its looping animation. Once cut, a
     * texture shown without a frame (editor previews, selection) shows its first frame instead of the whole strip.
     *
     * @returns the key of the animation, or undefined when the texture is not loaded or too narrow for its frames.
     */
    public static addEntityAnimation(scene: Phaser.Scene, key: string, animation: EntityAnimation): string | undefined {
        if (!scene.textures.exists(key)) {
            return undefined;
        }
        const texture = scene.textures.get(key);
        const source = texture.getSourceImage();
        const frameWidth = Math.floor(source.width / animation.frameCount);
        if (frameWidth < 1) {
            return undefined;
        }
        if (!texture.has("0")) {
            for (let index = 0; index < animation.frameCount; index++) {
                texture.add(index, 0, index * frameWidth, 0, frameWidth, source.height);
            }
        }
        const animationKey = `entity-animation:${key}`;
        if (!scene.anims.exists(animationKey)) {
            scene.anims.create({
                key: animationKey,
                frames: Array.from({ length: animation.frameCount }, (_, index) => ({ key, frame: index })),
                frameRate: animation.frameRate,
                repeat: -1,
            });
        }
        return animationKey;
    }
}
