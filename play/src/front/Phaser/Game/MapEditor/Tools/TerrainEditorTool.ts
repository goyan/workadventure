import { cellInMap, DEFAULT_MAX_DEPTH_TILES, heightAt, soilAt, TERRAIN_CELL, TILE_PX } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import * as Phaser from "phaser";
import { get } from "svelte/store";
import { mapEditorVisibilityStore } from "../../../../Stores/MapEditorStore";
import {
    terrainBlockedStore,
    terrainBrushStore,
    terrainContoursStore,
    terrainHoverHeightStore,
    terrainHoverMeadowStore,
    terrainHoverSoilStore,
} from "../../../../Stores/TerrainEditorStore";
import { MapDragPointerCapture } from "../../../UserInput/MapDragPointerCapture";
import { DEPTH_MAP_EDITOR_AREAS_INDEX } from "../../DepthIndexes";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../GameScene";
import { contourSegments } from "../../Terrain/TerrainContours";
import { brushSettingsOf, commitSoilStroke, commitStroke } from "../../Terrain/TerrainStroke";
import { WaterMarksView } from "../../Terrain/WaterMarksView";
import { executeUpdateTerrain } from "../Commands/Facades";
import { UpdateTerrainFrontCommand } from "../Commands/Terrain/UpdateTerrainFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { MapEditorTool } from "./MapEditorTool";

const BRUSH_COLOR = 0x7fd4ff;
const BLOCKED_COLOR = 0xff6b6b;
/** A contour line every quarter of a tile of depth, a stronger one every tile. */
const CONTOUR_STEP_PX = 8;
const CONTOUR_MAJOR_PX = TILE_PX;
/** Beyond this many pieces of lines, only the stronger ones are drawn. */
const MAX_CONTOUR_SEGMENTS = 30000;

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
    private contours: Phaser.GameObjects.Graphics | undefined;
    /** The relief the contour lines were last drawn from: drawn again when the map holds another one. */
    private contoursOf: TerrainData | null | undefined = null;
    private unsubscribeContours: (() => void) | undefined;

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
        const done =
            mode === "soil"
                ? commitSoilStroke(path, brush.diameterTiles, brush.soil ?? 0, this.terrain(), this.allowed, (soils) =>
                      executeUpdateTerrain(new Map(), undefined, soils),
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
        // The relief of the map is another object each time it is edited, here or by someone else.
        if (this.terrain() !== this.contoursOf) this.drawContours();
    }

    /** The contour lines of the relief: thin ones every quarter of a tile of depth, stronger ones every tile. */
    private drawContours(): void {
        const graphics = this.contours;
        if (!graphics) return;
        const terrain = this.terrain();
        this.contoursOf = terrain;
        graphics.clear();
        if (get(terrainContoursStore)) {
            const segments = contourSegments(terrain, CONTOUR_STEP_PX, CONTOUR_MAJOR_PX);
            const crowded = segments.length > MAX_CONTOUR_SEGMENTS;
            for (const major of [false, true]) {
                if (!major && crowded) continue;
                graphics.lineStyle(1, 0xffffff, major ? 0.75 : 0.3);
                graphics.beginPath();
                for (const segment of segments) {
                    if (segment.major !== major) continue;
                    graphics.moveTo(segment.x1, segment.y1);
                    graphics.lineTo(segment.x2, segment.y2);
                }
                graphics.strokePath();
            }
        }
        this.scene.markDirty();
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
        this.contours = this.scene.add.graphics().setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
        this.contoursOf = null;
        this.unsubscribeContours = terrainContoursStore.subscribe(() => this.drawContours());
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
        const radius = (get(terrainBrushStore).diameterTiles * TILE_PX) / 2;
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
}
