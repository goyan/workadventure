import * as Phaser from "phaser";
import type { DanceFloorEngine } from "./DanceFloorEngine";
import { DANCE_FLOOR_TILE_PX, type FloorGrid } from "./DanceFloorPatterns";
import { makeWhiteTexture } from "./LampTextures";

const JOINTS_TEXTURE = "dance-floor-joints";
const BEVEL_TEXTURE = "dance-floor-bevel";
/** The neon blue of the joints between the tiles. */
const JOINT_COLOUR = 0x2f7dff;
/** How much of the light of a tile spills over its neighbours. */
const HALO_ALPHA = 0.45;

/** The two shapes every floor is drawn with, one tile of each, repeated over the floor. */
export function ensureDanceFloorTextures(scene: Phaser.Scene): void {
    const size = DANCE_FLOOR_TILE_PX;
    const toEdge = (x: number, y: number): number => Math.min(x, y, size - x, size - y);
    // Joints: a bright line on the edge of the tile (two pixels wide with the neighbour's), and its glow inside.
    makeWhiteTexture(scene, JOINTS_TEXTURE, size, size, (x, y) => {
        const distance = toEdge(x, y);
        return distance < 1 ? 1 : distance < 7 ? 0.5 * Math.exp(-(distance - 1) / 1.7) : 0;
    });
    // Bevel: the tile is a little darker towards its edge, as a slab of glass lit from below is.
    makeWhiteTexture(scene, BEVEL_TEXTURE, size, size, (x, y) => {
        const distance = toEdge(x, y);
        return distance < 8 ? 0.32 * (1 - distance / 8) ** 1.5 : 0;
    });
}

/**
 * A dance floor on the map: one texture of one pixel per tile, stretched over the floor (so that a large room costs
 * no more than a small one), the joints and the bevel of the tiles repeated over it, and the light of the lit tiles
 * added as a soft halo.
 */
export class DanceFloorVisual {
    private readonly tiles: Phaser.GameObjects.Image;
    private readonly halo: Phaser.GameObjects.Image;
    private readonly bevel: Phaser.GameObjects.TileSprite;
    private readonly joints: Phaser.GameObjects.TileSprite;
    private grid: FloorGrid = { cols: 0, rows: 0 };
    private tilesTexture: Phaser.Textures.CanvasTexture | undefined;
    private haloTexture: Phaser.Textures.CanvasTexture | undefined;
    private tilesPixels: ImageData | undefined;
    private haloPixels: ImageData | undefined;
    private boundsKey = "";

    constructor(
        private readonly scene: Phaser.Scene,
        /** The id of the object: the textures of this floor are its own. */
        private readonly id: string,
        depth: number,
    ) {
        ensureDanceFloorTextures(scene);
        this.tiles = scene.add.image(0, 0, "__DEFAULT").setOrigin(0).setDepth(depth);
        this.bevel = scene.add
            .tileSprite(0, 0, DANCE_FLOOR_TILE_PX, DANCE_FLOOR_TILE_PX, BEVEL_TEXTURE)
            .setOrigin(0)
            .setTint(0x000000)
            .setDepth(depth + 0.001);
        this.halo = scene.add
            .image(0, 0, "__DEFAULT")
            .setOrigin(0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(HALO_ALPHA)
            .setDepth(depth + 0.002);
        this.joints = scene.add
            .tileSprite(0, 0, DANCE_FLOOR_TILE_PX, DANCE_FLOOR_TILE_PX, JOINTS_TEXTURE)
            .setOrigin(0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(JOINT_COLOUR)
            .setDepth(depth + 0.003);
    }

    /** Puts the floor where its object is, at its size: called at every image, the object may be dragged or resized. */
    public setBounds(bounds: { x: number; y: number; width: number; height: number }, grid: FloorGrid): void {
        if (grid.cols !== this.grid.cols || grid.rows !== this.grid.rows) {
            this.setGrid(grid);
        }
        const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
        if (key === this.boundsKey) {
            return;
        }
        this.boundsKey = key;
        // A size that is not a multiple of 32 px keeps whole tiles: they are stretched to fill the floor.
        const scaleX = bounds.width / (grid.cols * DANCE_FLOOR_TILE_PX);
        const scaleY = bounds.height / (grid.rows * DANCE_FLOOR_TILE_PX);
        for (const image of [this.tiles, this.halo]) {
            image.setPosition(bounds.x, bounds.y).setDisplaySize(bounds.width, bounds.height);
        }
        for (const repeated of [this.bevel, this.joints]) {
            repeated.setPosition(bounds.x, bounds.y).setSize(bounds.width, bounds.height);
            repeated.setTileScale(scaleX, scaleY);
        }
    }

    private setGrid(grid: FloorGrid): void {
        const previous = [this.tilesTexture, this.haloTexture];
        this.grid = grid;
        this.boundsKey = "";
        const size = `${grid.cols}x${grid.rows}`;
        this.tilesTexture =
            this.scene.textures.createCanvas(`dance-floor-tiles:${this.id}:${size}`, grid.cols, grid.rows) ?? undefined;
        this.haloTexture =
            this.scene.textures.createCanvas(`dance-floor-halo:${this.id}:${size}`, grid.cols, grid.rows) ?? undefined;
        if (this.tilesTexture && this.haloTexture) {
            // Sharp tiles, and a halo that melts from one tile into the next.
            this.tilesTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            this.haloTexture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            this.tilesPixels = this.tilesTexture.getContext().createImageData(grid.cols, grid.rows);
            this.haloPixels = this.haloTexture.getContext().createImageData(grid.cols, grid.rows);
            this.tiles.setTexture(this.tilesTexture.key);
            this.halo.setTexture(this.haloTexture.key);
        }
        for (const texture of previous) {
            texture?.destroy();
        }
    }

    /** Draws the tiles as the engine has them now. */
    public draw(engine: DanceFloorEngine): void {
        if (!this.tilesTexture || !this.haloTexture || !this.tilesPixels || !this.haloPixels) {
            return;
        }
        engine.paint(this.tilesPixels.data, this.haloPixels.data);
        this.tilesTexture.getContext().putImageData(this.tilesPixels, 0, 0);
        this.tilesTexture.refresh();
        this.haloTexture.getContext().putImageData(this.haloPixels, 0, 0);
        this.haloTexture.refresh();
        // The joints glow with the floor: a little brighter on each beat.
        this.joints.setAlpha(0.45 + 0.55 * engine.glow);
    }

    public setVisible(visible: boolean): void {
        this.tiles.setVisible(visible);
        this.halo.setVisible(visible);
        this.bevel.setVisible(visible);
        this.joints.setVisible(visible);
    }

    public destroy(): void {
        this.tiles.destroy();
        this.halo.destroy();
        this.bevel.destroy();
        this.joints.destroy();
        this.tilesTexture?.destroy();
        this.haloTexture?.destroy();
        this.tilesTexture = undefined;
        this.haloTexture = undefined;
    }
}
