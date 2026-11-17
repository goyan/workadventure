import * as Sentry from "@sentry/svelte";
import type * as Phaser from "phaser";
import type { SkyLight } from "../Night/SkyLight";
import { SHADOW_COLOR, shadowAlpha } from "./SkyShadowFrame";
import { fallenShadowPose, ovalShadowPose } from "./SkyMovingShadowPose";
import { drawableSource } from "./SkyShadowPicture";
import type { ShadowShape } from "./SkyShadowPicture";

/**
 * Depth of the shadows of what walks: on the ground, just over the shadows of what stands (SkyShadowLayer, 0.7) and
 * the light of the windows (0.71), under everything sorted by its y.
 */
const SKY_MOVING_SHADOW_DEPTH = 0.72;
/** Under this light no shadow is shown. */
const NO_LIGHT = 0.005;
const OVAL_TEXTURE = "sky-oval-shadow";
const OVAL_SIZE = 32;

/**
 * Something that walks, as its shadow needs it: its feet and the size of its body (map pixels), and the sprites it is
 * drawn with, one over the other, shown `scale` times their frame.
 */
export interface MovingShadowSource {
    id: string | number;
    x: number;
    y: number;
    width: number;
    height: number;
    sprites: readonly Phaser.GameObjects.Sprite[];
    scale?: number;
}

export interface SkyMovingShadowsOptions {
    /** The light of the sky (NightManager.skyLight). */
    light: () => SkyLight | undefined;
    /** The avatars that may throw a shadow now (not the hidden ones, nor the ones swimming or on a raised floor). */
    avatars: () => Iterable<MovingShadowSource>;
    /** The animals that walk around and are shown. */
    animals: () => Iterable<MovingShadowSource>;
    /** Whether a point of the map is outdoors: the sky throws no shadow in a room. Everywhere without a grid. */
    isOutdoorAt: (x: number, y: number) => boolean;
    /** Which of them throw a shadow, and of which shape, for this person. */
    categories: () => { avatars: boolean; animals: boolean; avatarShape: ShadowShape; animalShape: ShadowShape };
    /** False in the map editor. */
    enabled: () => boolean;
}

interface AvatarShadow {
    image: Phaser.GameObjects.Image;
    texture: Phaser.Textures.CanvasTexture;
    /** What the silhouette was drawn from: drawn again only when a sprite changes its frame. */
    frames: string;
    /** False when none of its sprites could be read: an oval stands for it. */
    drawable: boolean;
    state: string;
}

interface OvalShadow {
    image: Phaser.GameObjects.Image;
    state: string;
}

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/**
 * The shadows of the sun and of the moon under what walks, outdoors: the true silhouette of each avatar, laid on the
 * ground away from the light, and an oval under each animal. One small image each, that follows its owner: nothing of
 * the map is drawn again. The silhouette of an avatar is drawn again only when one of its sprites changes its frame.
 */
export class SkyMovingShadows {
    private readonly avatars = new Map<string, AvatarShadow>();
    private readonly ovals = new Map<string, OvalShadow>();
    private generation = 0;
    private broken = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: SkyMovingShadowsOptions,
    ) {}

    /**
     * At every image. A failure while drawing must never escape: it would stop the loop of the game (a blue page, as
     * with PR #257). It is reported once, and these shadows stay off for the scene.
     */
    public update(): void {
        if (this.broken) return;
        try {
            this.refresh();
        } catch (error) {
            this.broken = true;
            Sentry.captureException(error);
            this.clear();
        }
    }

    public destroy(): void {
        this.clear();
    }

    private refresh(): void {
        const light = this.options.light();
        if (!this.options.enabled() || !light || light.intensity < NO_LIGHT) {
            this.clear();
            return;
        }
        const categories = this.options.categories();
        const alpha = shadowAlpha(light);
        let changed = false;

        const seenAvatars = new Set<string>();
        const seenOvals = new Set<string>();
        const kinds: [string, boolean, ShadowShape, () => Iterable<MovingShadowSource>][] = [
            ["avatar", categories.avatars, categories.avatarShape, this.options.avatars],
            ["animal", categories.animals, categories.animalShape, this.options.animals],
        ];
        for (const [kind, shown, shape, sources] of kinds) {
            if (!shown) continue;
            for (const source of sources()) {
                if (!this.options.isOutdoorAt(source.x, source.y)) continue;
                const id = `${kind}:${source.id}`;
                // Its true silhouette, when asked for and when its sprites can be read; an oval otherwise.
                const shadow =
                    shape === "realistic" && source.sprites.length > 0 ? this.avatarShadow(id, source) : undefined;
                if (!shadow?.drawable) {
                    seenOvals.add(id);
                    changed = this.placeOval(id, source, light, alpha) || changed;
                    continue;
                }
                seenAvatars.add(id);
                const scale = source.scale ?? 1;
                const pose = fallenShadowPose(shadow.texture.height * scale, light);
                if (!pose) continue;
                const state = `${source.x},${source.y},${pose.rotation},${pose.stretch},${scale},${alpha},${shadow.frames}`;
                if (state !== shadow.state) {
                    shadow.state = state;
                    shadow.image
                        .setPosition(source.x, source.y)
                        .setRotation(pose.rotation)
                        .setScale(scale, scale * pose.stretch)
                        .setAlpha(alpha)
                        .setVisible(true);
                    changed = true;
                }
            }
        }

        for (const [id, shadow] of this.avatars) {
            if (seenAvatars.has(id)) continue;
            // Kept while its owner is on the map (it may come back outdoors); destroyed with the scene.
            if (shadow.image.visible) {
                shadow.image.setVisible(false);
                shadow.state = "";
                changed = true;
            }
        }
        for (const [id, shadow] of this.ovals) {
            if (seenOvals.has(id)) continue;
            shadow.image.destroy();
            this.ovals.delete(id);
            changed = true;
        }
        // The game only renders dirty scenes.
        if (changed) this.scene.markDirty();
    }

    /** The shadow of an avatar or of an animal, its silhouette drawn again when one of its sprites changed its frame. */
    private avatarShadow(id: string, avatar: MovingShadowSource): AvatarShadow {
        const frames = avatar.sprites
            .map(
                (sprite) =>
                    `${sprite.texture.key}:${sprite.frame.name}:${sprite.flipX ? 1 : 0}:${sprite.visible ? 1 : 0}`,
            )
            .join("|");
        let shadow = this.avatars.get(id);
        const first = avatar.sprites[0].frame;
        const width = Math.max(1, first.cutWidth);
        const height = Math.max(1, first.cutHeight);
        if (shadow && (shadow.texture.width !== width || shadow.texture.height !== height)) {
            this.destroyAvatar(shadow);
            this.avatars.delete(id);
            shadow = undefined;
        }
        if (!shadow) {
            const key = `sky-avatar-shadow:${this.generation++}`;
            const texture = this.scene.textures.createCanvas(key, width, height);
            if (!texture) throw new Error("no canvas for the shadow of an avatar");
            const image = this.scene.add
                .image(0, 0, key)
                .setOrigin(0.5, 1)
                .setDepth(SKY_MOVING_SHADOW_DEPTH)
                .setVisible(false);
            shadow = { image, texture, frames: "", drawable: false, state: "" };
            this.avatars.set(id, shadow);
        }
        if (frames !== shadow.frames) {
            shadow.frames = frames;
            shadow.drawable = this.drawSilhouette(shadow.texture, avatar.sprites);
            if (!shadow.drawable && shadow.image.visible) shadow.image.setVisible(false);
        }
        return shadow;
    }

    /** The sprites of an avatar, one over the other, filled with the colour of the shadows. False when none is readable. */
    private drawSilhouette(
        texture: Phaser.Textures.CanvasTexture,
        sprites: readonly Phaser.GameObjects.Sprite[],
    ): boolean {
        const context = texture.getContext();
        const { width, height } = texture;
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, width, height);
        let drawn = false;
        for (const sprite of sprites) {
            if (!sprite.visible) continue;
            const frame = sprite.frame;
            const source = drawableSource(frame.source.image);
            if (!source || frame.cutWidth <= 0 || frame.cutHeight <= 0) continue;
            context.save();
            if (sprite.flipX) {
                context.translate(width, 0);
                context.scale(-1, 1);
            }
            context.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, width, height);
            context.restore();
            drawn = true;
        }
        // Only where something was drawn: the silhouette, in one colour.
        context.globalCompositeOperation = "source-in";
        context.fillStyle = cssColor(SHADOW_COLOR);
        context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = "source-over";
        texture.refresh();
        return drawn;
    }

    /** Puts the oval shadow of a body where it belongs; true when it moved or changed. */
    private placeOval(
        id: string,
        body: { x: number; y: number; width: number; height: number },
        light: SkyLight,
        alpha: number,
    ): boolean {
        const pose = ovalShadowPose(body, light);
        let shadow = this.ovals.get(id);
        if (!pose) {
            if (!shadow) return false;
            shadow.image.destroy();
            this.ovals.delete(id);
            return true;
        }
        if (!shadow) {
            this.ensureOvalTexture();
            const image = this.scene.add.image(0, 0, OVAL_TEXTURE).setDepth(SKY_MOVING_SHADOW_DEPTH);
            shadow = { image, state: "" };
            this.ovals.set(id, shadow);
        }
        const state = `${pose.x},${pose.y},${pose.rotation},${pose.length},${pose.width},${alpha}`;
        if (state === shadow.state) return false;
        shadow.state = state;
        shadow.image
            .setPosition(pose.x, pose.y)
            .setRotation(pose.rotation)
            .setDisplaySize(pose.width, pose.length)
            .setAlpha(alpha);
        return true;
    }

    private ensureOvalTexture(): void {
        if (this.scene.textures.exists(OVAL_TEXTURE)) return;
        const texture = this.scene.textures.createCanvas(OVAL_TEXTURE, OVAL_SIZE, OVAL_SIZE);
        if (!texture) throw new Error("no canvas for the oval shadows");
        const context = texture.getContext();
        context.fillStyle = cssColor(SHADOW_COLOR);
        context.beginPath();
        context.ellipse(OVAL_SIZE / 2, OVAL_SIZE / 2, OVAL_SIZE / 2, OVAL_SIZE / 2, 0, 0, 2 * Math.PI);
        context.fill();
        texture.refresh();
    }

    private destroyAvatar(shadow: AvatarShadow): void {
        shadow.image.destroy();
        shadow.texture.destroy();
    }

    private clear(): void {
        if (this.avatars.size === 0 && this.ovals.size === 0) return;
        for (const shadow of this.avatars.values()) this.destroyAvatar(shadow);
        this.avatars.clear();
        for (const shadow of this.ovals.values()) shadow.image.destroy();
        this.ovals.clear();
        this.scene.markDirty();
    }
}
