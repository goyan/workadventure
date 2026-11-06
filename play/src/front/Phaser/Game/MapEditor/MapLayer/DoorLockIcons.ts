import type * as Phaser from "phaser";
import { DEPTH_DOOR_LOCK_INDEX } from "../../DepthIndexes";

const TEXTURE_KEY = "infogene-door-lock-v2";
/** The padlock is drawn larger, then shown at this fraction: it stays sharp when the camera zooms in. */
const TEXTURE_SCALE = 3;
const WIDTH = 20;
const HEIGHT = 23;
/** Top of the body: the shackle stands above it. */
const BODY_TOP = 8;
const RED = 0xdc3545;
const LIGHT_RED = 0xef5b67;
const DARK_RED = 0x8c1c26;
const FADE_MS = 200;

/** Draws the padlock once per scene, in code: no image file. */
function createTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) {
        return;
    }
    const s = TEXTURE_SCALE;
    const graphics = scene.add.graphics();
    // Shackle: a thick dark red arch, its feet hidden by the body.
    graphics.lineStyle(3 * s, DARK_RED, 1).strokeRoundedRect(5 * s, 1.5 * s, 10 * s, 13 * s, 5 * s);
    // Body: a rounded red block with a dark outline and a lighter top edge.
    graphics.fillStyle(DARK_RED, 1).fillRoundedRect(0, BODY_TOP * s, WIDTH * s, (HEIGHT - BODY_TOP) * s, 3 * s);
    graphics
        .fillStyle(RED, 1)
        .fillRoundedRect(1 * s, (BODY_TOP + 1) * s, (WIDTH - 2) * s, (HEIGHT - BODY_TOP - 2) * s, 2.5 * s);
    graphics.fillStyle(LIGHT_RED, 1).fillRect(3 * s, (BODY_TOP + 1) * s, (WIDTH - 6) * s, 1.5 * s);
    // Keyhole: a vertical dark slot in the middle of the body.
    graphics.fillStyle(DARK_RED, 1).fillRoundedRect(9 * s, 12.5 * s, 2 * s, 6 * s, 1 * s);
    graphics.generateTexture(TEXTURE_KEY, WIDTH * s, HEIGHT * s);
    graphics.destroy();
}

/**
 * Red padlocks on the doors of the locked areas, for everyone, occupants included. The lock state is already shared by
 * the area variables: each client draws the padlocks from what it knows, nothing is sent.
 */
export class DoorLockIcons {
    private readonly icons = new Map<string, Phaser.GameObjects.Image>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly markDirty: () => void,
    ) {}

    /** Shows a padlock on each marker (door key -> middle of the door), and fades out those of the doors left. */
    public update(markers: ReadonlyMap<string, { x: number; y: number }>): void {
        for (const [key, icon] of this.icons) {
            if (!markers.has(key)) {
                this.icons.delete(key);
                this.fade(icon, 0, () => icon.destroy());
            }
        }
        for (const [key, { x, y }] of markers) {
            const icon = this.icons.get(key);
            if (icon) {
                if (icon.x !== x || icon.y !== y) {
                    icon.setPosition(x, y);
                    this.markDirty();
                }
                continue;
            }
            createTexture(this.scene);
            const created = this.scene.add
                .image(x, y, TEXTURE_KEY)
                .setScale(1 / TEXTURE_SCALE)
                // The body, not the whole padlock, is centred on the door.
                .setOrigin(0.5, (BODY_TOP + (HEIGHT - BODY_TOP) / 2) / HEIGHT)
                .setDepth(DEPTH_DOOR_LOCK_INDEX)
                .setAlpha(0);
            this.icons.set(key, created);
            this.fade(created, 1);
        }
    }

    public destroy(): void {
        for (const icon of this.icons.values()) {
            icon.destroy();
        }
        this.icons.clear();
    }

    private fade(icon: Phaser.GameObjects.Image, alpha: number, onComplete?: () => void): void {
        this.scene.tweens.killTweensOf(icon);
        this.scene.tweens.add({
            targets: icon,
            alpha,
            duration: FADE_MS,
            // The game only draws a scene marked dirty.
            onUpdate: () => this.markDirty(),
            onComplete: () => {
                onComplete?.();
                this.markDirty();
            },
        });
    }
}
