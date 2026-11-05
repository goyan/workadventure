/** A rectangle in world pixels. */
export interface ObstacleRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The body of the avatar, relative to its feet: the point the pathfinder moves. */
export interface FeetBody {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
}

type Point = { x: number; y: number };

/** Index cell size, in pixels: a tile. */
const CELL = 32;

/**
 * Pixel obstacles for the pathfinder: the hitboxes of the objects (pools, thin walls, furniture...). Their tiles are
 * free in the 32 px collision grid, so without them the pathfinder walked straight through them and the computed walk
 * was then refused. Each rectangle is grown by the body of the avatar, so that the obstacles are checked against its
 * feet only, and indexed by tile so that the A* only looks at the rectangles near the tiles it crosses.
 */
export class RectangleObstacles {
    public static readonly NONE = new RectangleObstacles([], { offsetX: 0, offsetY: 0, width: 0, height: 0 });

    /** Feet positions that make the body touch each rectangle: open boxes, a body only touching an edge passes. */
    private readonly cells = new Map<number, ObstacleRectangle[]>();

    constructor(rectangles: readonly ObstacleRectangle[], body: FeetBody) {
        for (const rectangle of rectangles) {
            const grown = {
                x: rectangle.x - body.offsetX - body.width,
                y: rectangle.y - body.offsetY - body.height,
                width: rectangle.width + body.width,
                height: rectangle.height + body.height,
            };
            for (let cy = Math.floor(grown.y / CELL); cy <= Math.floor((grown.y + grown.height) / CELL); cy += 1) {
                for (let cx = Math.floor(grown.x / CELL); cx <= Math.floor((grown.x + grown.width) / CELL); cx += 1) {
                    const key = RectangleObstacles.key(cx, cy);
                    this.cells.set(key, [...(this.cells.get(key) ?? []), grown]);
                }
            }
        }
    }

    /** Whether the body touches an obstacle when the feet are at this point. */
    public blocksPoint(feet: Point): boolean {
        return (this.cells.get(RectangleObstacles.cellOf(feet)) ?? []).some((box) => isInside(feet, box));
    }

    /** Whether the body touches an obstacle while the feet go straight from one point to the other. */
    public blocksSegment(from: Point, to: Point): boolean {
        if (this.cells.size === 0) {
            return false;
        }
        const checked = new Set<ObstacleRectangle>();
        const minX = Math.floor(Math.min(from.x, to.x) / CELL);
        const maxX = Math.floor(Math.max(from.x, to.x) / CELL);
        const minY = Math.floor(Math.min(from.y, to.y) / CELL);
        const maxY = Math.floor(Math.max(from.y, to.y) / CELL);
        for (let cy = minY; cy <= maxY; cy += 1) {
            for (let cx = minX; cx <= maxX; cx += 1) {
                for (const box of this.cells.get(RectangleObstacles.key(cx, cy)) ?? []) {
                    if (checked.has(box)) continue;
                    checked.add(box);
                    if (segmentCrossesBox(from, to, box)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static cellOf(point: Point): number {
        return RectangleObstacles.key(Math.floor(point.x / CELL), Math.floor(point.y / CELL));
    }

    private static key(cx: number, cy: number): number {
        // Offset so that the cells just outside of the map (a rectangle grown over the edge) get their own key.
        return (cy + 2) * 65536 + (cx + 2);
    }
}

function isInside(point: Point, box: ObstacleRectangle): boolean {
    return point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height;
}

/** Slab test: whether the segment goes through the inside of the box (touching its border does not count). */
function segmentCrossesBox(from: Point, to: Point, box: ObstacleRectangle): boolean {
    let enter = 0;
    let exit = 1;
    const axes: [number, number, number, number][] = [
        [from.x, to.x - from.x, box.x, box.x + box.width],
        [from.y, to.y - from.y, box.y, box.y + box.height],
    ];
    for (const [start, delta, min, max] of axes) {
        if (delta === 0) {
            if (start <= min || start >= max) return false;
            continue;
        }
        const t1 = (min - start) / delta;
        const t2 = (max - start) / delta;
        enter = Math.max(enter, Math.min(t1, t2));
        exit = Math.min(exit, Math.max(t1, t2));
    }
    return enter < exit;
}
