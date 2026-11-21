import type * as Phaser from "phaser";

/** Over the water and the pools (the water shader is at TERRAIN_DEPTH + 0.01), under the objects and the avatars. */
const LADDER_DEPTH = 0.675;
/** A top edge this long (cells) or longer gets two ladders, at its quarters; shorter, one in its middle. */
const TWO_LADDERS_CELLS = 8;
/** How wide the coping of a pool is, in map pixels, as the water shader draws it (poolAround(world, 6.0)). */
const COPING_PX = 6;
const STEEL = 0xd5dde4;
const STEEL_SHADE = 0x7d8894;
const STEEL_LIGHT = 0xffffff;

/** A run of cells along the top edge of a pool: the row of the first cells of the pool under a cell that is not one. */
export interface PoolEdge {
    /** First cell and number of cells, in cells of the canvas, and the row. */
    column: number;
    length: number;
    row: number;
    /** How many ladders its pool asks for (its style): 0, 1 or 2. */
    ladders: number;
}

/**
 * The top edges of the pools of a canvas: in each row, the runs of pool cells with no pool cell above them. `pools`
 * holds on each pool cell the number of ladders its pool asks for, plus one (0: not a pool).
 */
export function topEdgesOf(pools: Uint8Array, columns: number, rows: number): PoolEdge[] {
    const edges: PoolEdge[] = [];
    for (let row = 1; row < rows; row++) {
        let start = -1;
        for (let column = 0; column <= columns; column++) {
            const edge =
                column < columns && pools[row * columns + column] > 0 && pools[(row - 1) * columns + column] === 0;
            if (edge && start < 0) start = column;
            if (!edge && start >= 0) {
                edges.push({ column: start, length: column - start, row, ladders: pools[row * columns + start] - 1 });
                start = -1;
            }
        }
    }
    return edges;
}

/**
 * Where the ladders of an edge go, in cells of the canvas: as many as its pool asks for, one in its middle, two at its
 * quarters (one only on an edge too short for two).
 */
export function laddersOf(edge: PoolEdge): number[] {
    if (edge.length < 3 || edge.ladders <= 0) return [];
    if (edge.ladders === 1 || edge.length < TWO_LADDERS_CELLS) return [edge.column + edge.length / 2];
    return [edge.column + edge.length / 4, edge.column + (3 * edge.length) / 4];
}

/**
 * Where the ladders of an edge go, in cells of the canvas: those put by hand on it (`hand`: the keys "x,y" of the
 * cells of the map), else those its style asks for.
 */
export function edgeLadders(
    edge: PoolEdge,
    area: { x: number; y: number; cell: number },
    hand: ReadonlySet<string>,
): number[] {
    const firstColumn = Math.round(area.x / area.cell);
    const row = Math.round(area.y / area.cell) + edge.row;
    const placed: number[] = [];
    for (let column = edge.column; column < edge.column + edge.length; column++) {
        if (hand.has(`${firstColumn + column},${row}`)) placed.push(column + 0.5);
    }
    return placed.length > 0 ? placed : laddersOf(edge);
}

/**
 * The ladders of the pools drawn by the shaders, as on a real pool: two steel rails curving over the coping of the
 * top edge and going down into the water, with their rungs. Drawn again with the ground.
 */
export class PoolLadders {
    private readonly graphics: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene) {
        this.graphics = scene.add.graphics().setDepth(LADDER_DEPTH);
    }

    public draw(
        area: { x: number; y: number; cell: number },
        edges: readonly PoolEdge[],
        hand: ReadonlySet<string> = new Set(),
    ): void {
        const graphics = this.graphics.clear();
        for (const edge of edges) {
            for (const at of edgeLadders(edge, area, hand)) {
                const x = Math.round(area.x + at * area.cell);
                // Under the coping the shader draws along the rim (COPING_PX inside the pool).
                const y = Math.round(area.y + edge.row * area.cell) + COPING_PX;
                drawLadder(graphics, x, y);
            }
        }
    }

    public hide(): void {
        this.graphics.clear();
    }

    public destroy(): void {
        this.graphics.destroy();
    }
}

/** One ladder, its middle at `x`, the inner edge of the coping at `y` (pixel art, 10 px wide). */
function drawLadder(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    for (const rail of [x - 5, x + 3]) {
        // The rail curves over the coping (its top bend lit), then goes down into the water, fading under it.
        graphics.fillStyle(STEEL_SHADE, 1).fillRect(rail, y - 6, 2, 8);
        graphics.fillStyle(STEEL, 1).fillRect(rail, y - 7, 2, 7);
        graphics.fillStyle(STEEL_LIGHT, 1).fillRect(rail, y - 8, 2, 1);
        graphics.fillStyle(STEEL, 0.75).fillRect(rail, y, 2, 6);
        graphics.fillStyle(STEEL, 0.45).fillRect(rail, y + 6, 2, 6);
        // Its foot in the coping.
        graphics.fillStyle(STEEL_SHADE, 1).fillRect(rail - 1, y - 9, 4, 2);
    }
    // The rungs, under the water, fainter as they go down.
    for (const [step, alpha] of [
        [2, 0.8],
        [6, 0.6],
        [10, 0.4],
    ] as const) {
        graphics.fillStyle(STEEL, alpha).fillRect(x - 3, y + step, 6, 1);
        graphics.fillStyle(STEEL_SHADE, alpha * 0.8).fillRect(x - 3, y + step + 1, 6, 1);
    }
}
