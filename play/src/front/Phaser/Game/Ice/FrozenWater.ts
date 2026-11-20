import { get } from "svelte/store";
import { entityStatesManagerStore } from "../../../Stores/EntityStatesStore";
import type { GameScene } from "../GameScene";
import { isFrozen, waterCycleNow } from "../Weather/Frost";

/** How deep a pool is, for the ice: it freezes with the shallows of a lake this deep. */
const POOL_DEPTH_PX = 32;

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
    pool: { x: number; y: number; width: number; height: number; entityId?: string },
): boolean {
    const { ice } = waterCycleNow(scene.getGameMap?.()?.getWamFile()?.getWam().settings);
    if (!isFrozen(POOL_DEPTH_PX, ice)) return false;
    if (scene.getOutdoorGrid?.()?.isOutdoorAt(pool.x + pool.width / 2, pool.y + pool.height / 2) === false)
        return false;
    return !(pool.entityId !== undefined && get(entityStatesManagerStore)?.isHot(pool.entityId));
}

/** Whether a pool is heated: it steams in the cold instead of freezing. */
export function isPoolHot(entityId: string | undefined): boolean {
    return entityId !== undefined && get(entityStatesManagerStore)?.isHot(entityId) === true;
}
