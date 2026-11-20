interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Side of the cells the cover is kept in, in map pixels: a quarter of a tile. */
export const COVER_CELL = 8;
const KEY_SPAN = 1 << 20;

/**
 * What is drawn over the outdoors without being outdoors: the slabs of a raised floor that stands in a room, and the
 * walls two tiles high or more, whose images reach north of the tiles they stand on. The weather leaves them alone,
 * as it leaves the rooms. Kept as a set of small cells, so that asking about a point costs nothing.
 */
export class RaisedCover {
    private readonly cells = new Set<number>();

    private static key(column: number, row: number): number {
        return row * KEY_SPAN + column;
    }

    /** Whether this cover holds exactly the cells of another: what was read from it can be kept. */
    public sameAs(other: RaisedCover): boolean {
        if (other.cells.size !== this.cells.size) return false;
        for (const cell of this.cells) if (!other.cells.has(cell)) return false;
        return true;
    }

    public get empty(): boolean {
        return this.cells.size === 0;
    }

    /** Covers the cells whose centre is in the rectangle. */
    public add(rect: Rect): void {
        const left = Math.max(0, Math.ceil(rect.x / COVER_CELL - 0.5));
        const right = Math.ceil((rect.x + rect.width) / COVER_CELL - 0.5);
        const top = Math.max(0, Math.ceil(rect.y / COVER_CELL - 0.5));
        const bottom = Math.ceil((rect.y + rect.height) / COVER_CELL - 0.5);
        for (let row = top; row < bottom; row++) {
            for (let column = left; column < right; column++) this.cells.add(RaisedCover.key(column, row));
        }
    }

    public has(x: number, y: number): boolean {
        if (x < 0 || y < 0) return false;
        return this.cells.has(RaisedCover.key(Math.floor(x / COVER_CELL), Math.floor(y / COVER_CELL)));
    }

    /**
     * The rectangles (outdoor runs of the map) without what is covered: a rectangle the cover does not touch is kept
     * as it is, the others are cut in strips one cell high.
     */
    public uncovered(rects: readonly Rect[]): Rect[] {
        if (this.empty) return [...rects];
        const out: Rect[] = [];
        for (const rect of rects) {
            const left = Math.floor(rect.x / COVER_CELL);
            const right = Math.ceil((rect.x + rect.width) / COVER_CELL);
            const top = Math.floor(rect.y / COVER_CELL);
            const bottom = Math.ceil((rect.y + rect.height) / COVER_CELL);
            let touched = false;
            for (let row = top; row < bottom && !touched; row++) {
                for (let column = left; column < right; column++) {
                    if (this.cells.has(RaisedCover.key(column, row))) {
                        touched = true;
                        break;
                    }
                }
            }
            if (!touched) {
                out.push(rect);
                continue;
            }
            for (let row = top; row < bottom; row++) {
                const y = Math.max(rect.y, row * COVER_CELL);
                const height = Math.min(rect.y + rect.height, (row + 1) * COVER_CELL) - y;
                let start: number | undefined;
                for (let column = left; column <= right; column++) {
                    const free = column < right && !this.cells.has(RaisedCover.key(column, row));
                    if (free && start === undefined) start = column;
                    if (!free && start !== undefined) {
                        const x = Math.max(rect.x, start * COVER_CELL);
                        const end = Math.min(rect.x + rect.width, column * COVER_CELL);
                        if (end > x && height > 0) out.push({ x, y, width: end - x, height });
                        start = undefined;
                    }
                }
            }
        }
        return out;
    }
}
