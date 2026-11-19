import type * as Phaser from "phaser";
import { DEPTH_OVERLAY_INDEX } from "../DepthIndexes";
import type { AquaticLife } from "./AquaticLife";
import { ensureGullTexture, GULL_FLAP_MS } from "./GullSprites";

/** The gulls are the sixth species of the messages: kinds 10 (male) and 11 (female). */
export const isGullKind = (kind: number): boolean => kind >> 1 === 5;
/** A flying gull is drawn this many pixels above the place the server tells: over its shadow. */
export const GULL_ALTITUDE_PX = 28;
/** Above the map and what stands on it, under the night and the interface. */
export const GULL_FLIGHT_DEPTH = DEPTH_OVERLAY_INDEX - 10;
/** The state the server tells for a landed gull. */
const LANDED = 2;
/** An animal this close to the screen counts as on it. */
const MARGIN_PX = 64;
const SHADOW_COLOUR = 0x0f172a;
const SHADOW_ALPHA = 0.25;

interface Shown {
    sprite: Phaser.GameObjects.Sprite;
    shadow: Phaser.GameObjects.Ellipse;
    key: string;
}

type SceneOfView = Pick<Phaser.Scene, "add" | "cameras" | "textures"> & { markDirty(): void };

/**
 * Draws the gulls the server runs: in flight, above everything and raised over a small shadow that stays on the
 * ground where the server has the bird, wings beating; landed, on the ground among the avatars. Nothing is drawn
 * while the player hides the life of the water (the gulls come with it).
 */
export class GullLifeView {
    private readonly shown = new Map<number, Shown>();

    constructor(
        private readonly scene: SceneOfView,
        private readonly life: AquaticLife,
        private readonly isShown: () => boolean,
        private readonly reducedMotion: () => boolean,
    ) {}

    public update(now: number): void {
        if (!this.isShown()) {
            if (this.shown.size > 0) {
                this.clear();
                this.scene.markDirty();
            }
            return;
        }
        if (this.life.isEmpty() && this.shown.size === 0) return;
        const reduced = this.reducedMotion();
        const view = this.scene.cameras.main.worldView;
        const onScreen = (x: number, y: number): boolean =>
            x >= view.x - MARGIN_PX &&
            x <= view.x + view.width + MARGIN_PX &&
            y >= view.y - MARGIN_PX &&
            y <= view.y + view.height + MARGIN_PX;
        const seen = new Set<number>();
        let changed = false;
        for (const gull of this.life.shown(now, reduced)) {
            seen.add(gull.id);
            const landed = gull.state === LANDED;
            const x = Math.round(gull.x);
            const ground = Math.round(gull.y);
            const y = landed ? ground : ground - GULL_ALTITUDE_PX;
            const pose = landed ? "landed" : reduced || Math.floor(now / GULL_FLAP_MS) % 2 === 0 ? "up" : "down";
            const key = ensureGullTexture(this.scene, pose);
            let entry = this.shown.get(gull.id);
            if (!entry) {
                entry = {
                    sprite: this.scene.add.sprite(x, y, key).setOrigin(0.5, landed ? 1 : 0.5),
                    shadow: this.scene.add.ellipse(x, ground, 14, 6, SHADOW_COLOUR, SHADOW_ALPHA),
                    key,
                };
                this.shown.set(gull.id, entry);
                changed ||= onScreen(x, y);
            }
            const { sprite, shadow } = entry;
            if (entry.key !== key) {
                sprite.setTexture(key);
                sprite.setOrigin(0.5, landed ? 1 : 0.5);
                entry.key = key;
                changed ||= onScreen(x, y);
            }
            if (sprite.x !== x || sprite.y !== y || sprite.alpha !== gull.alpha) {
                changed ||= onScreen(x, y) || onScreen(sprite.x, sprite.y);
            }
            sprite.setPosition(x, y);
            sprite.setDepth(landed ? ground : GULL_FLIGHT_DEPTH);
            sprite.setAlpha(gull.alpha);
            sprite.setFlipX(gull.facingLeft);
            shadow.setPosition(x, ground);
            shadow.setDepth(ground - 1);
            shadow.setAlpha(gull.alpha);
            shadow.setVisible(!landed);
        }
        for (const [id, entry] of this.shown) {
            if (seen.has(id)) continue;
            changed ||= onScreen(entry.sprite.x, entry.sprite.y);
            entry.sprite.destroy();
            entry.shadow.destroy();
            this.shown.delete(id);
        }
        if (changed) this.scene.markDirty();
    }

    public destroy(): void {
        this.clear();
    }

    private clear(): void {
        for (const entry of this.shown.values()) {
            entry.sprite.destroy();
            entry.shadow.destroy();
        }
        this.shown.clear();
    }
}
