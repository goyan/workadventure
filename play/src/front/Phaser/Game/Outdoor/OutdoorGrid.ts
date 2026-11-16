export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Walls and doors close a room; everything reachable from the map edge without crossing one is outdoors. */
export const OUTDOOR_WALL_COLLECTIONS: readonly string[] = [
    "Carte Murs",
    "Carte Portes",
    "Carte Fenêtres",
    "Infogène Murs fins",
];

const WALL = 1;
const OUTDOOR = 2;
/** In `rooms`: a cell that belongs to no room (outdoors or in a wall). */
const NO_ROOM = -1;

/**
 * Which cells of the map are outdoors. Outside the map counts as outdoors. The indoor cells are grouped in rooms: the
 * sets of cells reached from one another without crossing a wall.
 */
export class OutdoorGrid {
    private constructor(
        public readonly cols: number,
        public readonly rows: number,
        public readonly cellSize: number,
        private readonly cells: Uint8Array,
        private readonly rooms: Int32Array,
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
        return new OutdoorGrid(cols, rows, cellSize, cells, OutdoorGrid.numberRooms(cols, rows, cells));
    }

    /** Numbers the connected sets of cells that are neither a wall nor outdoors, from 0. */
    private static numberRooms(cols: number, rows: number, cells: Uint8Array): Int32Array {
        const rooms = new Int32Array(cols * rows).fill(NO_ROOM);
        let next = 0;
        const queue: number[] = [];
        for (let start = 0; start < cells.length; start++) {
            if (cells[start] !== 0 || rooms[start] !== NO_ROOM) continue;
            const room = next++;
            rooms[start] = room;
            queue.length = 0;
            queue.push(start);
            for (let head = 0; head < queue.length; head++) {
                const index = queue[head];
                const col = index % cols;
                const row = (index - col) / cols;
                const neighbours = [
                    col > 0 ? index - 1 : -1,
                    col < cols - 1 ? index + 1 : -1,
                    row > 0 ? index - cols : -1,
                    row < rows - 1 ? index + cols : -1,
                ];
                for (const neighbour of neighbours) {
                    if (neighbour < 0 || cells[neighbour] !== 0 || rooms[neighbour] !== NO_ROOM) continue;
                    rooms[neighbour] = room;
                    queue.push(neighbour);
                }
            }
        }
        return rooms;
    }

    /** Room (a closed set of indoor cells) under a point; undefined outdoors, in a wall or off the map. */
    roomAt(x: number, y: number): number | undefined {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return undefined;
        const room = this.rooms[row * this.cols + col];
        return room === NO_ROOM ? undefined : room;
    }

    /** Rooms with a cell within one cell of the rectangle (the rooms a wall borders). */
    roomsTouching(rect: Rect): ReadonlySet<number> {
        const found = new Set<number>();
        const size = this.cellSize;
        const firstCol = Math.max(0, Math.floor(rect.x / size) - 1);
        const lastCol = Math.min(this.cols - 1, Math.ceil((rect.x + rect.width) / size));
        const firstRow = Math.max(0, Math.floor(rect.y / size) - 1);
        const lastRow = Math.min(this.rows - 1, Math.ceil((rect.y + rect.height) / size));
        for (let row = firstRow; row <= lastRow; row++) {
            for (let col = firstCol; col <= lastCol; col++) {
                const room = this.rooms[row * this.cols + col];
                if (room !== NO_ROOM) found.add(room);
            }
        }
        return found;
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
