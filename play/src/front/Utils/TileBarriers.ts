/**
 * Thin walls between tiles. A barrier is not a volume nor a tile: it is a line on the border of two tiles that
 * nobody can cross, like the walls of the map layer, while the tiles on both sides stay free.
 */
export class TileBarriers {
    /** The tiles that have a barrier on their south border, i.e. between (x, y) and (x, y + 1). */
    private readonly south = new Set<number>();
    /** The tiles that have a barrier on their west border, i.e. between (x - 1, y) and (x, y). */
    private readonly west = new Set<number>();

    /** @param halfThickness How far the walls drawn on the borders reach on each side of them, in pixels. */
    constructor(public readonly halfThickness = 0) {}

    public static readonly NONE = new TileBarriers();

    private static key(x: number, y: number): number {
        // Maps are far smaller than 65536 tiles wide, and a wall can sit one tile outside of them.
        return (y + 1) * 65536 + (x + 1);
    }

    public addSouthBorder(x: number, y: number): void {
        this.south.add(TileBarriers.key(x, y));
    }

    public addWestBorder(x: number, y: number): void {
        this.west.add(TileBarriers.key(x, y));
    }

    /** Whether a barrier lies between two tiles that share a side. */
    private isSeparated(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
        if (a.x === b.x) {
            return this.south.has(TileBarriers.key(a.x, Math.min(a.y, b.y)));
        }
        return this.west.has(TileBarriers.key(Math.max(a.x, b.x), a.y));
    }

    /**
     * Whether a barrier is in the way of a move to a neighbouring tile. A diagonal move passes by the corner of the
     * tiles: it is blocked as soon as one of the four sides around that corner has a barrier.
     */
    public blocksMove(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
        if (from.x === to.x || from.y === to.y) {
            return this.isSeparated(from, to);
        }
        const horizontalFirst = { x: to.x, y: from.y };
        const verticalFirst = { x: from.x, y: to.y };
        return (
            this.isSeparated(from, horizontalFirst) ||
            this.isSeparated(horizontalFirst, to) ||
            this.isSeparated(from, verticalFirst) ||
            this.isSeparated(verticalFirst, to)
        );
    }

    /** Whether any side of a tile has a barrier. */
    public touchesTile(x: number, y: number): boolean {
        return (
            this.south.has(TileBarriers.key(x, y)) ||
            this.south.has(TileBarriers.key(x, y - 1)) ||
            this.west.has(TileBarriers.key(x, y)) ||
            this.west.has(TileBarriers.key(x + 1, y))
        );
    }
}
