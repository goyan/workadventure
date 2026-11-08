import { OUTDOOR_WALL_COLLECTIONS, OutdoorGrid, type Rect } from "./OutdoorGrid";

/** Cell size of the team maps. */
/** 8 px: the team map puts its walls at x = 26 (mod 32), a 32 px cell left a strip of bare grass beside them. */
export const OUTDOOR_CELL_SIZE = 8;
/** Wait this long after the last wall change, so a wall being dragged is not recomputed at every frame. */
export const OUTDOOR_SETTLE_MS = 300;
const READ_INTERVAL_MS = 100;

export type OutdoorEntity = { collectionName: string } & Rect;

/** Keeps the outdoor grid in line with the walls and doors placed on the map, which the map editor can change. */
export class OutdoorTracker {
    private _grid: OutdoorGrid | undefined;
    private _version = 0;
    private computedSignature: string | undefined;
    private pendingSignature: string | undefined;
    private pendingSince = 0;
    private lastReadAt = -Infinity;

    constructor(
        private readonly readEntities: () => Iterable<OutdoorEntity>,
        private readonly mapSize: () => { width: number; height: number },
        private readonly now: () => number = () => performance.now(),
    ) {}

    get grid(): OutdoorGrid | undefined {
        return this._grid;
    }

    get version(): number {
        return this._version;
    }

    update(): void {
        const now = this.now();
        if (this._grid && now - this.lastReadAt < READ_INTERVAL_MS) return;
        this.lastReadAt = now;
        const walls = this.readWalls();
        const size = this.mapSize();
        const signature = `${size.width}x${size.height}|${walls
            .map((wall) => `${wall.x},${wall.y},${wall.width},${wall.height}`)
            .sort()
            .join(";")}`;
        if (!this._grid) {
            this.compute(walls, signature);
            return;
        }
        if (signature === this.computedSignature) {
            this.pendingSignature = undefined;
            return;
        }
        if (signature !== this.pendingSignature) {
            this.pendingSignature = signature;
            this.pendingSince = now;
            return;
        }
        if (now - this.pendingSince >= OUTDOOR_SETTLE_MS) this.compute(walls, signature);
    }

    private readWalls(): Rect[] {
        const walls: Rect[] = [];
        for (const entity of this.readEntities()) {
            if (OUTDOOR_WALL_COLLECTIONS.includes(entity.collectionName)) {
                walls.push({ x: entity.x, y: entity.y, width: entity.width, height: entity.height });
            }
        }
        return walls;
    }

    private compute(walls: Rect[], signature: string): void {
        const size = this.mapSize();
        this._grid = OutdoorGrid.fromWalls(size.width, size.height, OUTDOOR_CELL_SIZE, walls);
        this._version++;
        this.computedSignature = signature;
        this.pendingSignature = undefined;
    }
}

/** The part of a map entity needed to place it on the outdoor grid (an `Entity` fits). */
export interface OutdoorSourceEntity {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    scaleX: number;
    scaleY: number;
    getPrefab(): { collectionName: string; imagePath: string };
}

/**
 * Where an entity stands, sized by its prefab image: an opening door swaps to a taller frame, which must neither
 * reopen the room nor trigger a recomputation at every passage.
 */
export function entityOutdoorRect(
    entity: OutdoorSourceEntity,
    prefabFrameSize: (imagePath: string) => { width: number; height: number } | undefined,
): OutdoorEntity {
    const prefab = entity.getPrefab();
    const frame = prefabFrameSize(prefab.imagePath);
    return {
        collectionName: prefab.collectionName,
        x: entity.x,
        y: entity.y,
        width: frame ? frame.width * entity.scaleX : entity.displayWidth,
        height: frame ? frame.height * entity.scaleY : entity.displayHeight,
    };
}
