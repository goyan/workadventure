import type * as Phaser from "phaser";
import {
    DEFAULT_POOL_STYLE,
    TERRAIN_CELL,
    poolCells,
    poolStyleAt,
    poolStyleOf,
    soilAt,
} from "@workadventure/map-editor";
import type { PoolStyle, TerrainData } from "@workadventure/map-editor";

/** The coping drawn along the rim of a pool in Basique, in map pixels. */
const COPING_PX = 6;

/**
 * The pools painted in the editor, as Basique shows them: the look of the water shader (tiled floor through the water,
 * coping of stones), still. No shader, no waves, no ice: Basique draws no water of the relief, but a pool
 * must not vanish from the map. Drawn once, again only when the relief or the styles change.
 */
export class BasicPools {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private drawnFor:
        | { terrain: TerrainData | undefined; styles: readonly PoolStyle[] | undefined; images: string }
        | undefined;

    constructor(scene: Phaser.Scene, depth: number) {
        this.graphics = scene.add.graphics().setDepth(depth).setVisible(false);
    }

    /** Shows the pools of `terrain`; true when something changed on screen. */
    public show(
        terrain: TerrainData | undefined,
        styles: readonly PoolStyle[] | undefined,
        images: { pools: readonly ImageArea[]; signature: string },
    ): boolean {
        const drawn = this.drawnFor;
        if (drawn && drawn.terrain === terrain && drawn.styles === styles && drawn.images === images.signature) {
            if (this.graphics.visible) return false;
            this.graphics.setVisible(true);
            return true;
        }
        this.drawnFor = { terrain, styles, images: images.signature };
        this.draw(terrain, styles, images.pools);
        this.graphics.setVisible(true);
        return true;
    }

    /** Hides them; true when they were shown. */
    public hide(): boolean {
        if (!this.graphics.visible) return false;
        this.graphics.setVisible(false);
        return true;
    }

    public destroy(): void {
        this.graphics.destroy();
    }

    private draw(
        terrain: TerrainData | undefined,
        styles: readonly PoolStyle[] | undefined,
        images: readonly ImageArea[],
    ): void {
        const graphics = this.graphics.clear();
        // The painted pools in their style, the pools placed as images in the default one (as the water shader).
        const cells = [
            ...poolCells(terrain, styles).map(({ cellX, cellY }) => ({
                cellX,
                cellY,
                style: poolStyleAt(styles, poolStyleOf(soilAt(terrain, cellX, cellY)) ?? 0),
            })),
            ...images.flatMap((pool) => cellsOf(pool).map((cell) => ({ ...cell, style: DEFAULT_POOL_STYLE }))),
        ];
        const inPool = new Set(cells.map((cell) => `${cell.cellX},${cell.cellY}`));
        for (const { cellX, cellY, style } of cells) {
            const water = rgbOf(style.water);
            const deep = Math.min(1, style.depthPx / 160);
            const x = cellX * TERRAIN_CELL;
            const y = cellY * TERRAIN_CELL;
            // The tiled floor seen through the water, as the water shader draws it (poolColor): the deeper, the more
            // the colour of the water; the grout of its 16 px tiles lighter.
            graphics.fillStyle(throughWater(FLOOR, water, deep), 1).fillRect(x, y, TERRAIN_CELL, TERRAIN_CELL);
            graphics.fillStyle(throughWater(GROUT, water, deep), 1);
            graphics.fillRect(x + TERRAIN_CELL - 1, y, 1, TERRAIN_CELL);
            graphics.fillRect(x, y + TERRAIN_CELL - 1, TERRAIN_CELL, 1);
            // The coping along the rim: stones of 8 px, their joints darker.
            const coping = rgbOf(style.coping);
            const sides = [
                { open: !inPool.has(`${cellX},${cellY - 1}`), rect: [x, y, TERRAIN_CELL, COPING_PX] },
                {
                    open: !inPool.has(`${cellX},${cellY + 1}`),
                    rect: [x, y + TERRAIN_CELL - COPING_PX, TERRAIN_CELL, COPING_PX],
                },
                { open: !inPool.has(`${cellX - 1},${cellY}`), rect: [x, y, COPING_PX, TERRAIN_CELL] },
                {
                    open: !inPool.has(`${cellX + 1},${cellY}`),
                    rect: [x + TERRAIN_CELL - COPING_PX, y, COPING_PX, TERRAIN_CELL],
                },
            ] as const;
            for (const { open, rect } of sides) {
                if (!open) continue;
                const [left, top, width, height] = rect;
                graphics.fillStyle(colourOf(coping), 1).fillRect(left, top, width, height);
                graphics.fillStyle(colourOf(coping.map((c) => c * 0.8)), 1);
                for (let stone = 8; stone < Math.max(width, height); stone += 8) {
                    if (width > height) graphics.fillRect(left + stone - 1, top, 1, height);
                    else graphics.fillRect(left, top + stone - 1, width, 1);
                }
            }
        }
    }
}

/** A pool placed as an image: its rectangle on the map, in map pixels. */
interface ImageArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The cells whose centre is in the rectangle of a pool placed as an image (as imagePoolCells). */
function cellsOf(pool: ImageArea): { cellX: number; cellY: number }[] {
    const cells: { cellX: number; cellY: number }[] = [];
    for (let cellY = Math.floor(pool.y / TERRAIN_CELL); (cellY + 0.5) * TERRAIN_CELL <= pool.y + pool.height; cellY++) {
        if ((cellY + 0.5) * TERRAIN_CELL < pool.y) continue;
        for (
            let cellX = Math.floor(pool.x / TERRAIN_CELL);
            (cellX + 0.5) * TERRAIN_CELL <= pool.x + pool.width;
            cellX++
        ) {
            if ((cellX + 0.5) * TERRAIN_CELL >= pool.x) cells.push({ cellX, cellY });
        }
    }
    return cells;
}

/** The floor of a pool and its grout, as the water shader (poolColor). */
const FLOOR = [0.9, 0.95, 0.96];
const GROUT = [0.72, 0.82, 0.86];

function throughWater(floor: readonly number[], water: readonly number[], deep: number): number {
    const share = 0.3 + 0.55 * deep;
    return colourOf(floor.map((f, i) => f * (water[i] * 0.6 + 0.4) * (1 - share) + water[i] * 0.55 * share));
}

function rgbOf(css: string): number[] {
    const value = Number.parseInt(css.replace("#", ""), 16);
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

function colourOf(rgb: readonly number[]): number {
    const byte = (c: number): number => Math.max(0, Math.min(255, Math.round(c * 255)));
    return (byte(rgb[0]) << 16) | (byte(rgb[1]) << 8) | byte(rgb[2]);
}
