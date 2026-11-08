export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Walls and doors close a room; everything reachable from the map edge without crossing one is outdoors. */
export const OUTDOOR_WALL_COLLECTIONS: readonly string[] = ["Carte Murs", "Carte Portes", "Infogène Murs fins"];

const WALL = 1;
const OUTDOOR = 2;

/** Which cells of the map are outdoors. Outside the map counts as outdoors. */
export class OutdoorGrid {
    private constructor(
        public readonly cols: number,
        public readonly rows: number,
        public readonly cellSize: number,
        private readonly cells: Uint8Array,
    ) {}

    static fromWalls(mapWidth: number, mapHeight: number, cellSize: number, walls: Iterable<Rect>): OutdoorGrid {
        const cols = Math.max(0, Math.ceil(mapWidth / cellSize));
        const rows = Math.max(0, Math.ceil(mapHeight / cellSize));
        const cells = new Uint8Array(cols * rows);
        for (const wall of walls) {
            if (wall.width <= 0 || wall.height <= 0) continue;
            // A cell is a wall when the rectangle overlaps its inside, not just one of its edges.
            const firstCol = Math.max(0, Math.floor(wall.x / cellSize));
            const lastCol = Math.min(cols - 1, Math.ceil((wall.x + wall.width) / cellSize) - 1);
            const firstRow = Math.max(0, Math.floor(wall.y / cellSize));
            const lastRow = Math.min(rows - 1, Math.ceil((wall.y + wall.height) / cellSize) - 1);
            for (let row = firstRow; row <= lastRow; row++) {
                for (let col = firstCol; col <= lastCol; col++) cells[row * cols + col] = WALL;
            }
        }
        const queue: number[] = [];
        const visit = (col: number, row: number): void => {
            const index = row * cols + col;
            if (cells[index] !== 0) return;
            cells[index] = OUTDOOR;
            queue.push(index);
        };
        for (let col = 0; col < cols; col++) {
            visit(col, 0);
            visit(col, rows - 1);
        }
        for (let row = 0; row < rows; row++) {
            visit(0, row);
            visit(cols - 1, row);
        }
        for (let next = 0; next < queue.length; next++) {
            const index = queue[next];
            const col = index % cols;
            const row = (index - col) / cols;
            if (col > 0) visit(col - 1, row);
            if (col < cols - 1) visit(col + 1, row);
            if (row > 0) visit(col, row - 1);
            if (row < rows - 1) visit(col, row + 1);
        }
        return new OutdoorGrid(cols, rows, cellSize, cells);
    }

    isOutdoorCell(col: number, row: number): boolean {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
        return this.cells[row * this.cols + col] === OUTDOOR;
    }

    isOutdoorAt(x: number, y: number): boolean {
        return this.isOutdoorCell(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    }

    /** Horizontal runs of visible outdoor cells inside the map, in world pixels. */
    outdoorRunsInView(view: Rect): Rect[] {
        const size = this.cellSize;
        const firstCol = Math.max(0, Math.floor(view.x / size));
        const lastCol = Math.min(this.cols - 1, Math.ceil((view.x + view.width) / size) - 1);
        const firstRow = Math.max(0, Math.floor(view.y / size));
        const lastRow = Math.min(this.rows - 1, Math.ceil((view.y + view.height) / size) - 1);
        const runs: Rect[] = [];
        for (let row = firstRow; row <= lastRow; row++) {
            let start = -1;
            for (let col = firstCol; col <= lastCol + 1; col++) {
                const outdoor = col <= lastCol && this.isOutdoorCell(col, row);
                if (outdoor && start < 0) start = col;
                if (!outdoor && start >= 0) {
                    runs.push({ x: start * size, y: row * size, width: (col - start) * size, height: size });
                    start = -1;
                }
            }
        }
        return runs;
    }
}
