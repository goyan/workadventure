import type { FloorFamily } from "./MapEditor/MapLayer/MapLayerCatalog";
import { MAP_LAYER_TILE_SIZE } from "./MapEditor/MapLayer/MapLayerCatalog";
import type { MapLayerModel } from "./MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs } from "./MapEditor/MapLayer/MapLayerOperations";
import type { PlacedPrefabLike } from "./MapEditor/MapLayer/MapLayerOperations";

export const FOOTSTEP_SURFACES = ["grass", "wood", "carpet", "stone"] as const;
export type FootstepSurface = (typeof FOOTSTEP_SURFACES)[number];

/** The floors are read again at this rhythm: they are painted and erased in the map editor. */
const RESCAN_PERIOD_MS = 2000;

/** The sound of a step on a floor of the map layer (see MAP_LAYER_FLOOR_FAMILIES). */
export function surfaceOfFloor(family: FloorFamily): FootstepSurface {
    if (family.startsWith("parquet")) return "wood";
    if (family.startsWith("moquette")) return "carpet";
    return "stone";
}

/**
 * Tells what a character walks on. A floor of the map layer gives its family; elsewhere, inside an area (a room
 * whose floor is drawn in the map itself) the step sounds like wood, and outside, like grass.
 */
export class FootstepSurfaces {
    private model: MapLayerModel | undefined;
    private scannedAt = -Infinity;

    constructor(
        private readonly readPlacedPrefabs: () => Iterable<PlacedPrefabLike>,
        private readonly isInArea: (x: number, y: number) => boolean,
        private readonly now: () => number = () => performance.now(),
    ) {}

    public surfaceAt(x: number, y: number): FootstepSurface {
        const floor = this.getModel().getFloor(
            Math.floor(x / MAP_LAYER_TILE_SIZE),
            Math.floor(y / MAP_LAYER_TILE_SIZE),
        );
        if (floor) return surfaceOfFloor(floor.family);
        return this.isInArea(x, y) ? "wood" : "grass";
    }

    private getModel(): MapLayerModel {
        const now = this.now();
        if (!this.model || now - this.scannedAt >= RESCAN_PERIOD_MS) {
            this.model = modelFromPlacedPrefabs(this.readPlacedPrefabs());
            this.scannedAt = now;
        }
        return this.model;
    }
}
