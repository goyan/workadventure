import { poolSoilCode, TERRAIN_CELL } from "@workadventure/map-editor";
import { poolAt } from "@wa/front/Phaser/Game/Terrain/PoolShapes";
import { classicPoolsShown } from "@wa/front/Phaser/Game/Terrain/ImagePools";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { selectedPoolStore, terrainBrushStore } from "@wa/front/Stores/TerrainEditorStore";
import { EditorToolName } from "./EditorToolName";
import type { MapEditorModeManager } from "./MapEditorModeManager";
import { paintImagePool } from "./PoolConversion";

/**
 * A click on a pool in the map editor opens it in the pool mode of the relief tool, picked whole with its style: its
 * shape, colours, depth, ladders and hot water are edited there. A pool placed as an image is turned into a painted
 * one first. False when there is no pool under the point.
 */
export function openPoolAt(manager: MapEditorModeManager, scene: GameScene, point: { x: number; y: number }): boolean {
    const cellX = Math.floor(point.x / TERRAIN_CELL);
    const cellY = Math.floor(point.y / TERRAIN_CELL);
    if (poolAt(terrainOf(scene), cellX, cellY)) {
        openInPoolMode(manager, scene, cellX, cellY);
        return true;
    }
    const image = imagePoolAt(scene, point);
    if (!image) return false;
    (async () => {
        if (!(await paintImagePool(image))) return;
        image.delete();
        openInPoolMode(manager, scene, cellX, cellY);
    })().catch((error: unknown) => console.error("The pool could not be opened", error));
    return true;
}

function openInPoolMode(manager: MapEditorModeManager, scene: GameScene, cellX: number, cellY: number): void {
    const pool = poolAt(terrainOf(scene), cellX, cellY);
    if (!pool) return;
    manager.equipTool(EditorToolName.TerrainEditor);
    terrainBrushStore.update((brush) => ({ ...brush, mode: "pool", soil: poolSoilCode(pool.style) }));
    selectedPoolStore.set(pool);
}

/** The pool placed as an image under the point: its image is hidden (drawn by the shaders), so no click reaches it. */
function imagePoolAt(scene: GameScene, point: { x: number; y: number }) {
    if (classicPoolsShown()) return undefined;
    for (const entity of scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
        if (!entity.getPrefab().water?.length || (entity.getElevation?.() ?? 0) > 0) continue;
        if (
            point.x >= entity.x &&
            point.y >= entity.y &&
            point.x < entity.x + entity.displayWidth &&
            point.y < entity.y + entity.displayHeight
        ) {
            return entity;
        }
    }
    return undefined;
}

function terrainOf(scene: GameScene) {
    return scene.getGameMap().getWamFile()?.getWam().terrain;
}
