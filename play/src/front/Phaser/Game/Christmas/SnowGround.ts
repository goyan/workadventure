import { GROUND_TEXTURES, TexturedGround } from "@wa/front/Phaser/Game/Terrain/TexturedGround";
import { DEPTH_SNOW_GROUND_INDEX } from "../DepthIndexes";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";

/** Snow textured beyond each edge of the screen, in cells: a short scroll keeps the same drawing. */
const MARGIN_CELLS = 6;

/**
 * A layer of snow over the outdoor cells, above the map tiles and below every object and avatar: the snow texture,
 * sharp and fixed to the map, shown where the cells are snowy through a smooth mask (soft edges along the walls).
 * Only the part of the map around the screen is laid, again when the view leaves it.
 */
export class SnowGround {
    private readonly ground: TexturedGround;
    private grid: OutdoorGrid | undefined;
    private snowy: Uint8Array = new Uint8Array(0);
    private window: { col: number; row: number; cols: number; rows: number } | undefined;
    private visible = true;
    private alpha = 1;
    /** Changes with the grid: the pieces of the snow mask are kept while it does not. */
    private stamp = 0;

    constructor(private readonly scene: Phaser.Scene) {
        this.ground = new TexturedGround(scene, GROUND_TEXTURES.snow, DEPTH_SNOW_GROUND_INDEX);
    }

    draw(grid: OutdoorGrid): void {
        this.grid = grid;
        this.snowy = snowyCells(grid);
        this.stamp++;
        this.window = undefined;
        this.follow();
    }

    /** Lays the snow around the screen when the view left what was laid; true when it was laid again. */
    follow(): boolean {
        const grid = this.grid;
        if (!grid || grid.cols === 0 || grid.rows === 0 || !this.visible) return false;
        const view = this.scene.cameras.main.worldView;
        const size = grid.cellSize;
        const col = Math.max(0, Math.floor(view.x / size) - MARGIN_CELLS);
        const row = Math.max(0, Math.floor(view.y / size) - MARGIN_CELLS);
        const last = this.window;
        const inside =
            last &&
            col >= last.col &&
            row >= last.row &&
            Math.ceil(view.right / size) <= last.col + last.cols &&
            Math.ceil(view.bottom / size) <= last.row + last.rows;
        if (inside) return false;
        const cols = Math.min(grid.cols - col, Math.ceil(view.width / size) + 2 * MARGIN_CELLS + 1);
        const rows = Math.min(grid.rows - row, Math.ceil(view.height / size) + 2 * MARGIN_CELLS + 1);
        if (cols <= 0 || rows <= 0) return false;
        this.window = { col, row, cols, rows };
        const snowy = this.snowy;
        this.ground.show(
            { x: col * size, y: row * size, columns: cols, rows, cell: size },
            (index) => {
                const cell = (row + Math.floor(index / cols)) * grid.cols + col + (index % cols);
                return snowy[cell] ?? 0;
            },
            this.stamp,
            this.alpha,
        );
        return true;
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        if (!visible) {
            this.ground.hide();
            this.window = undefined;
        } else this.follow();
    }

    setAlpha(alpha: number): void {
        this.alpha = alpha;
        this.ground.setAlpha(alpha);
    }

    destroy(): void {
        this.ground.destroy();
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
