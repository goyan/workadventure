import * as Sentry from "@sentry/svelte";
import type { WeatherType } from "@workadventure/map-editor";
import { PropertyUtils } from "@wa/front/Phaser/Map/PropertyUtils";
import { FootstepSurfaces } from "../FootstepSurfaces";
import type { GameScene } from "../GameScene";
import { snowCoverage } from "./SnowCover";

const GREEN_TEXTURE = "/resources/objects/weather/terrain-green.png";
const AUTUMN_TEXTURE = "/resources/objects/weather/terrain-autumn.png";
const SNOW_TEXTURE = "/resources/objects/weather/terrain-snow.png";

/** One viewport-sized texture, below objects; no map-sized allocation or per-tile game objects. */
export class SnowGround {
    private readonly canvas: Phaser.GameObjects.RenderTexture;
    private readonly surfaces: FootstepSurfaces;
    private drawnView: { left: number; top: number; right: number; bottom: number } | undefined;
    private readonly exteriorIsGrass: boolean;
    private lastDrawKey = "";
    /** The time of the game at the last update: the surfaces are looked at again on this clock. */
    private clock = 0;
    private ready = false;
    private destroyed = false;

    constructor(private readonly scene: GameScene) {
        const exterior = PropertyUtils.findStringProperty("exteriorTexture", scene.getGameMap().getMap().properties);
        this.exteriorIsGrass = /(?:^|[/_.-])(grass|herbe)(?:[/_.-]|$)/i.test(exterior ?? "");
        this.canvas = scene.add.renderTexture(0, 0, 1, 1).setOrigin(0).setDepth(0.6).setVisible(false);
        this.surfaces = new FootstepSurfaces(
            () =>
                Array.from(scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values(), (entity) => ({
                    x: entity.x,
                    y: entity.y,
                    width: entity.displayWidth,
                    height: entity.displayHeight,
                    collectionName: entity.getPrefab().collectionName,
                    prefabId: entity.getPrefab().id,
                    footstepSound: entity.getPrefab().footstepSound,
                })),
            (x, y) => !this.isGrassTile(x, y),
            () => this.clock,
        );
        Promise.all([SNOW_TEXTURE, GREEN_TEXTURE, AUTUMN_TEXTURE].map((key) => scene.superLoad.image(key, key)))
            .then(() => {
                if (!this.destroyed) this.ready = true;
            })
            .catch((error: unknown) => {
                if (!this.destroyed) Sentry.captureException(error);
            });
    }

    private isGrassTile(x: number, y: number): boolean {
        const column = Math.floor(x / this.scene.Map.tileWidth);
        const row = Math.floor(y / this.scene.Map.tileHeight);
        for (let index = this.scene.Map.layers.length - 1; index >= 0; index--) {
            const layer = this.scene.Map.layers[index];
            if (!layer?.tilemapLayer?.visible || layer.tilemapLayer.depth > 0) continue;
            const tile = layer.data[row]?.[column];
            if (!tile || tile.index < 0) continue;
            const surface: unknown = tile.properties?.footstepSound;
            if (surface !== undefined) return surface === "grass";
            return /(?:^|[/_.-])(grass|herbe)(?:[/_.-]|$)/i.test(tile.tileset?.image?.key ?? "");
        }
        return this.exteriorIsGrass;
    }

    public update(
        now: number,
        serverDate: Date | undefined,
        configured: WeatherType,
        enabled: boolean,
        autumnGround = false,
        startedAt?: number,
    ): void {
        // Snow on the map settles on the grass for everyone: it is weather, not a decor.
        this.clock = now;
        const coverage = serverDate ? snowCoverage(configured, serverDate.getTime(), startedAt) : 0;
        if (!enabled || !serverDate || !this.ready) {
            this.lastDrawKey = "";
            if (this.canvas.visible) {
                this.canvas.setVisible(false);
                this.scene.markDirty();
            }
            return;
        }
        const view = this.scene.cameras.main.worldView;
        const tileWidth = this.scene.Map.tileWidth;
        const tileHeight = this.scene.Map.tileHeight;
        // The autumn theme colours the grass; the calendar is the theme's business.
        const groundTexture = autumnGround ? AUTUMN_TEXTURE : GREEN_TEXTURE;
        // Drawn again only when what it shows changed: the ground, the snow on it, the surfaces of the map or the zoom.
        const drawKey = `${groundTexture}:${Math.round(coverage * 240)}:${this.surfaces.layoutVersion()}:${this.scene.cameras.main.zoom}`;
        const previous = this.drawnView;
        if (
            drawKey === this.lastDrawKey &&
            previous &&
            view.x >= previous.left * tileWidth &&
            view.y >= previous.top * tileHeight &&
            view.right <= previous.right * tileWidth &&
            view.bottom <= previous.bottom * tileHeight
        )
            return;
        // Cache a margin around the camera, and redraw immediately when it moves beyond it.
        const marginX = Math.max(tileWidth * 6, view.width / 4);
        const marginY = Math.max(tileHeight * 5, view.height / 4);
        const left = Math.floor((view.x - marginX) / (tileWidth * 6)) * 6;
        const top = Math.floor((view.y - marginY) / (tileHeight * 5)) * 5;
        const right = Math.ceil((view.right + marginX) / (tileWidth * 6)) * 6;
        const bottom = Math.ceil((view.bottom + marginY) / (tileHeight * 5)) * 5;
        this.drawnView = { left, top, right, bottom };
        this.lastDrawKey = drawKey;
        const width = Math.max(1, (right - left) * tileWidth);
        const height = Math.max(1, (bottom - top) * tileHeight);
        const scale = Math.min(1, 2048 / width, 2048 / height);
        if (this.canvas.width !== Math.ceil(width * scale) || this.canvas.height !== Math.ceil(height * scale)) {
            this.canvas.resize(Math.ceil(width * scale), Math.ceil(height * scale));
        }
        this.canvas
            .setPosition(left * tileWidth, top * tileHeight)
            .setScale(1 / scale)
            .setVisible(true)
            .clear();
        for (let blockRow = top; blockRow < bottom; blockRow += 5) {
            for (let blockColumn = left; blockColumn < right; blockColumn += 6) {
                if (this.isGrassBlock(blockColumn, blockRow)) {
                    const x = (blockColumn - left) * tileWidth * scale;
                    const y = (blockRow - top) * tileHeight * scale;
                    this.stampTexture(
                        groundTexture,
                        x,
                        y,
                        tileWidth * 6 * scale,
                        tileHeight * 5 * scale,
                        1,
                        blockColumn,
                        blockRow,
                        true,
                    );
                    if (coverage > 0)
                        this.stampTexture(
                            SNOW_TEXTURE,
                            x,
                            y,
                            tileWidth * 6 * scale,
                            tileHeight * 5 * scale,
                            coverage,
                            blockColumn,
                            blockRow,
                            true,
                        );
                    continue;
                }
                for (let row = blockRow; row < blockRow + 5; row++) {
                    for (let column = blockColumn; column < blockColumn + 6; column++) {
                        if (this.surfaces.surfaceAt((column + 0.5) * tileWidth, (row + 0.5) * tileHeight) !== "grass")
                            continue;
                        const x = (column - left) * tileWidth * scale;
                        const y = (row - top) * tileHeight * scale;
                        this.stampTexture(groundTexture, x, y, tileWidth * scale, tileHeight * scale, 1, column, row);
                        if (coverage > 0)
                            this.stampTexture(
                                SNOW_TEXTURE,
                                x,
                                y,
                                tileWidth * scale,
                                tileHeight * scale,
                                coverage,
                                column,
                                row,
                            );
                    }
                }
            }
        }
        this.canvas.render();
        this.scene.markDirty();
    }

    private isGrassBlock(column: number, row: number): boolean {
        for (let y = row; y < row + 5; y++) {
            for (let x = column; x < column + 6; x++) {
                if (
                    this.surfaces.surfaceAt(
                        (x + 0.5) * this.scene.Map.tileWidth,
                        (y + 0.5) * this.scene.Map.tileHeight,
                    ) !== "grass"
                )
                    return false;
            }
        }
        return true;
    }

    private stampTexture(
        key: string,
        x: number,
        y: number,
        width: number,
        height: number,
        alpha: number,
        column: number,
        row: number,
        whole = false,
    ): void {
        const texture = this.scene.textures.get(key);
        const base = texture.get("__BASE");
        const columns = base.width / this.scene.Map.tileWidth;
        const rows = base.height / this.scene.Map.tileHeight;
        const cellX = ((column % columns) + columns) % columns;
        const cellY = ((row % rows) + rows) % rows;
        const frameName = `${whole ? "block" : "cell"}-${cellX}-${cellY}`;
        if (!texture.has(frameName)) {
            texture.add(
                frameName,
                0,
                cellX * this.scene.Map.tileWidth,
                cellY * this.scene.Map.tileHeight,
                this.scene.Map.tileWidth * (whole ? 6 : 1),
                this.scene.Map.tileHeight * (whole ? 5 : 1),
            );
        }
        // Sample at world coordinates so adjacent blocks and cells share the same continuous texture.
        const frame = texture.get(frameName);
        this.canvas.stamp(key, frameName, x, y, {
            originX: 0,
            originY: 0,
            scaleX: width / frame.width,
            scaleY: height / frame.height,
            alpha,
        });
    }

    public destroy(): void {
        this.destroyed = true;
        this.canvas.destroy();
    }
}
