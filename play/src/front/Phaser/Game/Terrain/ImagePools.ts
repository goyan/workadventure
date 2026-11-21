import { get } from "svelte/store";
import { entityStatesManagerStore } from "@wa/front/Stores/EntityStatesStore";
import { pixelReliefShownNow } from "./PixelReliefShown";

/**
 * The pools of the map placed as images (objects with water): drawn by the shaders in their place, as the pools
 * painted with the relief tool, so that they get the same water, ice and steam. Their image is hidden meanwhile. The
 * old look stays to compare: `?classicPools` in the address, or `classicPools` set to "1" in the local storage.
 */
export interface ImagePool {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Its water heated by a switch (the state `hot` of the object). */
    hot: boolean;
    entityId: string;
}

/** What is read of a placed object. */
export interface PlacedPool {
    entityId: string;
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    getPrefab(): { water?: readonly unknown[] };
    getElevation?(): number;
    readonly visible: boolean;
    setVisible(visible: boolean): unknown;
}

/**
 * Whether the pools placed as images keep their image: to compare with the pools drawn by the shaders, and while the
 * blocks of the relief draw the ground (no shader draws it then).
 */
export function classicPoolsShown(): boolean {
    if (pixelReliefShownNow()) return true;
    try {
        return (
            new URLSearchParams(window.location.search).has("classicPools") ||
            localStorage.getItem("classicPools") === "1"
        );
    } catch {
        return false;
    }
}

/** The pools of the ground among these objects: the whole image of each object with water. */
export function imagePoolsOf(objects: Iterable<PlacedPool>): ImagePool[] {
    const pools: ImagePool[] = [];
    for (const object of objects) {
        if (!object.getPrefab().water?.length || (object.getElevation?.() ?? 0) > 0) continue;
        pools.push({
            x: object.x,
            y: object.y,
            width: object.displayWidth,
            height: object.displayHeight,
            hot: get(entityStatesManagerStore)?.isHot(object.entityId) === true,
            entityId: object.entityId,
        });
    }
    return pools;
}

/** A text that changes whenever a pool moves, is resized, added, removed or heated: the ground is drawn again then. */
export function signatureOf(pools: readonly ImagePool[]): string {
    return pools.map((pool) => `${pool.x},${pool.y},${pool.width},${pool.height},${pool.hot ? 1 : 0}`).join(";");
}

/**
 * The image pools over a canvas of cells: 1 on a cell whose centre is in a cold pool, 2 in a heated one; undefined
 * without any.
 */
export function imagePoolCells(
    pools: readonly ImagePool[],
    area: { x: number; y: number; columns: number; rows: number; cell: number },
): Uint8Array | undefined {
    if (pools.length === 0) return undefined;
    const cells = new Uint8Array(area.columns * area.rows);
    for (const pool of pools) {
        const first = Math.max(0, Math.floor((pool.x - area.x) / area.cell));
        const last = Math.min(area.columns - 1, Math.ceil((pool.x + pool.width - area.x) / area.cell) - 1);
        const top = Math.max(0, Math.floor((pool.y - area.y) / area.cell));
        const bottom = Math.min(area.rows - 1, Math.ceil((pool.y + pool.height - area.y) / area.cell) - 1);
        for (let row = top; row <= bottom; row++) {
            const y = area.y + (row + 0.5) * area.cell;
            if (y < pool.y || y > pool.y + pool.height) continue;
            for (let column = first; column <= last; column++) {
                const x = area.x + (column + 0.5) * area.cell;
                if (x < pool.x || x > pool.x + pool.width) continue;
                cells[row * area.columns + column] = pool.hot ? 2 : 1;
            }
        }
    }
    return cells;
}
