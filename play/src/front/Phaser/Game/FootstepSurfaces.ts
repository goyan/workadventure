import type { FloorFamily } from "./MapEditor/MapLayer/MapLayerCatalog";
import { MAP_LAYER_TILE_SIZE } from "./MapEditor/MapLayer/MapLayerCatalog";
import { cellKey } from "./MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs } from "./MapEditor/MapLayer/MapLayerOperations";
import type { PlacedPrefabLike } from "./MapEditor/MapLayer/MapLayerOperations";

export const FOOTSTEP_SURFACES = ["grass", "wood", "carpet", "stone"] as const;
/** What a character moves on: a floor, or water while it swims. */
export type FootstepSurface = (typeof FOOTSTEP_SURFACES)[number] | "water";

/** The floors are read again at this rhythm: they are painted and erased in the map editor. */
const RESCAN_PERIOD_MS = 2000;

/** A placed entity, with the `footstepSound` of its prefab when the catalog sets one. */
export interface FloorEntity extends PlacedPrefabLike {
    width: number;
    height: number;
    footstepSound?: (typeof FOOTSTEP_SURFACES)[number];
}

/** The sound of a step on a floor of the map layer whose catalog sets no `footstepSound`. */
export function surfaceOfFloor(family: FloorFamily): FootstepSurface {
    if (family.startsWith("parquet")) return "wood";
    if (family.startsWith("moquette")) return "carpet";
    return "stone";
}

/**
 * Tells what a character walks on, in this order:
 * 1. the `footstepSound` of the entity under its feet (floor tile, rug), set in the entity catalog;
 * 2. the family of the map layer floor of the cell, for catalogs that set none;
 * 3. wood inside an area (a room whose floor is drawn in the map itself), grass outside.
 */
export class FootstepSurfaces {
    private cells = new Map<string, FootstepSurface>();
    private scannedAt = -Infinity;

    constructor(
        private readonly readEntities: () => Iterable<FloorEntity>,
        private readonly isInArea: (x: number, y: number) => boolean,
        private readonly now: () => number = () => performance.now(),
    ) {}

    public surfaceAt(x: number, y: number): FootstepSurface {
        const cell = cellKey(Math.floor(x / MAP_LAYER_TILE_SIZE), Math.floor(y / MAP_LAYER_TILE_SIZE));
        return this.getCells().get(cell) ?? (this.isInArea(x, y) ? "wood" : "grass");
    }

    private getCells(): Map<string, FootstepSurface> {
        const now = this.now();
        if (now - this.scannedAt >= RESCAN_PERIOD_MS) {
            this.cells = indexSurfaces([...this.readEntities()]);
            this.scannedAt = now;
        }
        return this.cells;
    }
}

/** Surface of each map cell: map layer floors first, then entities with a `footstepSound` drawn over them (rugs). */
function indexSurfaces(entities: readonly FloorEntity[]): Map<string, FootstepSurface> {
    const cells = new Map<string, FootstepSurface>();
    for (const floor of modelFromPlacedPrefabs(entities).getFloors()) {
        cells.set(cellKey(floor.x, floor.y), surfaceOfFloor(floor.family));
    }
    const size = MAP_LAYER_TILE_SIZE;
    for (const entity of entities) {
        if (!entity.footstepSound) continue;
        const lastColumn = Math.ceil((entity.x + entity.width) / size) - 1;
        const lastRow = Math.ceil((entity.y + entity.height) / size) - 1;
        for (let row = Math.floor(entity.y / size); row <= lastRow; row++) {
            for (let column = Math.floor(entity.x / size); column <= lastColumn; column++) {
                cells.set(cellKey(column, row), entity.footstepSound);
            }
        }
    }
    return cells;
}
