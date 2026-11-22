import type { CatastropheMessage } from "@workadventure/messages";
import { downpourTiles, TILE_PX } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { isEffectShown } from "../../../Stores/EffectsStore";
import { drawFlake, flakeFadeIn, snowTones } from "../Weather/Snowfall";
import {
    DOWNPOUR_FALL_PX,
    downpourAlpha,
    downpourDrops,
    downpourFlakes,
    FLAKE_FALL_MS,
    SPLASH_FROM,
} from "./DownpourFall";

const CLOUD_COLOR = 0x4a5568;
const CLOUD_LIGHT = 0x718096;
const DROP_COLOR = 0xbfe3ff;
const WET_COLOR = 0x1a365d;
/**
 * In the cold a downpour falls as snow: its flakes (those of the weather, Snowfall.ts), the white it lays under it,
 * and its paler cloud.
 */
const FLAKE_TONES = snowTones(0);
/** A middle flake of the weather: 3 px, lit and shaded. */
const FLAKE_SIZE = 3;
const SNOW_GROUND_COLOR = 0xffffff;
const SNOW_CLOUD_COLOR = 0x8d97a8;
const SNOW_CLOUD_LIGHT = 0xc3cad6;
/** The cloud follows the pointer of its player this fast: all the way in about a fifth of a second. */
const FOLLOW_PER_MS = 0.012;
/** Under a downpour on the whole map, the rain is drawn as a disc this many times the half-width of the view. */
const WHOLE_VIEW_REACH = 0.75;
/** Where the puffs of a cloud stand around its middle (shares of its radius), and how wide each is. */
const PUFFS: readonly [number, number, number][] = [
    [-0.55, 0.05, 0.5],
    [-0.2, -0.12, 0.62],
    [0.2, -0.08, 0.66],
    [0.58, 0.06, 0.48],
    [0, 0.12, 0.7],
];

interface Shown {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    radiusPx: number;
    wholeMap: boolean;
    /** In ms of the game. */
    beganAt: number;
    until: number;
    lasts: number;
}

/**
 * The downpours the server announces: under a dark cloud, drops fall on a disc of the ground and splash there; on the
 * whole map, they fall all over the view under a veil. A downpour follows the messages of its player and ends when
 * they stop. In the cold of the room the downpour falls as snow: flakes come down slowly instead of drops, in a
 * sleet between the two. Drawn in code, in one layer above everything. The server alone decides what the water does.
 */
export class DownpourView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly shown = new Map<number, Shown>();
    private lastUpdate: number | undefined;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly reducedMotion: () => boolean,
        /** The share of a downpour that falls as snow in the air of the room, 0 (rain) to 1 (snow). */
        private readonly snowShare: () => number = () => 0,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** `receivedAt` in ms of the game: the downpour goes on `message.impactInMs` more. */
    public report(message: CatastropheMessage, receivedAt: number): void {
        const radiusPx = downpourTiles(message.radiusTiles) * TILE_PX;
        const known = this.shown.get(message.id);
        if (known) {
            known.targetX = message.x;
            known.targetY = message.y;
            known.radiusPx = radiusPx;
            known.wholeMap = message.wholeMap;
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
            wholeMap: message.wholeMap,
            beganAt: receivedAt,
            until: receivedAt + message.impactInMs,
            lasts: message.impactInMs,
        });
    }

    public update(now: number): void {
        // Turned off on this computer: the downpour goes on (its water is the server's), unseen.
        const visible = isEffectShown("downpour");
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
        const share = this.snowShare();
        const snow = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
        const follow = Math.min(1, elapsed * FOLLOW_PER_MS);
        let veiled = false;
        for (const [id, downpour] of this.shown) {
            if (now >= downpour.until) {
                this.shown.delete(id);
                continue;
            }
            downpour.x += (downpour.targetX - downpour.x) * follow;
            downpour.y += (downpour.targetY - downpour.y) * follow;
            const alpha = downpourAlpha(now - downpour.beganAt, downpour.until - now, downpour.lasts);
            if (downpour.wholeMap) {
                // Several downpours on the whole map look like one.
                if (!veiled) this.drawWholeMap(now, alpha, reduced, snow);
                veiled = true;
            } else {
                this.drawDisc(now, downpour, alpha, reduced, snow);
            }
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.shown.clear();
        this.graphics.destroy();
    }

    private drawDisc(now: number, downpour: Shown, alpha: number, reduced: boolean, snow: number): void {
        const { x, y, radiusPx } = downpour;
        // The ground darkens under the rain, pales under the snow.
        this.graphics.fillStyle(WET_COLOR, 0.22 * alpha * (1 - snow));
        this.graphics.fillEllipse(x, y, radiusPx * 2, radiusPx);
        this.graphics.fillStyle(SNOW_GROUND_COLOR, 0.14 * alpha * snow);
        this.graphics.fillEllipse(x, y, radiusPx * 2, radiusPx);
        this.drawDrops(now, { x, y }, radiusPx, alpha, reduced, snow);
        const snowing = snow >= 0.5;
        // The cloud hangs over the disc, as high as the drops fall from.
        const cloudY = y - DOWNPOUR_FALL_PX - radiusPx * 0.15;
        for (const [dx, dy, size] of PUFFS) {
            this.graphics.fillStyle(snowing ? SNOW_CLOUD_COLOR : CLOUD_COLOR, 0.85 * alpha);
            this.graphics.fillEllipse(
                x + dx * radiusPx,
                cloudY + dy * radiusPx,
                size * radiusPx * 1.5,
                size * radiusPx,
            );
        }
        for (const [dx, dy, size] of PUFFS) {
            this.graphics.fillStyle(snowing ? SNOW_CLOUD_LIGHT : CLOUD_LIGHT, 0.5 * alpha);
            this.graphics.fillEllipse(
                x + dx * radiusPx - size * radiusPx * 0.12,
                cloudY + dy * radiusPx - size * radiusPx * 0.14,
                size * radiusPx,
                size * radiusPx * 0.55,
            );
        }
    }

    private drawWholeMap(now: number, alpha: number, reduced: boolean, snow: number): void {
        const view = this.scene.cameras.main.worldView;
        this.graphics.fillStyle(WET_COLOR, 0.28 * alpha * (1 - snow));
        this.graphics.fillRect(view.x, view.y, view.width, view.height);
        this.graphics.fillStyle(SNOW_GROUND_COLOR, 0.12 * alpha * snow);
        this.graphics.fillRect(view.x, view.y, view.width, view.height);
        // The drops keep their place on the map while the view moves: they are laid on a grid of the map.
        const reach = Math.max(view.width, view.height * 2) * WHOLE_VIEW_REACH;
        const step = reach;
        const centre = {
            x: Math.round(view.centerX / step) * step,
            y: Math.round(view.centerY / step) * step,
        };
        this.drawDrops(now, centre, reach * 1.6, alpha, reduced, snow);
    }

    private drawDrops(
        now: number,
        centre: { x: number; y: number },
        radiusPx: number,
        alpha: number,
        reduced: boolean,
        snow: number,
    ): void {
        const graphics = this.graphics;
        if (snow > 0) {
            // A flake fades in as it leaves the cloud, and stays whole down to the ground.
            for (const flake of downpourFlakes(now, centre, radiusPx, snow, reduced)) {
                const shown = 0.9 * alpha * flakeFadeIn((flake.fall * FLAKE_FALL_MS) / 1000);
                drawFlake(graphics, flake.x, flake.y, FLAKE_SIZE, shown, FLAKE_TONES);
            }
        }
        for (const drop of downpourDrops(now, centre, radiusPx, reduced, snow)) {
            if (drop.fall >= SPLASH_FROM) {
                const splash = (drop.fall - SPLASH_FROM) / (1 - SPLASH_FROM);
                graphics.lineStyle(1, DROP_COLOR, 0.7 * alpha * (1 - splash));
                graphics.strokeEllipse(drop.landX, drop.landY, 4 + splash * 8, 2 + splash * 4);
                continue;
            }
            graphics.lineStyle(2, DROP_COLOR, 0.75 * alpha);
            const length = 10;
            const dx = drop.landX - drop.x;
            const dy = drop.landY - drop.y;
            const distance = Math.hypot(dx, dy) || 1;
            graphics.lineBetween(
                drop.x,
                drop.y,
                drop.x + (dx / distance) * Math.min(length, distance),
                drop.y + (dy / distance) * Math.min(length, distance),
            );
        }
    }
}
