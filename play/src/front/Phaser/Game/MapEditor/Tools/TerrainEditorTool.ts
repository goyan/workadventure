import {
    cellInMap,
    cellOf,
    DEFAULT_MAX_DEPTH_TILES,
    heightAt,
    poolSoilCode,
    soilAt,
    TERRAIN_CELL,
    TILE_PX,
} from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Phaser from "phaser";
import { get } from "svelte/store";
import { poolAt, poolShapeChanges, shapeCells, toggledLadders } from "@wa/front/Phaser/Game/Terrain/PoolShapes";
import type { Point } from "@wa/front/Phaser/Game/Terrain/PoolShapes";
import { ContourView } from "@wa/front/Phaser/Game/Terrain/ContourView";
import { mapEditorVisibilityStore } from "../../../../Stores/MapEditorStore";
import {
    terrainBlockedStore,
    terrainBrushStore,
    terrainContoursStore,
    terrainHoverHeightStore,
    terrainHoverMeadowStore,
    terrainHoverSoilStore,
    selectedPoolStore,
} from "../../../../Stores/TerrainEditorStore";
import { MapDragPointerCapture } from "../../../UserInput/MapDragPointerCapture";
import { DEPTH_MAP_EDITOR_AREAS_INDEX } from "../../DepthIndexes";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../GameScene";
import { brushSettingsOf, commitSoils, commitSoilStroke, commitStroke } from "../../Terrain/TerrainStroke";
import { WaterMarksView } from "../../Terrain/WaterMarksView";
import { executeUpdateTerrain, executeUpdateWAMSettings } from "../Commands/Facades";
import { UpdateTerrainFrontCommand } from "../Commands/Terrain/UpdateTerrainFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { MapEditorTool } from "./MapEditorTool";

const BRUSH_COLOR = 0x7fd4ff;
const BLOCKED_COLOR = 0xff6b6b;
const SELECTED_POOL_COLOR = 0xffd166;
/**
 * The relief tool of the map editor: a sphere pressed into the ground digs it, the same shape fills it back; the
 * ground is also flattened towards a level, or smoothed. The contour lines of the relief are drawn while it is open. A click
 * or a drag is one stroke: it is sent when the button is released, as one command (undone as one), and Escape drops
 * it. The ground is dug outdoors only, never under a wall.
 */
export class TerrainEditorTool extends MapEditorTool {
    private readonly scene: GameScene;
    private graphics: Phaser.GameObjects.Graphics | undefined;
    /** The stroke under way: the points the pointer went through, in map pixels. */
    private path: { x: number; y: number }[] | undefined;
    private pointerId: number | undefined;
    private hover: { x: number; y: number } | undefined;
    private pointerCapture: MapDragPointerCapture | undefined;
    private unsubscribeBrush: (() => void) | undefined;
    /** The sources and the sinks of the map, pointed out while the tool is open: they are hard to find otherwise. */
    private waterMarks: WaterMarksView | undefined;
    /** The contour lines of the relief, while the tool is open. */
    private contours: ContourView | undefined;
    private unsubscribeContours: (() => void) | undefined;
    /** The outline of the pool picked with a click, drawn again when another one is picked. */
    private selection: Phaser.GameObjects.Graphics | undefined;
    private unsubscribeSelection: (() => void) | undefined;

    private readonly pointerDownEventHandler = (pointer: Phaser.Input.Pointer): void => {
        if (!pointer.leftButtonDown() || this.path) return;
        this.pointerId = pointer.id;
        this.path = [{ x: pointer.worldX, y: pointer.worldY }];
        this.redraw();
    };
    private readonly pointerMoveEventHandler = (pointer: Phaser.Input.Pointer): void => {
        this.hover = { x: pointer.worldX, y: pointer.worldY };
        if (this.path && pointer.id === this.pointerId) this.path.push(this.hover);
        const cellX = this.cellOf(this.hover.x);
        const cellY = this.cellOf(this.hover.y);
        terrainBlockedStore.set(!this.allowed(cellX, cellY));
        terrainHoverHeightStore.set(this.onMap(cellX, cellY) ? heightAt(this.terrain(), cellX, cellY) : undefined);
        terrainHoverSoilStore.set(this.onMap(cellX, cellY) ? soilAt(this.terrain(), cellX, cellY) : undefined);
        const meadow = this.scene.getMeadow();
        terrainHoverMeadowStore.set(
            this.onMap(cellX, cellY)
                ? {
                      moisture: meadow.moistureAt(this.hover.x, this.hover.y),
                      grass: meadow.coverAt(this.hover.x, this.hover.y),
                  }
                : undefined,
        );
        this.redraw();
    };
    private readonly pointerUpEventHandler = (pointer: Phaser.Input.Pointer): void => {
        if (!this.path || pointer.id !== this.pointerId) return;
        const path = this.path;
        this.cancelStroke();
        const brush = get(terrainBrushStore);
        const { mode } = brush;
        if (mode === "pool" && brush.poolTool === "ladder") {
            this.toggleLadder(path[path.length - 1]);
            return;
        }
        if (mode === "pool" && this.pickPool(path)) return;
        selectedPoolStore.set(undefined);
        const shape = mode === "pool" ? (brush.poolTool ?? "rectangle") : undefined;
        const done =
            shape && shape !== "brush" && shape !== "ladder"
                ? commitSoils(
                      poolShapeChanges(
                          this.terrain(),
                          shapeCells(shape === "ellipse" ? "ellipse" : "rectangle", path[0], path[path.length - 1]),
                          brush.soil ?? poolSoilCode(0),
                          shape === "eraser",
                          this.allowed,
                      ),
                      (soils) => executeUpdateTerrain(new Map(), undefined, soils),
                  )
                : mode === "soil" || mode === "pool"
                  ? commitSoilStroke(
                        path,
                        brush.diameterTiles,
                        brush.soil ?? 0,
                        this.terrain(),
                        this.allowed,
                        (soils) => executeUpdateTerrain(new Map(), undefined, soils),
                    )
                  : commitStroke(
                        path,
                        brushSettingsOf(
                            { ...brush, mode },
                            this.terrain()?.maxDepthTiles ?? DEFAULT_MAX_DEPTH_TILES,
                            heightAt(this.terrain(), this.cellOf(path[0].x), this.cellOf(path[0].y)),
                        ),
                        this.terrain(),
                        this.allowed,
                        (changes) => executeUpdateTerrain(changes),
                    );
        done.catch((error: unknown) => console.error("The relief could not be edited", error));
    };
    private readonly cancelEventHandler = (): void => {
        this.cancelStroke();
    };
    private readonly gameOutEventHandler = (): void => {
        // A captured stroke never really leaves the canvas: it ends on pointer up or Escape.
        if (this.pointerCapture?.active) return;
        this.hover = undefined;
        terrainHoverHeightStore.set(undefined);
        terrainHoverSoilStore.set(undefined);
        terrainHoverMeadowStore.set(undefined);
        this.cancelStroke();
    };
    /**
     * On the map, outdoors, not under a raised floor or a wall of the map tool. Without a grid of the outdoors,
     * everywhere on the map. Never past the edges of the map: the ground shown there is only a picture.
     */
    private readonly allowed = (cellX: number, cellY: number): boolean => {
        if (!this.onMap(cellX, cellY)) return false;
        const grid = this.scene.getOutdoorGrid();
        return !grid || grid.isOutdoorAt((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL);
    };

    constructor(private readonly mapEditorModeManager: MapEditorModeManager) {
        super();
        this.scene = mapEditorModeManager.getScene();
    }

    private onMap(cellX: number, cellY: number): boolean {
        const map = this.scene.Map;
        return cellInMap(cellX, cellY, {
            width: Math.ceil(map.widthInPixels / TERRAIN_CELL),
            height: Math.ceil(map.heightInPixels / TERRAIN_CELL),
        });
    }

    public update(time: number, dt: number): void {
        this.waterMarks?.update(time);
        this.contours?.update(this.terrain());
    }

    public activate(): void {
        this.scene.input.topOnly = true;
        this.graphics = this.scene.add.graphics().setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancelEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.addEventListener("blur", this.cancelEventHandler);
        this.pointerCapture = new MapDragPointerCapture(
            this.scene.game.canvas,
            () => true,
            () => this.cancelStroke(),
        );
        this.unsubscribeBrush = terrainBrushStore.subscribe(() => this.redraw());
        this.selection = this.scene.add.graphics().setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
        this.unsubscribeSelection = selectedPoolStore.subscribe((pool) => this.drawSelection(pool));
        const contours = new ContourView(this.scene, DEPTH_MAP_EDITOR_AREAS_INDEX);
        this.contours = contours;
        this.unsubscribeContours = terrainContoursStore.subscribe((wanted) =>
            contours.setWanted(wanted, this.terrain()),
        );
        this.waterMarks = new WaterMarksView(this.scene, () => this.scene.getGameMap().getWamFile()?.getWam());
        // The bottom of the lakes shows through their water while the relief is edited.
        this.scene.getTerrainView()?.setSeeThrough(true);
        mapEditorVisibilityStore.set(true);
    }

    public clear(): void {
        this.cancelStroke();
        this.hover = undefined;
        this.unsubscribeBrush?.();
        this.unsubscribeBrush = undefined;
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancelEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.gameOutEventHandler);
        window.removeEventListener("blur", this.cancelEventHandler);
        this.pointerCapture?.destroy();
        this.pointerCapture = undefined;
        this.graphics?.destroy();
        this.graphics = undefined;
        this.unsubscribeSelection?.();
        this.unsubscribeSelection = undefined;
        this.selection?.destroy();
        this.selection = undefined;
        selectedPoolStore.set(undefined);
        this.waterMarks?.destroy();
        this.waterMarks = undefined;
        this.unsubscribeContours?.();
        this.unsubscribeContours = undefined;
        this.contours?.destroy();
        this.contours = undefined;
        terrainHoverHeightStore.set(undefined);
        this.scene.getTerrainView()?.setSeeThrough(false);
        terrainBlockedStore.set(false);
        this.scene.input.topOnly = false;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.clear();
    }

    public subscribeToGameMapFrontWrapperEvents(gameMapFrontWrapper: GameMapFrontWrapper): void {}

    public handleKeyDownEvent(event: KeyboardEvent): void {
        if (event.key === "Escape") this.cancelStroke();
    }

    /** The relief dug by another editor of the map, applied here too. */
    public async handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        const message = editMapCommandMessage.editMapMessage?.message;
        if (message?.$case !== "modifyTerrainMessage") return;
        const wam = this.scene.getGameMap().getWamFile()?.getWam();
        if (!wam) return;
        await this.mapEditorModeManager.executeLocalCommand(
            new UpdateTerrainFrontCommand(wam, message.modifyTerrainMessage, editMapCommandMessage.id),
        );
    }

    /**
     * A click that does not move, in the pool mode, on a pool: picks it whole (and its style), nothing painted. Any
     * other stroke draws.
     */
    private pickPool(path: readonly Point[]): boolean {
        const first = path[0];
        const last = path[path.length - 1];
        if (this.cellOf(first.x) !== this.cellOf(last.x) || this.cellOf(first.y) !== this.cellOf(last.y)) return false;
        if (get(terrainBrushStore).poolTool === "eraser") return false;
        const pool = poolAt(this.terrain(), this.cellOf(first.x), this.cellOf(first.y));
        if (!pool) return false;
        selectedPoolStore.set(pool);
        terrainBrushStore.update((brush) => ({ ...brush, soil: poolSoilCode(pool.style) }));
        return true;
    }

    /** The ladder tool: a ladder put on the top edge of the pool clicked, or taken off. */
    private toggleLadder(point: Point): void {
        const ladders = toggledLadders(
            this.terrain(),
            this.cellOf(point.x),
            this.cellOf(point.y),
            this.scene.getGameMap().getWamFile()?.getWam().settings?.poolLadders,
        );
        if (!ladders) return;
        executeUpdateWAMSettings({
            $case: "updatePoolLaddersSettingMessage",
            updatePoolLaddersSettingMessage: { cells: ladders },
        }).catch((error: unknown) => console.error("The ladder could not be placed", error));
    }

    private drawSelection(pool: { cells: readonly string[] } | undefined): void {
        const graphics = this.selection;
        if (!graphics) return;
        graphics.clear();
        if (pool) {
            graphics.fillStyle(SELECTED_POOL_COLOR, 0.28);
            for (const key of pool.cells) {
                const { x, y } = cellOf(key);
                graphics.fillRect(x * TERRAIN_CELL, y * TERRAIN_CELL, TERRAIN_CELL, TERRAIN_CELL);
            }
        }
        this.scene.markDirty();
    }

    private terrain(): TerrainData | undefined {
        return this.scene.getGameMap().getWamFile()?.getWam().terrain;
    }

    private cellOf(pixels: number): number {
        return Math.floor(pixels / TERRAIN_CELL);
    }

    private cancelStroke(): void {
        this.path = undefined;
        this.pointerId = undefined;
        this.pointerCapture?.release();
        this.redraw();
    }

    /** The brush under the pointer (red where the ground may not be dug) and the stroke under way. */
    private redraw(): void {
        const graphics = this.graphics;
        if (!graphics) return;
        graphics.clear();
        const brush = get(terrainBrushStore);
        const shape = brush.mode === "pool" ? (brush.poolTool ?? "rectangle") : undefined;
        if (shape && shape !== "brush") {
            this.drawShapePreview(graphics, shape);
            this.scene.markDirty();
            return;
        }
        const radius = (brush.diameterTiles * TILE_PX) / 2;
        if (this.path && this.path.length > 1) {
            graphics.lineStyle(radius * 2, BRUSH_COLOR, 0.18);
            graphics.beginPath();
            graphics.moveTo(this.path[0].x, this.path[0].y);
            for (const point of this.path.slice(1)) graphics.lineTo(point.x, point.y);
            graphics.strokePath();
        }
        if (this.hover) {
            const blocked = !this.allowed(this.cellOf(this.hover.x), this.cellOf(this.hover.y));
            graphics.lineStyle(1, blocked ? BLOCKED_COLOR : BRUSH_COLOR, 0.9);
            graphics.strokeCircle(this.hover.x, this.hover.y, radius);
            if (this.path) {
                graphics.fillStyle(BRUSH_COLOR, 0.25);
                graphics.fillCircle(this.hover.x, this.hover.y, radius);
            }
        }
        this.scene.markDirty();
    }

    /** The cell under the pointer, and while dragging the shape that will be drawn (red for the eraser). */
    private drawShapePreview(
        graphics: Phaser.GameObjects.Graphics,
        shape: "rectangle" | "ellipse" | "eraser" | "ladder",
    ): void {
        const color = shape === "eraser" ? BLOCKED_COLOR : BRUSH_COLOR;
        // The ladder is put with a click: only the cell under the pointer is shown.
        const from = shape === "ladder" ? undefined : this.path?.[0];
        const to = this.path?.[this.path.length - 1] ?? this.hover;
        if (from && to) {
            const left = Math.floor(Math.min(from.x, to.x) / TERRAIN_CELL) * TERRAIN_CELL;
            const top = Math.floor(Math.min(from.y, to.y) / TERRAIN_CELL) * TERRAIN_CELL;
            const width = Math.floor(Math.max(from.x, to.x) / TERRAIN_CELL) * TERRAIN_CELL + TERRAIN_CELL - left;
            const height = Math.floor(Math.max(from.y, to.y) / TERRAIN_CELL) * TERRAIN_CELL + TERRAIN_CELL - top;
            graphics.fillStyle(color, 0.25);
            graphics.lineStyle(1, color, 0.9);
            if (shape === "ellipse") {
                graphics.fillEllipse(left + width / 2, top + height / 2, width, height);
                graphics.strokeEllipse(left + width / 2, top + height / 2, width, height);
            } else {
                graphics.fillRect(left, top, width, height);
                graphics.strokeRect(left, top, width, height);
            }
            return;
        }
        if (!this.hover) return;
        const blocked = !this.allowed(this.cellOf(this.hover.x), this.cellOf(this.hover.y));
        graphics.lineStyle(1, blocked ? BLOCKED_COLOR : color, 0.9);
        graphics.strokeRect(
            this.cellOf(this.hover.x) * TERRAIN_CELL,
            this.cellOf(this.hover.y) * TERRAIN_CELL,
            TERRAIN_CELL,
            TERRAIN_CELL,
        );
    }
}
