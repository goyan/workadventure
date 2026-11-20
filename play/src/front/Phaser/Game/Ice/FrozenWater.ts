import { get } from "svelte/store";
import { entityStatesManagerStore } from "@wa/front/Stores/EntityStatesStore";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { isFrozen, POOL_ICE_DEPTH_PX, waterCycleNow } from "@wa/front/Phaser/Game/Weather/Frost";

/**
 * Whether the point is on water of the relief frozen for this player (Frost.ts): it is skated on as on a rink, nobody
 * swims in it nor is carried by its current. What this player sees: their own city may be colder than the map's.
 */
export function isOnFrozenWater(scene: GameScene, point: { x: number; y: number }): boolean {
    const water = scene.getTerrainWater?.();
    if (!water) return false;
    // Indoors (closed by walls, see OutdoorGrid) the water never freezes.
    if (scene.getOutdoorGrid?.()?.isOutdoorAt(point.x, point.y) === false) return false;
    const { ice } = waterCycleNow(scene.getGameMap?.()?.getWamFile()?.getWam().settings);
    if (ice <= 0) return false;
    return isFrozen(water.depthAt(point.x, point.y, scene.time.now), ice);
}

/**
 * Whether a pool of the ground is frozen for this player: outdoors (a pool closed by walls never freezes), its water
 * not heated by a switch (the hot water of a pool, see entityStateKeysOf), and the cold enough for water that deep.
 */
export function isPoolFrozen(
    scene: Partial<GameScene>,
    pool: {
        x: number;
        y: number;
        width: number;
        height: number;
        entityId?: string;
        painted?: { depthPx: number; hot: boolean };
    },
): boolean {
    // A pool painted with the relief tool: its hot water set in its style.
    if (pool.painted?.hot) return false;
    const { ice } = waterCycleNow(scene.getGameMap?.()?.getWamFile()?.getWam().settings);
    if (!isFrozen(POOL_ICE_DEPTH_PX, ice)) return false;
    if (scene.getOutdoorGrid?.()?.isOutdoorAt(pool.x + pool.width / 2, pool.y + pool.height / 2) === false)
        return false;
    return !(pool.entityId !== undefined && get(entityStatesManagerStore)?.isHot(pool.entityId));
}

/** Whether a pool is heated (by a switch, or in the style of a painted pool): it steams in the cold, never freezes. */
export function isPoolHot(pool: { entityId?: string; painted?: { hot: boolean } }): boolean {
    if (pool.painted) return pool.painted.hot;
    return pool.entityId !== undefined && get(entityStatesManagerStore)?.isHot(pool.entityId) === true;
}
