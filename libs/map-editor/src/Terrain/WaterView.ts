import type { WaterGridBounds } from "./WaterGrid";

/** A cell with less water than this is a film: it joins no water to another (FAR_MIN_DEPTH_PX of WaterGrid). */
export const WATER_FILM_PX = 2;
/** How many cells the level of a water at rest is read over, at most. */
export const REST_LEVEL_CELLS = 4096;

/**
 * The water of a map as what lives in it reads it: how deep each cell is, which sides the water crosses, and the
 * level a water rests at. The grid of the water answers (WaterGrid); so does a copy of it kept apart
 * (WaterSnapshotView), for readers that are not where the water is computed.
 */
export interface WaterView {
    readonly bounds: WaterGridBounds;
    depthAt(cellX: number, cellY: number): number;
    canCross(cellX: number, cellY: number, side: "east" | "west" | "south" | "north"): boolean;
    restLevelAt(cellX: number, cellY: number, reachCells?: number): number | undefined;
}

/** What the level of a water at rest is read from: the cells of a grid, row by row. */
export interface RestLevelFields {
    bounds: WaterGridBounds;
    depth: Float32Array;
    /** The ground as the water reads it: raised to the top of a ball where one stands. */
    ground: Float32Array;
    /** The ground without any ball, and the cells a ball closed; undefined on a grid no ball ever stood on. */
    bareGround: Float32Array | undefined;
    ballClosed: Uint8Array | undefined;
    /** The sides the water cannot cross: a bit for each, in the order east, west, south, north. */
    closed: Uint8Array;
}

/** What a search of the level keeps from one to the next: the search that last saw each cell. */
export interface RestLevelSearch {
    seen: Uint32Array;
    search: number;
}

/**
 * The level the water around a cell rests at, in pixels of altitude: the middle one of the surfaces of the water
 * joined to the cell (through the cells of a ball, through the water that is more than a film, and through the dry
 * cells within `reachCells` of it), never under the ground of the cell without its ball. The ground of the cell where
 * no water is joined to it; undefined outside the grid. See WaterGrid.restLevelAt.
 */
export function restLevelOf(
    fields: RestLevelFields,
    scratch: RestLevelSearch,
    cellX: number,
    cellY: number,
    reachCells = 0,
): number | undefined {
    const { width, height } = fields.bounds;
    const startColumn = cellX - fields.bounds.x;
    const startRow = cellY - fields.bounds.y;
    if (startColumn < 0 || startRow < 0 || startColumn >= width || startRow >= height) return undefined;
    const start = startRow * width + startColumn;
    const { depth, ground } = fields;
    const closed = fields.ballClosed;
    const bare = closed?.[start] && fields.bareGround ? fields.bareGround[start] : ground[start];
    const reach = Number.isFinite(reachCells) && reachCells > 0 ? reachCells : 0;
    if (reach === 0 && !closed?.[start] && depth[start] < WATER_FILM_PX) return bare;
    scratch.search++;
    if (scratch.search === 0xffffffff) {
        scratch.seen.fill(0);
        scratch.search = 1;
    }
    const seen = scratch.seen;
    const search = scratch.search;
    const cells = [start];
    seen[start] = search;
    const surfaces: number[] = [];
    for (let head = 0; head < cells.length && surfaces.length < REST_LEVEL_CELLS; head++) {
        const index = cells[head];
        if (!closed?.[index] && depth[index] >= WATER_FILM_PX) {
            surfaces.push(ground[index] + depth[index]);
        }
        const column = index % width;
        const row = (index - column) / width;
        for (let side = 0; side < 4; side++) {
            if (fields.closed[index] & (1 << side)) continue;
            const inside =
                side === 0 ? column + 1 < width : side === 1 ? column > 0 : side === 2 ? row + 1 < height : row > 0;
            if (!inside) continue;
            const next = index + (side === 0 ? 1 : side === 1 ? -1 : side === 2 ? width : -width);
            if (seen[next] === search) continue;
            // Through the cells of a ball, through the water that is more than a film, and through the dry
            // cells near the point.
            if (!closed?.[next] && depth[next] < WATER_FILM_PX) {
                const nextColumn = next % width;
                const away = Math.hypot(nextColumn - startColumn, (next - nextColumn) / width - startRow);
                if (away > reach) continue;
            }
            seen[next] = search;
            cells.push(next);
        }
    }
    if (surfaces.length === 0) return bare;
    // The middle one: the water a ball piles up in front of itself, and the hollow behind, are a few cells.
    surfaces.sort((a, b) => a - b);
    const middle = surfaces.length >> 1;
    const level = surfaces.length % 2 === 1 ? surfaces[middle] : (surfaces[middle - 1] + surfaces[middle]) / 2;
    return level > bare ? level : bare;
}

/** Where a snapshot keeps its numbers: [0] counts its writes (odd while one is written), then what it holds. */
const WRITES = 0;
const SHAPE = 1;
const VERSION = 2;
const HAS_BALLS = 3;
const HEADER = 4;

/**
 * A copy of the water of a grid, for readers that are not where it is computed: its depths at each publication, and
 * what changes seldom (the ground under the balls, the sides the doors close) when it changed. Its memory may be
 * shared between threads (`shared`): one writes it (WaterGrid.publish), the others read it (WaterSnapshotView).
 */
export class WaterSnapshot {
    public readonly header: Int32Array;
    public readonly depth: Float32Array;
    public readonly ground: Float32Array;
    public readonly bareGround: Float32Array;
    public readonly closed: Uint8Array;
    public readonly ballClosed: Uint8Array;

    private constructor(
        public readonly bounds: WaterGridBounds,
        public readonly buffers: WaterSnapshotBuffers,
    ) {
        this.header = new Int32Array(buffers.header);
        this.depth = new Float32Array(buffers.depth);
        this.ground = new Float32Array(buffers.ground);
        this.bareGround = new Float32Array(buffers.bareGround);
        this.closed = new Uint8Array(buffers.closed);
        this.ballClosed = new Uint8Array(buffers.ballClosed);
    }

    /** A snapshot for a grid of these bounds, in memory of its own or shared between threads. */
    public static allocate(bounds: WaterGridBounds, shared = false): WaterSnapshot {
        const size = bounds.width * bounds.height;
        const bytes = (length: number): ArrayBufferLike =>
            shared ? new SharedArrayBuffer(length) : new ArrayBuffer(length);
        return new WaterSnapshot(bounds, {
            header: bytes(HEADER * 4),
            depth: bytes(size * 4),
            ground: bytes(size * 4),
            bareGround: bytes(size * 4),
            closed: bytes(size),
            ballClosed: bytes(size),
        });
    }

    /** The same snapshot over buffers received from the thread that made it. */
    public static over(bounds: WaterGridBounds, buffers: WaterSnapshotBuffers): WaterSnapshot {
        return new WaterSnapshot(bounds, buffers);
    }

    /**
     * Writes the water of a grid: `shape` counts the changes of what changes seldom (they are copied only when it
     * moved), `version` is the number that changes whenever the water does (WaterSimulation.waterVersion).
     */
    public write(fields: RestLevelFields, shape: number, version: number): void {
        const header = this.header;
        Atomics.add(header, WRITES, 1);
        this.depth.set(fields.depth);
        if (header[SHAPE] !== shape || header[WRITES] === 1) {
            this.ground.set(fields.ground);
            this.closed.set(fields.closed);
            if (fields.bareGround && fields.ballClosed) {
                this.bareGround.set(fields.bareGround);
                this.ballClosed.set(fields.ballClosed);
            }
            header[HAS_BALLS] = fields.bareGround && fields.ballClosed ? 1 : 0;
            header[SHAPE] = shape;
        }
        header[VERSION] = version;
        Atomics.add(header, WRITES, 1);
    }

    /** How many times it was written: even once a write ended, 0 while it never was. */
    public writes(): number {
        return Atomics.load(this.header, WRITES);
    }

    public version(): number {
        return this.header[VERSION];
    }

    public shape(): number {
        return this.header[SHAPE];
    }

    public hasBalls(): boolean {
        return this.header[HAS_BALLS] === 1;
    }
}

/** The memory of a snapshot, as it goes from a thread to another. */
export interface WaterSnapshotBuffers {
    header: ArrayBufferLike;
    depth: ArrayBufferLike;
    ground: ArrayBufferLike;
    bareGround: ArrayBufferLike;
    closed: ArrayBufferLike;
    ballClosed: ArrayBufferLike;
}

/**
 * The water of a snapshot, read as a grid is. It keeps its own copy of the snapshot, taken whole by `refresh` (never
 * half written), so that a reader that loops over the cells sees one state of the water from end to end.
 */
export class WaterSnapshotView implements WaterView {
    public readonly bounds: WaterGridBounds;
    private readonly depth: Float32Array;
    private readonly ground: Float32Array;
    private readonly bareGround: Float32Array;
    private readonly closed: Uint8Array;
    private readonly ballClosed: Uint8Array;
    private balls = false;
    private readWrites = 0;
    private readShape = -1;
    private readVersion = 0;
    private readonly scratch: RestLevelSearch;

    constructor(private readonly snapshot: WaterSnapshot) {
        this.bounds = snapshot.bounds;
        const size = this.bounds.width * this.bounds.height;
        this.depth = new Float32Array(size);
        this.ground = new Float32Array(size);
        this.bareGround = new Float32Array(size);
        this.closed = new Uint8Array(size);
        this.ballClosed = new Uint8Array(size);
        this.scratch = { seen: new Uint32Array(size), search: 0 };
    }

    /**
     * Takes the snapshot as it was last written, whole: started again while a write is under way. True when the water
     * changed since the last time. Nothing is read of a snapshot never written.
     */
    public refresh(): boolean {
        const snapshot = this.snapshot;
        for (;;) {
            const writes = snapshot.writes();
            if (writes === this.readWrites) return false;
            // Odd: a write is under way. It is short: looked at again at once.
            if (writes & 1) continue;
            this.depth.set(snapshot.depth);
            const shape = snapshot.shape();
            const reshaped = shape !== this.readShape;
            if (reshaped) {
                this.ground.set(snapshot.ground);
                this.closed.set(snapshot.closed);
                this.balls = snapshot.hasBalls();
                if (this.balls) {
                    this.bareGround.set(snapshot.bareGround);
                    this.ballClosed.set(snapshot.ballClosed);
                }
            }
            const version = snapshot.version();
            if (snapshot.writes() !== writes) continue;
            this.readWrites = writes;
            this.readShape = shape;
            this.readVersion = version;
            return true;
        }
    }

    /** The number that changes whenever the water does, as of the last refresh. */
    public version(): number {
        return this.readVersion;
    }

    public depthAt(cellX: number, cellY: number): number {
        const column = cellX - this.bounds.x;
        const row = cellY - this.bounds.y;
        if (column < 0 || row < 0 || column >= this.bounds.width || row >= this.bounds.height) return 0;
        return this.depth[row * this.bounds.width + column];
    }

    public canCross(cellX: number, cellY: number, side: "east" | "west" | "south" | "north"): boolean {
        const column = cellX - this.bounds.x;
        const row = cellY - this.bounds.y;
        if (column < 0 || row < 0 || column >= this.bounds.width || row >= this.bounds.height) return false;
        const closed = this.closed[row * this.bounds.width + column];
        if (side === "east") return column + 1 < this.bounds.width && (closed & 1) === 0;
        if (side === "west") return column > 0 && (closed & 2) === 0;
        if (side === "south") return row + 1 < this.bounds.height && (closed & 4) === 0;
        return row > 0 && (closed & 8) === 0;
    }

    public restLevelAt(cellX: number, cellY: number, reachCells = 0): number | undefined {
        return restLevelOf(
            {
                bounds: this.bounds,
                depth: this.depth,
                ground: this.ground,
                bareGround: this.balls ? this.bareGround : undefined,
                ballClosed: this.balls ? this.ballClosed : undefined,
                closed: this.closed,
            },
            this.scratch,
            cellX,
            cellY,
            reachCells,
        );
    }
}
