import { pavedTilesOf, TERRAIN_CELL, TILE_PX } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { GroundLayout } from "./ReliefTiles";

/** What the layout of the map is read from. */
export interface MapGroundLayoutDeps {
    grid(): OutdoorGrid | undefined;
    /** Changes each time the outdoor grid is recomputed. */
    gridVersion(): number;
    wam(): Pick<WAMFileFormat, "entities"> | undefined;
    /** Whether the tile of the map under a point (map pixels) is grass. */
    isGrassTile(x: number, y: number): boolean;
}

/** The floors of the Carte tool are read again this often (ms): they change only while the map is edited. */
const PAVED_READ_MS = 500;

/**
 * The layout of the map the flat ground is drawn with (ReliefTiles): what is outdoors, what the floors of the Carte
 * tool and the decks of the bridges cover, which tiles of the map are grass. Its version changes when one of them does.
 */
export class MapGroundLayout implements GroundLayout {
    private pavedTiles = new Set<string>();
    private pavedReadAt = Number.NEGATIVE_INFINITY;
    private gridVersion = Number.NaN;
    private count = 0;
    /** Whether each tile of the map is grass (by "x,y" in tiles): the tiles of a map change only in its editor. */
    private readonly grass = new Map<string, boolean>();

    constructor(private readonly deps: MapGroundLayoutDeps) {}

    /** Reads again what may have changed: the rooms (with the grid) and, twice a second at most, the floors. */
    public refresh(now: number): void {
        const gridVersion = this.deps.gridVersion();
        if (gridVersion !== this.gridVersion) {
            this.gridVersion = gridVersion;
            this.count++;
        }
        if (now - this.pavedReadAt < PAVED_READ_MS) return;
        this.pavedReadAt = now;
        const paved = pavedTilesOf(this.deps.wam());
        if (paved.size !== this.pavedTiles.size || [...paved].some((tile) => !this.pavedTiles.has(tile))) {
            this.pavedTiles = paved;
            this.count++;
        }
    }

    /** The tiles of the map were edited: whether each one is grass is read again. */
    public tilesChanged(): void {
        this.grass.clear();
        this.count++;
    }

    public version(): number {
        return this.count;
    }

    public outdoor(cellX: number, cellY: number): boolean {
        return this.deps.grid()?.isOutdoorAt((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL) ?? true;
    }

    public paved(cellX: number, cellY: number): boolean {
        return this.pavedTiles.has(
            `${Math.floor((cellX * TERRAIN_CELL) / TILE_PX)},${Math.floor((cellY * TERRAIN_CELL) / TILE_PX)}`,
        );
    }

    public mapGrass(cellX: number, cellY: number): boolean {
        const tileX = Math.floor((cellX * TERRAIN_CELL) / TILE_PX);
        const tileY = Math.floor((cellY * TERRAIN_CELL) / TILE_PX);
        const key = `${tileX},${tileY}`;
        let grass = this.grass.get(key);
        if (grass === undefined) {
            grass = this.deps.isGrassTile((tileX + 0.5) * TILE_PX, (tileY + 0.5) * TILE_PX);
            this.grass.set(key, grass);
        }
        return grass;
    }
}

/**
 * Whether the tile of a map under a point is grass: its footstep sound, else the name of its tileset, else the
 * picture of the map beyond its edges. Read from the topmost visible ground layer that has a tile there.
 */
export function mapTileIsGrass(map: Phaser.Tilemaps.Tilemap, exteriorIsGrass: boolean, x: number, y: number): boolean {
    const column = Math.floor(x / map.tileWidth);
    const row = Math.floor(y / map.tileHeight);
    for (let index = map.layers.length - 1; index >= 0; index--) {
        const layer = map.layers[index];
        if (!layer?.tilemapLayer?.visible || layer.tilemapLayer.depth > 0) continue;
        const tile = layer.data[row]?.[column];
        if (!tile || tile.index < 0) continue;
        const surface: unknown = tile.properties?.footstepSound;
        if (surface !== undefined) return surface === "grass";
        return GRASS_NAME.test(tile.tileset?.image?.key ?? "");
    }
    return exteriorIsGrass;
}

/** A tileset or a picture named after grass. */
export const GRASS_NAME = /(?:^|[/_.-])(grass|herbe)(?:[/_.-]|$)/i;
