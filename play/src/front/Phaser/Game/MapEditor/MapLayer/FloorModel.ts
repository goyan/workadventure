import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";
import type { FloorFamily } from "./MapLayerCatalog";
import { parseFloorPiece, stairGroundBox, stairRun, stairScreenBox } from "./MapLayerFloors";
import type { PixelBox, StairShape, TilePoint } from "./MapLayerFloors";
import type { PlacedPrefabLike } from "./MapLayerOperations";

/** A placed entity as the floors read it: with the altitude it stands at (absent on the ground). */
export interface PlacedFloorPiece extends PlacedPrefabLike {
    elevation?: number;
}

export interface PlacedSlab {
    /** The tile it covers, on the ground. */
    x: number;
    y: number;
    elevation: number;
    family: FloorFamily;
}

export interface PlacedStair {
    shape: StairShape;
    /** The tile of its first step, on the ground. */
    foot: TilePoint;
    /** Altitude of the floor it starts from (0: the ground) and of the one it goes up to. */
    base: number;
    top: number;
    /** What it covers on the ground. */
    ground: PixelBox;
}

/** Where the image of a slab covering a tile is: its altitude further north. */
export function slabImagePosition(cell: TilePoint, elevation: number): { x: number; y: number } {
    return { x: cell.x * MAP_LAYER_TILE_SIZE, y: cell.y * MAP_LAYER_TILE_SIZE - elevation };
}

/** Where the image of a stair is: what it covers on the screen, raised by the altitude of the floor it starts from. */
export function stairImagePosition(shape: StairShape, foot: TilePoint, base: number): { x: number; y: number } {
    const box = stairScreenBox(shape, foot);
    return { x: box.x, y: box.y - base };
}

/** The tile of the foot of a stair whose image is at (x, y); undefined when it is not on the grid. */
export function stairFootFromImage(shape: StairShape, x: number, y: number, base: number): TilePoint | undefined {
    const size = MAP_LAYER_TILE_SIZE;
    const run = stairRun(shape.direction, shape.rise) * size;
    const rise = shape.rise;
    // Top-left corner of what the stair covers on the ground.
    const groundX = x;
    const groundY = shape.direction === "s" ? y + base : y + base + rise;
    const foot =
        shape.direction === "n"
            ? { x: groundX / size, y: (groundY + run) / size - 1 }
            : shape.direction === "o"
              ? { x: (groundX + run) / size - 1, y: groundY / size }
              : { x: groundX / size, y: groundY / size };
    return Number.isInteger(foot.x) && Number.isInteger(foot.y) ? foot : undefined;
}

function key(elevation: number, x: number, y: number): string {
    return `${elevation}:${x},${y}`;
}

/**
 * The raised floors of a map: the slabs, by altitude and tile, and the stairs. A hole in a floor (the well of a stair)
 * is simply tiles without a slab.
 */
export class FloorModel {
    private readonly slabs = new Map<string, PlacedSlab>();
    private readonly stairs: PlacedStair[] = [];

    /** Reads the slabs and the stairs among the entities placed on a map. The other entities are ignored. */
    public static fromPlaced(items: Iterable<PlacedFloorPiece>): FloorModel {
        const model = new FloorModel();
        const size = MAP_LAYER_TILE_SIZE;
        for (const item of items) {
            const piece = parseFloorPiece(item.collectionName, item.prefabId);
            if (!piece) continue;
            const elevation = item.elevation ?? 0;
            if (piece.kind === "slab") {
                // A slab on the ground is not a raised floor: the floors of the ground are the `Carte Sols`.
                if (elevation <= 0) continue;
                const x = item.x / size;
                const y = (item.y + elevation) / size;
                if (Number.isInteger(x) && Number.isInteger(y)) model.setSlab(elevation, x, y, piece.family);
                continue;
            }
            const shape = { direction: piece.direction, width: piece.width, rise: piece.rise, open: piece.open };
            const foot = stairFootFromImage(shape, item.x, item.y, elevation);
            if (foot) model.addStair(shape, foot, elevation);
        }
        return model;
    }

    public setSlab(elevation: number, x: number, y: number, family: FloorFamily): void {
        this.slabs.set(key(elevation, x, y), { x, y, elevation, family });
    }

    public removeSlab(elevation: number, x: number, y: number): boolean {
        return this.slabs.delete(key(elevation, x, y));
    }

    public addStair(shape: StairShape, foot: TilePoint, base: number): PlacedStair {
        const stair = {
            shape,
            foot,
            base,
            top: base + shape.rise,
            ground: stairGroundBox(shape, foot),
        };
        this.stairs.push(stair);
        return stair;
    }

    public removeStair(stair: PlacedStair): boolean {
        const index = this.stairs.indexOf(stair);
        if (index < 0) return false;
        this.stairs.splice(index, 1);
        return true;
    }

    public hasSlab(elevation: number, x: number, y: number): boolean {
        return this.slabs.has(key(elevation, x, y));
    }

    public slabAt(elevation: number, x: number, y: number): FloorFamily | undefined {
        return this.slabs.get(key(elevation, x, y))?.family;
    }

    public getSlabs(): PlacedSlab[] {
        return [...this.slabs.values()];
    }

    public getStairs(): readonly PlacedStair[] {
        return this.stairs;
    }

    /** Altitudes that have at least one slab, lowest first. */
    public getLevels(): number[] {
        return [...new Set(this.getSlabs().map((slab) => slab.elevation))].sort((a, b) => a - b);
    }
}
