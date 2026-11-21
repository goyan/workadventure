import { get } from "svelte/store";
import { ICE_BEARS_MM } from "@workadventure/map-editor";
import { entityStatesManagerStore } from "@wa/front/Stores/EntityStatesStore";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { isFrozen, ownIceMm, POOL_ICE_DEPTH_PX, waterCycleNow } from "@wa/front/Phaser/Game/Weather/Frost";
import { followsServerGround } from "@wa/front/Phaser/Game/Weather/GroundSource";
import { SWIM_DEPTH_PX } from "@wa/front/Phaser/Game/Water/WaterZones";
import type { IceBreaks } from "./IceBreaks";
import { iceOfThickness } from "./IceHold";
import type { IceState } from "./IceHold";

export type { IceState };

type IceScene = Partial<Pick<GameScene, "getTerrainWater" | "getOutdoorGrid" | "getMeadow" | "getGameMap">> & {
    time?: { now: number };
    getIceBreaks?(): IceBreaks;
};

/**
 * The ice of the relief under a point. A player who follows the weather of the server stands on the ice the server
 * keeps (the same for everyone, with its thickness); a player who follows a place of their own has the ice of their
 * own cold (Frost.ts), its thickness read from that cold (ownIceMm). Indoors the water never freezes; an open hole
 * has no ice.
 */
export function iceUnderfoot(scene: IceScene, point: { x: number; y: number }): IceState {
    const water = scene.getTerrainWater?.();
    if (!water) return "none";
    // Indoors (closed by walls, see OutdoorGrid) the water never freezes.
    if (scene.getOutdoorGrid?.()?.isOutdoorAt(point.x, point.y) === false) return "none";
    const now = scene.time?.now ?? 0;
    if (scene.getIceBreaks?.().holeAt(point.x, point.y, now)) return "none";
    const depth = water.depthAt(point.x, point.y, now);
    const deep = depth >= SWIM_DEPTH_PX;
    if (followsServerGround()) return iceOfThickness(scene.getMeadow?.()?.iceAtPoint(point.x, point.y) ?? 0, deep);
    const { ice } = waterCycleNow(scene.getGameMap?.()?.getWamFile()?.getWam().settings);
    if (ice <= 0 || !isFrozen(depth, ice)) return "none";
    return deep && ownIceMm(ice) < ICE_BEARS_MM ? "thin" : "solid";
}

/** Whether the point is on water of the relief frozen for this player: skated on, nobody swims in it. */
export function isOnFrozenWater(scene: IceScene, point: { x: number; y: number }): boolean {
    return iceUnderfoot(scene, point) !== "none";
}

/**
 * The ice of a pool of the ground for this player: none indoors (a pool closed by walls never freezes), with its water
 * heated by a switch or its style, or a hole open in it; otherwise the ice the server keeps on a painted pool (for a
 * player who follows it), or the ice of the player's own cold.
 */
export function poolIceState(
    scene: IceScene,
    pool: {
        x: number;
        y: number;
        width: number;
        height: number;
        entityId?: string;
        painted?: { depthPx: number; hot: boolean };
    },
): IceState {
    // A pool painted with the relief tool: its hot water set in its style.
    if (pool.painted?.hot) return "none";
    if (scene.getIceBreaks?.().holeIn(pool, scene.time?.now ?? 0)) return "none";
    // For a player who follows the weather of the server, a painted pool has the ice the server keeps on it (the
    // same for everyone). A pool placed as an image is not known to the server: it keeps the player's own cold.
    if (pool.painted && followsServerGround()) {
        const ice = scene.getMeadow?.()?.iceAtPoint(pool.x + pool.width / 2, pool.y + pool.height / 2) ?? 0;
        return iceOfThickness(ice, pool.painted.depthPx >= SWIM_DEPTH_PX);
    }
    const { ice } = waterCycleNow(scene.getGameMap?.()?.getWamFile()?.getWam().settings);
    if (!isFrozen(POOL_ICE_DEPTH_PX, ice)) return "none";
    if (scene.getOutdoorGrid?.()?.isOutdoorAt(pool.x + pool.width / 2, pool.y + pool.height / 2) === false) {
        return "none";
    }
    if (pool.entityId !== undefined && get(entityStatesManagerStore)?.isHot(pool.entityId)) return "none";
    return ownIceMm(ice) < ICE_BEARS_MM ? "thin" : "solid";
}

/** Whether a pool of the ground is frozen for this player: its water is no water then, one walks onto its ice. */
export function isPoolFrozen(scene: IceScene, pool: Parameters<typeof poolIceState>[1]): boolean {
    return poolIceState(scene, pool) !== "none";
}

/** Whether a pool is heated (by a switch, or in the style of a painted pool): it steams in the cold, never freezes. */
export function isPoolHot(pool: { entityId?: string; painted?: { hot: boolean } }): boolean {
    if (pool.painted) return pool.painted.hot;
    return pool.entityId !== undefined && get(entityStatesManagerStore)?.isHot(pool.entityId) === true;
}
