import * as Phaser from "phaser";
import { DEPTH_TILE_INDEX } from "../DepthIndexes";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";

/** The ground is drawn at 4 px per cell (1/8 of a 32 px cell), then stretched: the smoothing softens the edges. */
const PX_PER_CELL = 4;
const SNOW_COLOR = "#dde3f4";
const GRAIN_COLOR = "#d0d7ee";

let groundCount = 0;

/** A layer of snow over the outdoor cells, above the map tiles and below every object and avatar. */
export class SnowGround {
    private image: Phaser.GameObjects.Image | undefined;
    private textureKey: string | undefined;
    private visible = true;

    constructor(private readonly scene: Phaser.Scene) {}

    draw(grid: OutdoorGrid): void {
        this.clear();
        const width = grid.cols * PX_PER_CELL;
        const height = grid.rows * PX_PER_CELL;
        if (width === 0 || height === 0) return;
        const key = `xmas-ground-${++groundCount}`;
        const canvas = this.scene.textures.createCanvas(key, width, height);
        const context = canvas?.getContext();
        if (!canvas || !context) return;
        this.textureKey = key;
        context.fillStyle = SNOW_COLOR;
        const mapView = { x: 0, y: 0, width: grid.cols * grid.cellSize, height: grid.rows * grid.cellSize };
        const scale = PX_PER_CELL / grid.cellSize;
        for (const run of grid.outdoorRunsInView(mapView)) {
            context.fillRect(run.x * scale, run.y * scale, run.width * scale, run.height * scale);
        }
        // A discreet grain: about one pixel in twelve, the same on every computer.
        context.fillStyle = GRAIN_COLOR;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grainAt(x, y) && grid.isOutdoorCell(Math.floor(x / PX_PER_CELL), Math.floor(y / PX_PER_CELL))) {
                    context.fillRect(x, y, 1, 1);
                }
            }
        }
        canvas.refresh();
        canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.image = this.scene.add.image(0, 0, key);
        this.image.setOrigin(0);
        this.image.setDisplaySize(mapView.width, mapView.height);
        this.image.setDepth(DEPTH_TILE_INDEX + 0.5);
        this.image.setVisible(this.visible);
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        this.image?.setVisible(visible);
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

function grainAt(x: number, y: number): boolean {
    return Math.floor(Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) * 12) % 12 === 0;
}
