import { cellOf, heightAt, SOILS, soilAt, TERRAIN_CELL, TERRAIN_CHUNK } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { GameScene } from "../GameScene";
import { createBlockSurface } from "../Weather/BlockSurface";
import type { BlockCanvasArea, BlockSurface } from "../Weather/BlockSurface";
import { paddedView, wellInside } from "../Weather/WeatherFrame";
import type { WeatherView } from "../Weather/WeatherFrame";
import {
    DEEP_WATER_COLOR,
    deepWaterAlpha,
    groundAlpha,
    raisedAlpha,
    SOIL_TINTS,
    SHALLOW_WATER,
    SHORE_PX,
    SHORE_WATER,
    slopeAlpha,
    slopeShade,
} from "./TerrainShading";
import type { TerrainWater } from "./TerrainWater";

/** Over the grass of the seasons (0.6), under the puddles (0.7), the objects and the avatars. */
const TERRAIN_DEPTH = 0.65;
/** Relief drawn beyond each edge of the screen, in a share of its size: a scroll rarely asks for a new drawing. */
const DRAW_MARGIN = 0.25;
const NO_SHIFT = { columns: 0, rows: 0 };
/** While the relief is edited, the water is drawn this much fainter, so the bottom shows through. */
const SEE_THROUGH = 0.45;

/** The relief under a canvas, as layers to paint: kept from one drawing to the next. */
interface ReliefLayers extends BlockCanvasArea {
    terrain: TerrainData | undefined;
    ground: Uint8Array;
    /** The height of the cells raised over the ground. */
    raised: Uint8Array;
    /** For each soil painted on the canvas (by its number in the map): 1 on its cells. */
    soils: Map<number, Uint8Array>;
    shaded: Uint8Array;
    lit: Uint8Array;
    /** Whether any cell of the canvas is dug or sloped: nothing to paint otherwise. */
    dug: boolean;
}

/**
 * Draws the relief of the ground and the water of its hollows: one small image, a pixel for each cell of the relief,
 * painted again only when the relief, the water or the part of the map on the screen changed. A map without relief
 * is not looked at.
 */
export class TerrainView {
    private readonly surface: BlockSurface;
    private drawn: WeatherView | undefined;
    private lastKey: string | undefined;
    private visible = false;
    private seeThrough = false;
    private relief: ReliefLayers | undefined;
    private everywhere = new Uint8Array(0);
    private wet = new Uint8Array(0);
    private shore = new Uint8Array(0);

    constructor(
        private readonly scene: GameScene,
        private readonly water: TerrainWater,
        surface?: BlockSurface,
    ) {
        // Smooth: a hollow and its water have soft slopes and edges, not the squares of its cells.
        this.surface = surface ?? createBlockSurface(scene, TERRAIN_DEPTH, true);
    }

    /** While the relief is edited: the water fainter, so what is dug under it can be seen. */
    public setSeeThrough(seeThrough: boolean): void {
        this.seeThrough = seeThrough;
    }

    public update(now: number): void {
        if (!this.water.hasAnything()) {
            if (this.visible) {
                this.surface.hide();
                this.visible = false;
                this.lastKey = undefined;
                this.drawn = undefined;
                this.scene.markDirty();
            }
            return;
        }
        const camera = this.scene.cameras.main.worldView;
        const screen = { x: camera.x, y: camera.y, width: camera.width, height: camera.height };
        const key = `${this.water.drawKey(now)}:${this.seeThrough}`;
        if (key === this.lastKey && this.drawn && wellInside(this.drawn, screen, DRAW_MARGIN / 5)) return;
        this.lastKey = key;
        this.drawn = paddedView(screen, DRAW_MARGIN);
        this.draw(this.drawn, now);
        this.visible = true;
        this.scene.markDirty();
    }

    private draw(view: WeatherView, now: number): void {
        const canvas = this.surface.begin(view, TERRAIN_CELL);
        const size = canvas.columns * canvas.rows;
        const relief = this.reliefOver(canvas);
        if (this.everywhere.length !== size) {
            this.everywhere = new Uint8Array(size).fill(1);
            this.wet = new Uint8Array(size);
            this.shore = new Uint8Array(size);
        }
        const { everywhere, wet, shore } = this;
        // The soils first: the shades of the relief and the water are drawn over them.
        for (const [code, cells] of relief.soils) {
            const tint = SOIL_TINTS[SOILS[code - 1]];
            if (tint) this.surface.paintField(canvas, cells, everywhere, NO_SHIFT, tint.color, () => tint.alpha);
        }
        if (relief.dug) {
            this.surface.paintField(canvas, relief.ground, everywhere, NO_SHIFT, 0x000000, (level) =>
                groundAlpha(-level),
            );
            this.surface.paintField(canvas, relief.raised, everywhere, NO_SHIFT, 0xffffff, (level) =>
                raisedAlpha(level),
            );
            this.surface.paintField(canvas, relief.shaded, everywhere, NO_SHIFT, 0x000000, (level) =>
                slopeAlpha(level / 255),
            );
            this.surface.paintField(canvas, relief.lit, everywhere, NO_SHIFT, 0xffffff, (level) =>
                slopeAlpha(level / 255),
            );
        }
        // Water lies in the hollows, and on flat ground where they overflow or where a source pours.
        const anyWater = this.water.levelsOver(
            canvas.x / TERRAIN_CELL,
            canvas.y / TERRAIN_CELL,
            canvas.columns,
            canvas.rows,
            now,
            wet,
        );
        if (anyWater) {
            for (let index = 0; index < size; index++) shore[index] = wet[index] > 0 && wet[index] < SHORE_PX ? 1 : 0;
            const strength = this.seeThrough ? SEE_THROUGH : 1;
            this.surface.paintField(
                canvas,
                wet,
                everywhere,
                NO_SHIFT,
                SHALLOW_WATER.color,
                () => SHALLOW_WATER.alpha * strength,
            );
            this.surface.paintField(
                canvas,
                wet,
                everywhere,
                NO_SHIFT,
                DEEP_WATER_COLOR,
                (level) => deepWaterAlpha(level) * strength,
            );
            this.surface.paintField(canvas, shore, everywhere, NO_SHIFT, SHORE_WATER.color, () => SHORE_WATER.alpha);
        }
        this.surface.end();
    }

    /**
     * The relief under a canvas: how deep each cell is dug and how its slope takes the light. Read from the map once
     * for a relief and a canvas (the costly part of a drawing), then kept while the water alone moves; only the
     * chunks of the relief that hold something are looked at.
     */
    private reliefOver(canvas: BlockCanvasArea): ReliefLayers {
        const terrain: TerrainData | undefined = this.water.relief();
        const kept = this.relief;
        if (
            kept &&
            kept.terrain === terrain &&
            kept.x === canvas.x &&
            kept.y === canvas.y &&
            kept.columns === canvas.columns &&
            kept.rows === canvas.rows
        ) {
            return kept;
        }
        const size = canvas.columns * canvas.rows;
        const layers: ReliefLayers = {
            terrain,
            x: canvas.x,
            y: canvas.y,
            columns: canvas.columns,
            rows: canvas.rows,
            ground: new Uint8Array(size),
            raised: new Uint8Array(size),
            soils: new Map(),
            shaded: new Uint8Array(size),
            lit: new Uint8Array(size),
            dug: false,
        };
        const left = canvas.x / TERRAIN_CELL;
        const top = canvas.y / TERRAIN_CELL;
        for (const key of Object.keys(terrain?.soil ?? {})) {
            const chunk = cellOf(key);
            const firstColumn = Math.max(0, chunk.x * TERRAIN_CHUNK - left);
            const lastColumn = Math.min(canvas.columns, (chunk.x + 1) * TERRAIN_CHUNK - left);
            const firstRow = Math.max(0, chunk.y * TERRAIN_CHUNK - top);
            const lastRow = Math.min(canvas.rows, (chunk.y + 1) * TERRAIN_CHUNK - top);
            for (let row = firstRow; row < lastRow; row++) {
                for (let column = firstColumn; column < lastColumn; column++) {
                    const code = soilAt(terrain, left + column, top + row);
                    if (code === 0) continue;
                    let cells = layers.soils.get(code);
                    if (!cells) {
                        cells = new Uint8Array(size);
                        layers.soils.set(code, cells);
                    }
                    cells[row * canvas.columns + column] = 1;
                }
            }
        }
        for (const key of Object.keys(terrain?.chunks ?? {})) {
            const chunk = cellOf(key);
            // The cells of the chunk and one more around: a slope shows on the rim of a hollow too.
            const firstColumn = Math.max(0, chunk.x * TERRAIN_CHUNK - 1 - left);
            const lastColumn = Math.min(canvas.columns, (chunk.x + 1) * TERRAIN_CHUNK + 1 - left);
            const firstRow = Math.max(0, chunk.y * TERRAIN_CHUNK - 1 - top);
            const lastRow = Math.min(canvas.rows, (chunk.y + 1) * TERRAIN_CHUNK + 1 - top);
            for (let row = firstRow; row < lastRow; row++) {
                for (let column = firstColumn; column < lastColumn; column++) {
                    const index = row * canvas.columns + column;
                    const height = heightAt(terrain, left + column, top + row);
                    if (height < 0) {
                        layers.ground[index] = Math.min(255, -height);
                        layers.dug = true;
                    } else if (height > 0) {
                        layers.raised[index] = Math.min(255, height);
                        layers.dug = true;
                    }
                    const shade = slopeShade(terrain, left + column, top + row);
                    layers.shaded[index] = shade < 0 ? Math.round(-shade * 255) : 0;
                    layers.lit[index] = shade > 0 ? Math.round(shade * 255) : 0;
                    if (shade !== 0) layers.dug = true;
                }
            }
        }
        this.relief = layers;
        return layers;
    }

    public destroy(): void {
        this.surface.destroy();
    }
}
