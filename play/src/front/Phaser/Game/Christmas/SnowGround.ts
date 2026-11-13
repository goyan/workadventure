import * as Phaser from "phaser";
import { DEPTH_TILE_INDEX } from "../DepthIndexes";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";

/** The ground is drawn at 1/8 of the map size, then stretched: the smoothing softens the edges. */
const GROUND_SCALE = 1 / 8;
const SNOW_COLOR = "#dde3f4";
const GRAIN_COLOR = "#d0d7ee";

let groundCount = 0;

/** A layer of snow over the outdoor cells, above the map tiles and below every object and avatar. */
export class SnowGround {
    private image: Phaser.GameObjects.Image | undefined;
    private textureKey: string | undefined;
    private visible = true;
    private alpha = 1;

    constructor(private readonly scene: Phaser.Scene) {}

    draw(grid: OutdoorGrid): void {
        this.clear();
        const pxPerCell = grid.cellSize * GROUND_SCALE;
        const width = Math.ceil(grid.cols * pxPerCell);
        const height = Math.ceil(grid.rows * pxPerCell);
        if (width === 0 || height === 0) return;
        const key = `xmas-ground-${++groundCount}`;
        const canvas = this.scene.textures.createCanvas(key, width, height);
        const context = canvas?.getContext();
        if (!canvas || !context) return;
        this.textureKey = key;
        const snowy = snowyCells(grid);
        context.fillStyle = SNOW_COLOR;
        for (let row = 0; row < grid.rows; row++) {
            let start = -1;
            for (let col = 0; col <= grid.cols; col++) {
                const isSnowy = col < grid.cols && snowy[row * grid.cols + col] === 1;
                if (isSnowy && start < 0) start = col;
                if (!isSnowy && start >= 0) {
                    context.fillRect(start * pxPerCell, row * pxPerCell, (col - start) * pxPerCell, pxPerCell);
                    start = -1;
                }
            }
        }
        // A discreet grain: about one pixel in twelve, the same on every computer.
        context.fillStyle = GRAIN_COLOR;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = Math.floor(y / pxPerCell) * grid.cols + Math.floor(x / pxPerCell);
                if (grainAt(x, y) && snowy[cell] === 1) context.fillRect(x, y, 1, 1);
            }
        }
        const mapView = { width: grid.cols * grid.cellSize, height: grid.rows * grid.cellSize };
        canvas.refresh();
        canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.image = this.scene.add.image(0, 0, key);
        this.image.setOrigin(0);
        this.image.setDisplaySize(mapView.width, mapView.height);
        // Between the map tiles (below 0) and the floor tiles (MAP_LAYER_FLOOR_DEPTH = 0.5): paving stays on top.
        this.image.setDepth(DEPTH_TILE_INDEX + 0.25);
        this.image.setVisible(this.visible);
        this.image.setAlpha(this.alpha);
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        this.image?.setVisible(visible);
    }

    setAlpha(alpha: number): void {
        this.alpha = alpha;
        this.image?.setAlpha(alpha);
    }

    destroy(): void {
        this.clear();
    }

    private clear(): void {
        this.image?.destroy();
        this.image = undefined;
        if (this.textureKey && this.scene.textures.exists(this.textureKey)) this.scene.textures.remove(this.textureKey);
        this.textureKey = undefined;
    }
}

/**
 * Outdoor cells, plus the wall cells touching them: a wall rarely starts on a cell edge, and the wall image hides
 * the snow under it. An indoor cell never touches an outdoor one (the fill would have reached it), so rooms stay bare.
 */
function snowyCells(grid: OutdoorGrid): Uint8Array {
    const snowy = new Uint8Array(grid.cols * grid.rows);
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const touchesOutside =
                grid.isOutdoorCell(col, row) ||
                grid.isOutdoorCell(col - 1, row) ||
                grid.isOutdoorCell(col + 1, row) ||
                grid.isOutdoorCell(col, row - 1) ||
                grid.isOutdoorCell(col, row + 1);
            if (touchesOutside) snowy[row * grid.cols + col] = 1;
        }
    }
    return snowy;
}

function grainAt(x: number, y: number): boolean {
    return Math.floor(Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) * 12) % 12 === 0;
}
