import * as Phaser from "phaser";
import { SOILS, soilAt, TERRAIN_CELL, TERRAIN_CHUNK, TILE_PX } from "@workadventure/map-editor";
import type { Season, TerrainData } from "@workadventure/map-editor";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";
import { ASH_COLOR, ashAlpha, GRASS_COLOR, grassAlpha, mottledCover } from "./MeadowState";
import type { MeadowState } from "./MeadowState";
import { DROP_SCALE, dropAt, heightAtPoint, MAX_DROP, paintColumn, RELIEF_TEXEL } from "./ReliefProjection";
import type { ColumnSample } from "./ReliefProjection";
import { ReliefTileSchedule, reliefSignature } from "./ReliefTileSchedule";
import {
    DEEP_WATER_COLOR,
    deepWaterAlpha,
    groundAlpha,
    SHALLOW_WATER,
    SHORE_PX,
    SHORE_WATER,
    slopeAlpha,
    slopeShade,
    SNOW_COLOR,
    SOIL_TINTS,
} from "./TerrainShading";
import type { TerrainWater } from "./TerrainWater";

/** Over the relief of the ground (0.65), under the objects and the avatars. */
const RELIEF_TILES_DEPTH = 0.66;
/** Map pixels across a block: one chunk of the relief. */
const BLOCK_PX = TERRAIN_CHUNK * TERRAIN_CELL;
const BLOCK_TEXELS = BLOCK_PX / RELIEF_TEXEL;
/** The ground of the map under the relief, where nothing else is painted: a meadow green. */
const GROUND_BASE = 0x7f9a55;
/** The rock of the faces of the drops, a little of the soil of their rim mixed in. */
const WALL_ROCK = 0x8f7f69;
const WALL_SOIL_SHARE = 0.3;
/** Water thinner than this is not drawn (as on the flat drawing). */
const WATER_SEEN_PX = 0.5;

type Rgb = [number, number, number];

function rgb(color: number): Rgb {
    return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function over(under: Rgb, color: number, alpha: number): Rgb {
    if (alpha <= 0) return under;
    const [red, green, blue] = rgb(color);
    return [
        under[0] * (1 - alpha) + red * alpha,
        under[1] * (1 - alpha) + green * alpha,
        under[2] * (1 - alpha) + blue * alpha,
    ];
}

export interface ReliefInputs {
    relief(): TerrainData | undefined;
    water: TerrainWater;
    meadow?: MeadowState;
    season(): Season | undefined;
    /** How much of the ground is under the snow of the season (0 to 1). */
    snowShown(): number;
}

interface Block {
    texture: Phaser.Textures.CanvasTexture;
    image: Phaser.GameObjects.Image;
}

/**
 * The relief seen in 3/4 (ReliefProjection), drawn as one image a block of the relief: the dug ground lower by half
 * its depth, the faces of the drops, the water at its surface. A block is drawn again only when what it is drawn
 * from changes (ReliefTileSchedule), never because the view scrolls or zooms.
 */
export class ReliefTiles {
    private readonly blocks = new Map<string, Block>();
    private readonly schedule = new ReliefTileSchedule();
    private hidden = false;
    private reliefKept: TerrainData | undefined;
    private readonly reliefSignatures = new Map<string, string>();
    private waterKey = "";
    private readonly waterSignatures = new Map<string, string>();
    private readonly levels = new Uint8Array(TERRAIN_CHUNK * (TERRAIN_CHUNK + MAX_DROP / TERRAIN_CELL));

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly inputs: ReliefInputs,
    ) {}

    /** Blocks drawn so far: none while the view only scrolls or zooms. */
    public redraws(): number {
        return this.schedule.redraws;
    }

    /** Whether the relief is drawn in 3/4 now (a map with relief, the editor closed). */
    public isActive(): boolean {
        return !this.hidden && this.inputs.relief() !== undefined;
    }

    public setHidden(hidden: boolean): void {
        if (hidden === this.hidden) return;
        this.hidden = hidden;
        for (const block of this.blocks.values()) block.image.setVisible(!hidden);
        // What changed while it was hidden is drawn again when it shows.
        if (!hidden) this.schedule.forget();
        this.scene.markDirty();
    }

    public update(now: number): void {
        const terrain = this.inputs.relief();
        if (this.hidden || !terrain) return;
        if (terrain !== this.reliefKept) {
            this.reliefKept = terrain;
            this.reliefSignatures.clear();
        }
        const view = this.scene.cameras.main.worldView;
        const visible = this.blocksOver(view.x, view.y, view.width, view.height);
        const around = this.blocksOver(
            view.x - BLOCK_PX,
            view.y - BLOCK_PX,
            view.width + 2 * BLOCK_PX,
            view.height + 2 * BLOCK_PX,
        );
        const waterKey = this.inputs.water.drawKey(now);
        if (waterKey !== this.waterKey) {
            this.waterKey = waterKey;
            this.waterSignatures.clear();
        }
        const shared = `${this.inputs.meadow?.version() ?? 0}|${this.inputs.season() ?? ""}|${
            Math.round(this.inputs.snowShown() * 10) / 10
        }`;
        const signatures = new Map<string, string>();
        for (const key of around) {
            let relief = this.reliefSignatures.get(key);
            if (relief === undefined) {
                const [blockX, blockY] = key.split(",").map(Number);
                relief = reliefSignature(terrain, blockX, blockY);
                this.reliefSignatures.set(key, relief);
            }
            let water = this.waterSignatures.get(key);
            if (water === undefined) {
                water = this.waterSignature(key, now);
                this.waterSignatures.set(key, water);
            }
            signatures.set(key, relief === "" && water === "" ? "" : `${relief}|${water}|${shared}`);
        }
        for (const key of this.schedule.toRedraw(around, signatures, undefined, new Set(visible))) {
            if (signatures.get(key) === "") this.drop(key);
            else this.draw(key, terrain, now);
        }
        for (const key of this.schedule.evict(new Set(around))) this.drop(key);
    }

    public destroy(): void {
        for (const key of [...this.blocks.keys()]) this.drop(key);
    }

    private blocksOver(x: number, y: number, width: number, height: number): string[] {
        const keys: string[] = [];
        for (let blockY = Math.floor(y / BLOCK_PX); blockY <= Math.floor((y + height) / BLOCK_PX); blockY++) {
            for (let blockX = Math.floor(x / BLOCK_PX); blockX <= Math.floor((x + width) / BLOCK_PX); blockX++) {
                keys.push(`${blockX},${blockY}`);
            }
        }
        return keys;
    }

    /** The water a block is drawn with (its cells and the rows north of it), as a short text; empty when dry. */
    private waterSignature(key: string, now: number): string {
        const [blockX, blockY] = key.split(",").map(Number);
        const northRows = MAX_DROP / TERRAIN_CELL;
        const rows = TERRAIN_CHUNK + northRows;
        const any = this.inputs.water.levelsOver(
            blockX * TERRAIN_CHUNK,
            blockY * TERRAIN_CHUNK - northRows,
            TERRAIN_CHUNK,
            rows,
            now,
            this.levels,
        );
        if (!any) return "";
        let hash = 0;
        for (let index = 0; index < TERRAIN_CHUNK * rows; index++)
            hash = (Math.imul(hash, 31) + this.levels[index]) | 0;
        return hash.toString(36);
    }

    private drop(key: string): void {
        const block = this.blocks.get(key);
        if (!block) return;
        block.image.destroy();
        block.texture.destroy();
        this.blocks.delete(key);
        this.scene.markDirty();
    }

    private block(key: string, left: number, top: number): Block | undefined {
        const kept = this.blocks.get(key);
        if (kept) return kept;
        const texture = this.scene.textures.createCanvas(`relief-block:${key}`, BLOCK_TEXELS, BLOCK_TEXELS);
        if (!texture) return undefined;
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        const image = this.scene.add
            .image(left, top, texture.key)
            .setOrigin(0, 0)
            .setDisplaySize(BLOCK_PX, BLOCK_PX)
            .setDepth(RELIEF_TILES_DEPTH)
            .setVisible(!this.hidden);
        const block = { texture, image };
        this.blocks.set(key, block);
        return block;
    }

    private draw(key: string, terrain: TerrainData, now: number): void {
        const [blockX, blockY] = key.split(",").map(Number);
        const left = blockX * BLOCK_PX;
        const top = blockY * BLOCK_PX;
        const block = this.block(key, left, top);
        if (!block) return;
        const context = block.texture.getContext();
        const pixels = context.createImageData(BLOCK_TEXELS, BLOCK_TEXELS);
        const colors = new Map<number, { ground: Rgb; wall: Rgb }>();
        const samples: ColumnSample[] = [];
        for (let column = 0; column < BLOCK_TEXELS; column++) {
            const x = left + column * RELIEF_TEXEL + RELIEF_TEXEL / 2;
            samples.length = 0;
            for (let y = top - MAX_DROP + RELIEF_TEXEL / 2; y < top + BLOCK_PX; y += RELIEF_TEXEL) {
                const cellX = Math.floor(x / TERRAIN_CELL);
                const cellY = Math.floor(y / TERRAIN_CELL);
                const cellIndex = cellY * 65536 + cellX;
                let color = colors.get(cellIndex);
                if (!color) {
                    color = this.cellColors(terrain, cellX, cellY);
                    colors.set(cellIndex, color);
                }
                const height = heightAtPoint(terrain, x, y);
                const water = this.inputs.water.depthAt(x, y, now);
                if (water >= WATER_SEEN_PX) {
                    samples.push({
                        groundY: y,
                        drop: Math.min(MAX_DROP, Math.max(0, -(height + water)) * DROP_SCALE),
                        color: this.waterOver(color.ground, water),
                        wallTint: color.wall,
                        plain: false,
                    });
                } else {
                    samples.push({
                        groundY: y,
                        drop: dropAt(terrain, x, y),
                        color: color.ground,
                        wallTint: color.wall,
                        plain: height > -0.5,
                    });
                }
            }
            paintColumn(samples, BLOCK_TEXELS, top / RELIEF_TEXEL, pixels.data, BLOCK_TEXELS, column);
        }
        context.putImageData(pixels, 0, 0);
        refreshCanvasTexture(block.texture);
        block.image.setVisible(!this.hidden);
        this.scene.markDirty();
    }

    /** The colours of a cell: its ground (soil, grass, ash, snow, depth, slope) and the face of a drop at its rim. */
    private cellColors(terrain: TerrainData, cellX: number, cellY: number): { ground: Rgb; wall: Rgb } {
        let ground = over(rgb(GROUND_BASE), SNOW_COLOR, this.inputs.snowShown());
        const soil = soilAt(terrain, cellX, cellY);
        const tint = soil ? SOIL_TINTS[SOILS[soil - 1]] : undefined;
        if (tint) ground = over(ground, tint.color, tint.alpha);
        const meadow = this.inputs.meadow;
        if (meadow?.hasGrass()) {
            const cellsATile = TILE_PX / TERRAIN_CELL;
            const tileX = Math.floor(cellX / cellsATile);
            const tileY = Math.floor(cellY / cellsATile);
            const cover = meadow.grassAt(tileX, tileY);
            if (cover > 0) ground = over(ground, GRASS_COLOR, grassAlpha(mottledCover(cover, cellX, cellY)));
            const ash = meadow.ashAt(tileX, tileY);
            if (ash > 0) ground = over(ground, ASH_COLOR, ashAlpha(ash));
        }
        const height = heightAtPoint(terrain, (cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL);
        ground = over(ground, 0x000000, groundAlpha(height) * 0.6);
        const shade = slopeShade(terrain, cellX, cellY);
        ground = over(ground, shade > 0 ? 0xffffff : 0x000000, slopeAlpha(shade));
        const wall = tint
            ? over(rgb(WALL_ROCK), tint.color, WALL_SOIL_SHARE)
            : over(rgb(WALL_ROCK), GROUND_BASE, WALL_SOIL_SHARE * 0.5);
        return { ground, wall };
    }

    /** The water over a ground: light blue, darker with its depth, a pale shore where it is thin. */
    private waterOver(ground: Rgb, depth: number): Rgb {
        let water = over(ground, SHALLOW_WATER.color, SHALLOW_WATER.alpha);
        water = over(water, DEEP_WATER_COLOR, deepWaterAlpha(depth));
        if (depth < SHORE_PX) water = over(water, SHORE_WATER.color, SHORE_WATER.alpha);
        return water;
    }
}
