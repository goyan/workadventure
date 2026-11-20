import { cellKey, DEFAULT_POOL_STYLE, MAX_POOL_STYLES, poolSoilCode, TERRAIN_CELL } from "@workadventure/map-editor";
import { readTerrainMapSettings } from "@wa/front/Phaser/Game/Terrain/TerrainMapSettings";
import { terrainBrushStore } from "@wa/front/Stores/TerrainEditorStore";
import { executeUpdateTerrain, executeUpdateWAMSettings } from "./Commands/Facades";

/** What is read of a pool placed as an image: where its image is. */
export interface ImagePoolPlaced {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
}

/**
 * Turns a pool placed as an image into a pool painted with the relief tool, that is edited on the map like any other
 * (its shape with the brush, its colours, depth, ladders and hot water): a new style of pool (the default one, as it
 * was drawn) and the cells under its image painted with it. The brush is left on that style. False when the map has
 * no style left (MAX_POOL_STYLES): nothing is changed then. The caller removes the object.
 */
export async function paintImagePool(pool: ImagePoolPlaced): Promise<boolean> {
    const pools = readTerrainMapSettings().pools;
    if (pools.length >= MAX_POOL_STYLES) return false;
    const style = pools.length;
    await executeUpdateWAMSettings({
        $case: "updatePoolSettingMessage",
        updatePoolSettingMessage: { pools: [...pools, { ...DEFAULT_POOL_STYLE }] },
    });
    await executeUpdateTerrain(new Map(), undefined, imagePoolSoils(pool, poolSoilCode(style)));
    terrainBrushStore.update((brush) => ({ ...brush, soil: poolSoilCode(style) }));
    return true;
}

/** The cells whose centre is under the image of the pool, painted with this soil (a style of pool). */
export function imagePoolSoils(pool: ImagePoolPlaced, code: number): Map<string, number> {
    const soils = new Map<string, number>();
    const firstX = Math.floor(pool.x / TERRAIN_CELL);
    const lastX = Math.ceil((pool.x + pool.displayWidth) / TERRAIN_CELL);
    const firstY = Math.floor(pool.y / TERRAIN_CELL);
    const lastY = Math.ceil((pool.y + pool.displayHeight) / TERRAIN_CELL);
    for (let cellY = firstY; cellY < lastY; cellY++) {
        const y = (cellY + 0.5) * TERRAIN_CELL;
        if (y < pool.y || y > pool.y + pool.displayHeight) continue;
        for (let cellX = firstX; cellX < lastX; cellX++) {
            const x = (cellX + 0.5) * TERRAIN_CELL;
            if (x < pool.x || x > pool.x + pool.displayWidth) continue;
            soils.set(cellKey(cellX, cellY), code);
        }
    }
    return soils;
}
