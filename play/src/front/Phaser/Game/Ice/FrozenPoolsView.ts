import type * as Phaser from "phaser";
import { GROUND_TEXTURES } from "../Terrain/TexturedGround";
import { getWaterRectangles, getFrozenPoolRectangles } from "../Water/WaterZones";
import type { WaterRectangle } from "../Water/WaterZones";
import { waterCycleNow } from "../Weather/Frost";
import type { GameScene } from "../GameScene";
import { classicPoolsShown } from "../Terrain/ImagePools";
import { isPoolHot } from "./FrozenWater";

/** The steam of a hot pool in the cold is drawn this often: each drawing draws the map again. */
const STEAM_FRAME_MS = 1000 / 12;
/** Puffs of steam over a hot pool, for each 32 px of its width. */
const PUFFS_PER_TILE = 2;
const STEAM_COLOR = 0xffffff;

/**
 * The pools of the map in the cold, for this player: a sheet of ice (the ice of the rinks) over each frozen pool,
 * and steam rising over the heated ones while it freezes outdoors. The ice is skated on (WaterZones, Character).
 */
export class FrozenPoolsView {
    private readonly sheets = new Map<string, Phaser.GameObjects.TileSprite>();
    private readonly steam: Phaser.GameObjects.Graphics;
    private lastSteamAt = 0;
    private steaming = false;

    constructor(private readonly scene: GameScene) {
        this.steam = scene.add.graphics();
    }

    public update(now: number): void {
        this.layIce(getFrozenPoolRectangles(this.scene));
        this.drawSteam(now);
    }

    public destroy(): void {
        for (const sheet of this.sheets.values()) sheet.destroy();
        this.sheets.clear();
        this.steam.destroy();
    }

    private layIce(frozen: readonly WaterRectangle[]): void {
        const kept = new Set<string>();
        let changed = false;
        // The shaders draw the ice of the painted pools, and of the image pools they draw in their place: a sheet only
        // over the image pools kept to compare (classicPoolsShown).
        const sheets = classicPoolsShown() ? frozen.filter((frozenPool) => !frozenPool.painted) : [];
        for (const pool of sheets) {
            const key = `${pool.x},${pool.y},${pool.width},${pool.height}`;
            kept.add(key);
            if (this.sheets.has(key) || !this.scene.textures.exists(GROUND_TEXTURES.ice)) continue;
            const sheet = this.scene.add
                .tileSprite(pool.x, pool.y, pool.width, pool.height, GROUND_TEXTURES.ice)
                .setOrigin(0)
                // The pattern is fixed to the map, as the ice of the lakes.
                .setTilePosition(pool.x, pool.y)
                .setAlpha(0.95)
                .setDepth((pool.depth ?? 0) + 0.0005);
            this.sheets.set(key, sheet);
            changed = true;
        }
        for (const [key, sheet] of this.sheets) {
            if (kept.has(key)) continue;
            sheet.destroy();
            this.sheets.delete(key);
            changed = true;
        }
        if (changed) this.scene.markDirty();
    }

    /** Steam over the heated pools of the ground while it freezes outdoors: a few puffs rising and fading. */
    private drawSteam(now: number): void {
        const { frost } = waterCycleNow(this.scene.getGameMap?.()?.getWamFile()?.getWam().settings);
        const hot = frost > 0 ? getWaterRectangles(this.scene).filter((pool) => isPoolHot(pool)) : [];
        if (hot.length === 0) {
            if (this.steaming) {
                this.steam.clear();
                this.steaming = false;
                this.scene.markDirty();
            }
            return;
        }
        if (now - this.lastSteamAt < STEAM_FRAME_MS) return;
        this.lastSteamAt = now;
        this.steaming = true;
        this.steam.clear();
        for (const pool of hot) {
            this.steam.setDepth((pool.depth ?? 0) + 0.001);
            const puffs = Math.max(2, Math.round((pool.width / 32) * PUFFS_PER_TILE));
            for (let index = 0; index < puffs; index++) {
                // Each puff rises over 3 s from its own place, at its own time; always the same for the same time.
                const seed = Math.sin(index * 12.9898 + pool.x * 0.013 + pool.y * 0.007) * 43758.5453;
                const share = seed - Math.floor(seed);
                const life = (((now / 3000 + share) % 1) + 1) % 1;
                const x = pool.x + ((index + 0.5) / puffs) * pool.width + Math.sin(now / 700 + index) * 3;
                const y = pool.y + pool.height * (0.3 + 0.6 * share) - life * 28;
                this.steam.fillStyle(STEAM_COLOR, 0.35 * (1 - life) * Math.min(1, life * 4));
                this.steam.fillCircle(x, y, 3 + life * 6);
            }
        }
        this.scene.markDirty();
    }
}
