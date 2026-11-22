import { cellKey, poolStyleOf, reliefCells, TERRAIN_CELL, TERRAIN_CHUNK, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";

/** A tile of the map (the floors of the Carte tool are laid by tiles): two cells of the relief each way. */
const TILE_CELLS = 32 / TERRAIN_CELL;

/** What is built on a map, as the relief seen in 3/4 needs it. */
export interface BuiltSources {
    /** The size of the map, in cells of the relief. */
    columns: number;
    rows: number;
    /** The tiles a floor of the Carte tool covers ("x,y", pavedTilesOf). */
    pavedTiles: Iterable<string>;
    /** Whether a point of the map (pixels) is inside a building. */
    isIndoorAt?: (x: number, y: number) => boolean;
    /** The pools placed as images, in map pixels. */
    pools?: readonly { x: number; y: number; width: number; height: number }[];
    /** The relief of the map, for the pools painted with the relief tool. */
    terrain?: TerrainData;
}

/**
 * The ground that is built, cell by cell: paved with the Carte tool, inside a building, or a pool. Its tiles, its
 * floors and its walls are drawn at their place whatever the relief under them (they are images of the map); so,
 * where the relief is seen in 3/4, that ground is seen flat, and what stands on it at its place: an avatar against a
 * wall is drawn against it, a desk where it blocks. With the cells around: the ground is drawn straight between the
 * centres of the cells, and must be flat all over a built cell.
 */
export class FlatGround {
    private constructor(
        private readonly columns: number,
        private readonly rows: number,
        private readonly cells: Uint8Array,
        private readonly count: number,
    ) {}

    public static of(sources: BuiltSources): FlatGround {
        const columns = Math.max(0, Math.floor(sources.columns));
        const rows = Math.max(0, Math.floor(sources.rows));
        const built = new Uint8Array(columns * rows);
        const mark = (cellX: number, cellY: number): void => {
            if (cellX >= 0 && cellY >= 0 && cellX < columns && cellY < rows) built[cellY * columns + cellX] = 1;
        };
        for (const tile of sources.pavedTiles) {
            const [tileX, tileY] = tile.split(",").map(Number);
            for (let y = 0; y < TILE_CELLS; y++) {
                for (let x = 0; x < TILE_CELLS; x++) mark(tileX * TILE_CELLS + x, tileY * TILE_CELLS + y);
            }
        }
        if (sources.isIndoorAt) {
            for (let cellY = 0; cellY < rows; cellY++) {
                for (let cellX = 0; cellX < columns; cellX++) {
                    if (sources.isIndoorAt((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL)) {
                        built[cellY * columns + cellX] = 1;
                    }
                }
            }
        }
        for (const pool of sources.pools ?? []) {
            const right = Math.ceil((pool.x + pool.width) / TERRAIN_CELL);
            const bottom = Math.ceil((pool.y + pool.height) / TERRAIN_CELL);
            for (let cellY = Math.floor(pool.y / TERRAIN_CELL); cellY < bottom; cellY++) {
                for (let cellX = Math.floor(pool.x / TERRAIN_CELL); cellX < right; cellX++) mark(cellX, cellY);
            }
        }
        for (const [chunk, soils] of Object.entries(sources.terrain?.soil ?? {})) {
            const [chunkX, chunkY] = chunk.split(",").map(Number);
            soils.forEach((code, index) => {
                if (poolStyleOf(code) === undefined) return;
                mark(
                    chunkX * TERRAIN_CHUNK + (index % TERRAIN_CHUNK),
                    chunkY * TERRAIN_CHUNK + Math.floor(index / TERRAIN_CHUNK),
                );
            });
        }
        // With the cells around what is built.
        const flat = new Uint8Array(columns * rows);
        let count = 0;
        for (let cellY = 0; cellY < rows; cellY++) {
            for (let cellX = 0; cellX < columns; cellX++) {
                if (!built[cellY * columns + cellX]) continue;
                for (let y = Math.max(0, cellY - 1); y <= Math.min(rows - 1, cellY + 1); y++) {
                    for (let x = Math.max(0, cellX - 1); x <= Math.min(columns - 1, cellX + 1); x++) {
                        if (!flat[y * columns + x]) count++;
                        flat[y * columns + x] = 1;
                    }
                }
            }
        }
        return new FlatGround(columns, rows, flat, count);
    }

    /** Whether a cell of the relief is seen flat: built, or next to a built one. */
    public has(cellX: number, cellY: number): boolean {
        if (cellX < 0 || cellY < 0 || cellX >= this.columns || cellY >= this.rows) return false;
        return this.cells[cellY * this.columns + cellX] === 1;
    }

    /** The same, at a point of the map (pixels). */
    public isFlatAt(x: number, y: number): boolean {
        return this.has(Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL));
    }

    public isEmpty(): boolean {
        return this.count === 0;
    }
}

/**
 * The relief as it is seen in 3/4: the relief of the map, flat under what is built. The map itself (the water of the
 * server, the relief drawn flat, the editor) keeps its own. The relief of the map itself when nothing built stands on
 * a relief.
 */
export function seenTerrain(terrain: TerrainData | undefined, flat: FlatGround): TerrainData | undefined {
    if (!terrain || flat.isEmpty()) return terrain;
    const flattened = new Map<string, number>();
    for (const cell of reliefCells(terrain).keys()) {
        const [cellX, cellY] = cell.split(",").map(Number);
        if (flat.has(cellX, cellY)) flattened.set(cellKey(cellX, cellY), 0);
    }
    return flattened.size === 0 ? terrain : withHeights(terrain, flattened);
}

/** What is built is looked at again this often (a floor laid by another player). */
const LOOK_MS = 500;

/**
 * The relief seen in 3/4 of a scene, kept while neither the relief of the map nor what is built on it changes
 * (`signature`: a text that changes with the floors, the walls and the pools). Before it was ever looked at
 * (`refresh`), the relief of the map itself.
 */
export class SeenRelief {
    private from: TerrainData | undefined;
    private signature: string | undefined;
    private seen: TerrainData | undefined;
    private flat: FlatGround | undefined;
    private lookedAt = -Infinity;

    constructor(
        private readonly deps: {
            terrain: () => TerrainData | undefined;
            signature: () => string;
            flat: () => FlatGround;
        },
    ) {}

    /** `now` in ms of the game. A relief edited is seen at once; what is built, within half a second. */
    public refresh(now: number): void {
        const terrain = this.deps.terrain();
        const due = now - this.lookedAt >= LOOK_MS;
        if (terrain === this.from && this.flat && !due) return;
        let rebuild = terrain !== this.from || !this.flat;
        // The pools painted with the relief tool are read in the relief.
        if (terrain !== this.from) this.flat = undefined;
        if (due) {
            this.lookedAt = now;
            const signature = this.deps.signature();
            if (signature !== this.signature) {
                this.signature = signature;
                this.flat = undefined;
                rebuild = true;
            }
        }
        if (!rebuild) return;
        this.signature ??= this.deps.signature();
        this.flat ??= this.deps.flat();
        this.from = terrain;
        this.seen = seenTerrain(terrain, this.flat);
    }

    public terrain(): TerrainData | undefined {
        return this.flat ? this.seen : this.deps.terrain();
    }

    /** Whether the ground at a point is seen flat: nothing there is drawn lower nor higher, the water neither. */
    public isFlatAt(x: number, y: number): boolean {
        return this.flat?.isFlatAt(x, y) ?? false;
    }
}

/**
 * The depths of the water over an area of cells, as the relief seen in 3/4 raises or lowers its surface: none over
 * what is built (`isFlatAt`, in map pixels), where the water is drawn at its place like its ground. Changed in place.
 */
export function depthsSeen(
    depths: Float32Array,
    isFlatAt: (x: number, y: number) => boolean,
    cellX: number,
    cellY: number,
    columns: number,
    rows: number,
): void {
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const at = row * columns + column;
            if (depths[at] === 0) continue;
            if (isFlatAt((cellX + column + 0.5) * TERRAIN_CELL, (cellY + row + 0.5) * TERRAIN_CELL)) depths[at] = 0;
        }
    }
}
