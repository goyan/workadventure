import * as Phaser from "phaser";
import type { CatastropheMessage } from "@workadventure/messages";
import { fireTiles, TILE_PX } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { isEffectShown } from "../../../Stores/EffectsStore";
import { drawLower } from "../Terrain/GroundDrop";
import { downpourAlpha } from "./DownpourFall";
import { torchFlames } from "./FireTorch";

const GLOW_COLOR = 0xff7a1a;
/** A flame is three tongues one in the other: red at its edge, orange, then a yellow heart. */
const TONGUES: { color: number; size: number; alpha: number }[] = [
    { color: 0xff3d14, size: 1, alpha: 0.55 },
    { color: 0xff9a26, size: 0.7, alpha: 0.6 },
    { color: 0xffe680, size: 0.4, alpha: 0.7 },
];
/** The flame follows the pointer of its player this fast: all the way in about a fifth of a second. */
const FOLLOW_PER_MS = 0.012;

interface Shown {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    radiusPx: number;
    /** In ms of the game. */
    beganAt: number;
    until: number;
    lasts: number;
}

/**
 * The fire a player holds under their pointer, as the server announces it: flames standing on a disc of the ground,
 * flickering, over a glow, for as long as the player keeps the click down, whether or not anything takes fire under
 * them (wet grass, snow, bare ground). What does take fire is the fire of the meadow, drawn elsewhere. Drawn in code,
 * in one layer above everything, its light added to what is under it.
 */
export class FireTorchView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly shown = new Map<number, Shown>();
    private lastUpdate: number | undefined;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly reducedMotion: () => boolean,
        /**
         * How much lower what lies at a point is drawn, the relief seen in 3/4: the ground or the water over it
         * (GameScene.surfaceDropAt).
         */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        this.graphics = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 2)
            .setBlendMode(Phaser.BlendModes.ADD);
    }

    /** `receivedAt` in ms of the game: the flame stays `message.impactInMs` more. */
    public report(message: CatastropheMessage, receivedAt: number): void {
        const radiusPx = fireTiles(message.radiusTiles) * TILE_PX;
        const known = this.shown.get(message.id);
        if (known) {
            known.targetX = message.x;
            known.targetY = message.y;
            known.radiusPx = radiusPx;
            known.until = receivedAt + message.impactInMs;
            known.lasts = message.impactInMs;
            return;
        }
        this.shown.set(message.id, {
            x: message.x,
            y: message.y,
            targetX: message.x,
            targetY: message.y,
            radiusPx,
            beganAt: receivedAt,
            until: receivedAt + message.impactInMs,
            lasts: message.impactInMs,
        });
    }

    public update(now: number): void {
        // Turned off on this computer: the fire goes on (it is the server's), its flame unseen.
        const visible = isEffectShown("fire");
        if (this.graphics.visible !== visible) {
            this.graphics.setVisible(visible);
            this.scene.markDirty();
        }
        if (!visible) {
            // Hidden (its own switch, or Basique): nothing drawn and the map not drawn again for it; the ended ones
            // still leave, so that a reveal shows only what goes on.
            for (const [id, shown] of this.shown) if (now >= shown.until) this.shown.delete(id);
            this.lastUpdate = undefined;
            return;
        }
        if (this.shown.size === 0) {
            this.lastUpdate = undefined;
            return;
        }
        const elapsed = this.lastUpdate === undefined ? 0 : Math.max(0, now - this.lastUpdate);
        this.lastUpdate = now;
        const graphics = this.graphics;
        graphics.clear();
        const reduced = this.reducedMotion();
        const follow = Math.min(1, elapsed * FOLLOW_PER_MS);
        for (const [id, torch] of this.shown) {
            if (now >= torch.until) {
                this.shown.delete(id);
                continue;
            }
            torch.x += (torch.targetX - torch.x) * follow;
            torch.y += (torch.targetY - torch.y) * follow;
            // Where what lies under it is drawn: the ground, or the water over it.
            drawLower([this.graphics], Math.round(this.dropAt(torch.x, torch.y)), () =>
                this.draw(now, torch, downpourAlpha(now - torch.beganAt, torch.until - now, torch.lasts), reduced),
            );
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.shown.clear();
        this.graphics.destroy();
    }

    private draw(now: number, torch: Shown, alpha: number, reduced: boolean): void {
        const graphics = this.graphics;
        const { x, y, radiusPx } = torch;
        // The glow on the ground, stronger in its middle.
        for (const [size, strength] of [
            [1, 0.1],
            [0.7, 0.12],
            [0.4, 0.14],
        ]) {
            graphics.fillStyle(GLOW_COLOR, strength * alpha);
            graphics.fillEllipse(x, y, radiusPx * 2 * size, radiusPx * size);
        }
        for (const flame of torchFlames(now, { x, y }, radiusPx, reduced)) {
            for (const tongue of TONGUES) {
                const half = (flame.width * tongue.size) / 2;
                const height = flame.height * tongue.size;
                graphics.fillStyle(tongue.color, tongue.alpha * alpha);
                // A round foot and a pointed tip.
                graphics.fillEllipse(flame.x, flame.y - half * 0.6, half * 2, half * 1.4);
                graphics.fillTriangle(
                    flame.x - half,
                    flame.y - half * 0.6,
                    flame.x + half,
                    flame.y - half * 0.6,
                    flame.x,
                    flame.y - height,
                );
            }
        }
    }
}
