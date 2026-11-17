import { fadedWallFloorPatches } from "./FadedWallFloor";
import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";

/** What the view reads of a floor tile placed on the ground (an `Entity` fits). */
export interface FloorTile {
    x: number;
    y: number;
    depth: number;
    texture: { key: string };
    frame: { name: string | number };
}

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Draws the floor of the room under the see-through walls in front of it (`fadedWallFloorPatches`): copies of the floor
 * tiles, just over the floors, drawn by the game for the player alone. Nothing is placed on the map.
 */
export class FadedWallFloorView {
    private images: Phaser.GameObjects.Image[] = [];
    private drawnVersion: number | undefined;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly floors: () => Iterable<FloorTile>,
        private readonly markDirty: () => void,
    ) {}

    /** Draws again when the opacity of a wall changed (`version`), not at each frame. */
    update(version: number, fadedWalls: () => Rect[]): void {
        if (version === this.drawnVersion) return;
        this.drawnVersion = version;
        const walls = fadedWalls();
        if (walls.length === 0) {
            if (this.images.length > 0) this.clear();
            return;
        }
        const byCell = new Map<string, FloorTile>();
        for (const floor of this.floors()) {
            byCell.set(
                `${Math.round(floor.x / MAP_LAYER_TILE_SIZE)},${Math.round(floor.y / MAP_LAYER_TILE_SIZE)}`,
                floor,
            );
        }
        const patches = fadedWallFloorPatches(walls, (column, row) => byCell.get(`${column},${row}`));
        this.clear();
        for (const { column, row, floor } of patches) {
            this.images.push(
                this.scene.add
                    .image(column * MAP_LAYER_TILE_SIZE, row * MAP_LAYER_TILE_SIZE, floor.texture.key, floor.frame.name)
                    .setOrigin(0)
                    .setDisplaySize(MAP_LAYER_TILE_SIZE, MAP_LAYER_TILE_SIZE)
                    .setDepth(floor.depth + 0.01),
            );
        }
        this.markDirty();
    }

    destroy(): void {
        this.clear();
    }

    private clear(): void {
        for (const image of this.images) image.destroy();
        this.images = [];
        this.markDirty();
    }
}
