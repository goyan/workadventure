import * as Phaser from "phaser";
import { TILE_PX } from "@workadventure/map-editor";
import { DEPTH_LAMP_LIGHT_INDEX, DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { MeadowState } from "../Terrain/MeadowState";
import { embersOf, flameOf, flameOutline, smokeOf, spreadTiles, tileSeed } from "./FlameShape";
import type { Flame } from "./FlameShape";

/** Flames are drawn on about this many tiles at most: beyond, on a share of them all over the view, bigger. */
const MAX_FLAMES = 600;
/** Tiles around the view whose flames are drawn too: a flame leans and rises over its neighbours. */
const VIEW_MARGIN_TILES = 3;
/** Where the foot of a flame stands in its tile, from its top: towards its bottom, as what stands on the ground. */
const FOOT_IN_TILE = 0.8;
/** The tongues of a flame, from its red mantle to its white heart: their size, colour and opacity. */
const TONGUES: readonly { scale: number; color: number; alpha: number }[] = [
    { scale: 1, color: 0xd9381e, alpha: 0.8 },
    { scale: 0.76, color: 0xff7a1a, alpha: 0.9 },
    { scale: 0.52, color: 0xffc23d, alpha: 0.95 },
    { scale: 0.28, color: 0xfff2c2, alpha: 1 },
];
const EMBER_COLOR = 0xffb347;
const SMOKE_COLOR = 0x3a3632;
const GLOW_COLOR = 0xff7a1a;
const GLOW_RADIUS_PX = 72;
const GLOW_ALPHA = 0.16;

/**
 * The flames of the tiles on fire, as the server tells them: on each tile a flame in several tongues, as tall as its
 * fire is strong, laid by the wind, breathing in its own time; embers and smoke over it; a glow that shows through
 * the night. Each row of tiles has its own layer at the depth of its foot, so an avatar in front of a flame hides
 * it, and one behind is hidden by it. Drawn in code; the server alone decides what burns.
 */
export class FireView {
    /** The flames of each row of tiles, at the depth of the foot of that row. */
    private readonly rows = new Map<number, Phaser.GameObjects.Graphics>();
    private readonly smoke: Phaser.GameObjects.Graphics;
    private readonly glow: Phaser.GameObjects.Graphics;
    private drawn = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly meadow: Pick<MeadowState, "fireAt" | "isBurning">,
        private readonly wind: () => { windFrom?: number; windSpeed?: number } | undefined,
        private readonly reducedMotion: () => boolean,
    ) {
        // The smoke over everything that stands on the map, under the veil of the night; the glow through it.
        this.smoke = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX - 1);
        this.glow = scene.add
            .graphics()
            .setDepth(DEPTH_LAMP_LIGHT_INDEX + 1)
            .setBlendMode(Phaser.BlendModes.ADD);
    }

    public update(now: number): void {
        if (!this.meadow.isBurning()) {
            if (this.drawn) this.clear();
            return;
        }
        const view = this.scene.cameras.main.worldView;
        const fromX = Math.floor(view.x / TILE_PX) - VIEW_MARGIN_TILES;
        const toX = Math.ceil(view.right / TILE_PX) + VIEW_MARGIN_TILES;
        const fromY = Math.floor(view.y / TILE_PX) - VIEW_MARGIN_TILES;
        const toY = Math.ceil(view.bottom / TILE_PX) + VIEW_MARGIN_TILES;
        const burning: { x: number; y: number; fire: number }[] = [];
        for (let y = fromY; y <= toY; y++) {
            for (let x = fromX; x <= toX; x++) {
                const fire = this.meadow.fireAt(x, y);
                if (fire > 0) burning.push({ x, y, fire });
            }
        }
        this.clear();
        if (burning.length === 0) return;
        const { tiles: shown, scale } = spreadTiles(burning, MAX_FLAMES);
        const wind = this.wind();
        const reducedMotion = this.reducedMotion();
        const seconds = now / 1000;
        for (const tile of shown) {
            const input = {
                intensity: tile.fire / 255,
                windFrom: wind?.windFrom,
                windSpeed: wind?.windSpeed,
                seconds,
                seed: tileSeed(tile.x, tile.y),
                reducedMotion,
            };
            const footX = (tile.x + 0.5) * TILE_PX;
            const footY = (tile.y + FOOT_IN_TILE) * TILE_PX;
            const flame = flameOf(input);
            this.drawFlame(this.rowOf(tile.y), flame, footX, footY, scale);
            for (const ember of embersOf(input)) {
                this.glow.fillStyle(EMBER_COLOR, ember.alpha);
                this.glow.fillRect(
                    footX + ember.x * scale - 1,
                    footY + (ember.y - flame.height * 0.6) * scale - 1,
                    2,
                    2,
                );
            }
            for (const puff of smokeOf(input)) {
                this.smoke.fillStyle(SMOKE_COLOR, puff.alpha);
                this.smoke.fillCircle(footX + puff.x * scale, footY + puff.y * scale, puff.radius * scale);
            }
            this.glow.fillStyle(GLOW_COLOR, GLOW_ALPHA * input.intensity);
            this.glow.fillCircle(
                footX,
                footY - flame.height * 0.4 * scale,
                GLOW_RADIUS_PX * (0.5 + 0.5 * input.intensity) * scale,
            );
        }
        this.drawn = true;
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const row of this.rows.values()) row.destroy();
        this.rows.clear();
        this.smoke.destroy();
        this.glow.destroy();
    }

    private rowOf(tileY: number): Phaser.GameObjects.Graphics {
        let row = this.rows.get(tileY);
        if (!row) {
            // At the depth of the foot of its flames: what stands lower on the map is drawn over them.
            row = this.scene.add.graphics().setDepth((tileY + FOOT_IN_TILE) * TILE_PX);
            this.rows.set(tileY, row);
        }
        return row;
    }

    private drawFlame(
        graphics: Phaser.GameObjects.Graphics,
        flame: Flame,
        footX: number,
        footY: number,
        scale: number,
    ): void {
        for (const tongue of TONGUES) {
            graphics.fillStyle(tongue.color, tongue.alpha);
            const outline = flameOutline(flame, tongue.scale * scale);
            graphics.beginPath();
            graphics.moveTo(footX + outline[0].x, footY + outline[0].y);
            for (let index = 1; index < outline.length; index++) {
                graphics.lineTo(footX + outline[index].x, footY + outline[index].y);
            }
            graphics.closePath();
            graphics.fillPath();
        }
    }

    private clear(): void {
        for (const row of this.rows.values()) row.clear();
        this.smoke.clear();
        this.glow.clear();
        if (this.drawn) this.scene.markDirty();
        this.drawn = false;
    }
}
