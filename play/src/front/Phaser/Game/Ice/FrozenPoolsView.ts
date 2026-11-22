import { get } from "svelte/store";
import type * as Phaser from "phaser";
import { GROUND_TEXTURES } from "@wa/front/Phaser/Game/Terrain/TexturedGround";
import { getWaterRectangles, getFrozenPoolRectangles } from "@wa/front/Phaser/Game/Water/WaterZones";
import type { WaterRectangle } from "@wa/front/Phaser/Game/Water/WaterZones";
import { frostAirNow } from "@wa/front/Phaser/Game/Weather/Frost";
import type { AirNow } from "@wa/front/Phaser/Game/Weather/Frost";
import { nightDateStore } from "@wa/front/Stores/NightStore";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { classicPoolsShown } from "@wa/front/Phaser/Game/Terrain/ImagePools";
import { OVER_WATER_DEPTH } from "@wa/front/Phaser/Game/Terrain/TerrainView";
import { isPoolHot } from "./FrozenWater";

/** The steam of a hot pool in the cold is drawn this often: each drawing draws the map again. */
const STEAM_FRAME_MS = 1000 / 12;
/** Puffs of steam over a hot pool, for each 32 px of its width. */
const PUFFS_PER_TILE = 2;
/** The opacity of a puff of the densest steam, when it is born. */
const STEAM_ALPHA = 0.45;
/** The water of a heated pool, °C. */
const HEATED_POOL_C = 28;
/** The steam shows from this gap between the water and the air (°C): an air of 10 °C. */
const STEAM_FROM_GAP_C = 18;
/** The steam is the densest from this gap (°C): an air of -15 °C. */
const STEAM_FULL_GAP_C = 43;
/** A wind this strong (km/h) thins the steam the most, by this share. */
const STEAM_SWEPT_KMH = 30;
const STEAM_WIND_THINNING = 0.6;
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
        const date = get(nightDateStore);
        const settings = this.scene.getGameMap?.()?.getWamFile()?.getWam().settings;
        const steam = date ? steamOver(frostAirNow(settings, date)) : 0;
        const hot = steam > 0 ? steamingPools(getWaterRectangles(this.scene).filter((pool) => isPoolHot(pool))) : [];
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
            // A painted pool is drawn with the water of the relief, over the ground: its steam over that water.
            this.steam.setDepth(pool.depth === undefined ? OVER_WATER_DEPTH : pool.depth + 0.001);
            // A light steam rises from a few places, a dense one from all over the pool.
            const puffs = Math.max(2, Math.round((pool.width / 32) * PUFFS_PER_TILE * (0.5 + steam)));
            for (let index = 0; index < puffs; index++) {
                // Each puff rises over 3 s from its own place, at its own time; always the same for the same time.
                const seed = Math.sin(index * 12.9898 + pool.x * 0.013 + pool.y * 0.007) * 43758.5453;
                const share = seed - Math.floor(seed);
                const life = (((now / 3000 + share) % 1) + 1) % 1;
                const x = pool.x + ((index + 0.5) / puffs) * pool.width + Math.sin(now / 700 + index) * 3;
                const y = pool.y + pool.height * (0.3 + 0.6 * share) - life * 28;
                this.steam.fillStyle(STEAM_COLOR, STEAM_ALPHA * steam * (1 - life) * Math.min(1, life * 4));
                this.steam.fillCircle(x, y, 3 + life * 6);
            }
        }
        this.scene.markDirty();
    }
}

/**
 * The pools the steam rises from: an image pool as it is, a painted one whole (it comes as a band of cells a row,
 * WaterZones): the rows that touch are one pool, its puffs spread over all of it rather than a few a row.
 */
export function steamingPools<Pool extends { x: number; y: number; width: number; height: number; painted?: unknown }>(
    pools: readonly Pool[],
): Pool[] {
    const whole: Pool[] = pools.filter((pool) => !pool.painted);
    const rows = pools.filter((pool) => pool.painted).sort((a, b) => a.y - b.y || a.x - b.x);
    const merged: Pool[] = [];
    for (const row of rows) {
        const index = merged.findIndex(
            (pool) => row.y <= pool.y + pool.height && row.x < pool.x + pool.width && pool.x < row.x + row.width,
        );
        if (index < 0) {
            merged.push({ ...row });
            continue;
        }
        const pool = merged[index];
        const x = Math.min(pool.x, row.x);
        const y = Math.min(pool.y, row.y);
        merged[index] = {
            ...pool,
            x,
            y,
            width: Math.max(pool.x + pool.width, row.x + row.width) - x,
            height: Math.max(pool.y + pool.height, row.y + row.height) - y,
        };
    }
    return [...whole, ...merged];
}

/**
 * How dense the steam over a heated pool is in that air, 0 (none) to 1: water vapour leaves the warm water and
 * condenses at once in the colder air, the more the colder (the "sea smoke" over a lake on a cold morning). It shows
 * from about 10 °C, thickens down to about -15 °C, rises in a dry air as in a damp one, and the wind thins it without
 * blowing it all away. None while the air is not known.
 */
export function steamOver(air: AirNow | undefined): number {
    if (!air || !Number.isFinite(air.temperature)) return 0;
    const gap = HEATED_POOL_C - air.temperature;
    const density = Math.min(1, Math.max(0, (gap - STEAM_FROM_GAP_C) / (STEAM_FULL_GAP_C - STEAM_FROM_GAP_C)));
    const wind = air.windSpeed !== undefined && Number.isFinite(air.windSpeed) ? Math.max(0, air.windSpeed) : 0;
    return density * (1 - STEAM_WIND_THINNING * Math.min(1, wind / STEAM_SWEPT_KMH));
}
