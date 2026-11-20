import type * as Phaser from "phaser";
import * as Sentry from "@sentry/svelte";
import { asError } from "catch-unknown";
import { get } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import type { WAMEntityData } from "@workadventure/map-editor";
import { SLAB_GLASS_FAMILY, SLAB_WOOD_FAMILY, newStairIsShort } from "../MapLayer/MapLayerFloors";
import { FLOOR_PREVIEW_DEPTH } from "../MapLayer/FloorDepth";
import { mapEditorPlacementLevelStore } from "../../../../Stores/MapEditorStore";
import {
    isFloorMode,
    mapLayerFloorFamilyStore,
    mapLayerGlassSlabsAvailableStore,
    mapLayerSlabGlassStore,
    mapLayerLevelStore,
    mapLayerBuiltLevelsStore,
    mapLayerLevelsStore,
    mapLayerModeStore,
    mapLayerStairDirectionStore,
    mapLayerStairTargetStore,
    mapLayerStairOpenStore,
    mapLayerStairWidthStore,
    mapLayerShortStairsAvailableStore,
    mapLayerBridgePiecesAvailableStore,
    mapLayerSlabWoodStore,
    mapLayerStairRampStore,
    mapLayerStatusStore,
} from "../../../../Stores/MapLayerStore";
import { LL } from "../../../../../i18n/i18n-svelte";
import type { GameScene } from "../../GameScene";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import type { FrontCommand } from "../Commands/FrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { MAP_LAYER_TILE_SIZE } from "../MapLayer/MapLayerCatalog";
import { FloorModel, stairImagePosition } from "../MapLayer/FloorModel";
import { stairOutline } from "../MapLayer/MapLayerTarget";
import {
    applySlabs,
    availableLevels,
    canPlaceStair,
    computeFloorPlacements,
    canMoveStair,
    diffFloorPlacements,
    floorCellAt,
    floorPlacementKey,
    levelUnderPoint,
    moveStair,
    placeStair,
    stairUnderPoint,
    stairTargets,
    stairArrivalCells,
    stairHasArrival,
    stairRiseBetween,
    stairTarget,
} from "../MapLayer/FloorOperations";
import type { PlacedFloorEntity } from "../MapLayer/FloorOperations";
import { parseAnyLevelPrefab } from "../MapLayer/MapLayerLevels";
import {
    FLOOR_WALL_HEIGHTS,
    floorElevation,
    floorLevelTiles,
    floorPieceSize,
    parseFloorPiece,
    stairGroundBox,
    stairScreenBox,
} from "../MapLayer/MapLayerFloors";
import type { StairShape } from "../MapLayer/MapLayerFloors";
import type { MapBounds, Point } from "../MapLayer/MapLayerOperations";
import { MAX_ENTITIES_PER_OPERATION } from "../MapLayer/MapLayerSync";

const OK_COLOR = 0x22c55e;
const REFUSED_COLOR = 0xef4444;
/** A placed stair the pointer would grab: the one a drag moves. */
const GRAB_COLOR = 0xffffff;
/** The tiles one steps onto at the top of a stair: with a slab, and without one. */
const ARRIVAL_COLOR = 0x3b82f6;
const PREVIEW_MODEL_MS = 300;
const MISSING_COLOR = 0xf97316;

/** An edit of the floors, applied to their model; false when it changes nothing or is refused. */
type FloorOperation = (model: FloorModel, bounds: MapBounds) => boolean;

/**
 * The part of the "Map" tool that edits the raised floors: slabs, stairs and their wells. Like the walls, the floors
 * are rebuilt from the entities of their catalog after each gesture, which is one undo step.
 */
export class MapLayerFloorEditing {
    private graphics: Phaser.GameObjects.Graphics | undefined;
    /** The name of the level being edited, next to the pointer: the same point of the screen is a tile of each level. */
    private label: Phaser.GameObjects.Text | undefined;
    /** The floors read from the map for the previews, kept a short while: the pointer moves often. */
    private cached: { model: FloorModel; at: number } | undefined;
    private unsubscribeMode: (() => void) | undefined;

    constructor(
        private readonly scene: GameScene,
        private readonly mapEditorModeManager: MapEditorModeManager,
        private readonly getBounds: () => MapBounds,
    ) {}

    public activate(): void {
        this.graphics = this.scene.add.graphics().setDepth(FLOOR_PREVIEW_DEPTH);
        this.label = this.scene.add
            .text(0, 0, "", { fontSize: "11px", color: "#ffffff", backgroundColor: "#1b2a41", padding: { x: 3, y: 1 } })
            .setDepth(FLOOR_PREVIEW_DEPTH + 1)
            .setVisible(false);
        // Slabs are laid above the ground: choosing that mode on the ground goes to a floor, a built one if any.
        this.unsubscribeMode = mapLayerModeStore.subscribe((mode) => {
            if (mode !== "slab" || get(mapLayerLevelStore) !== 0) return;
            // (Unless the level follows the pointer: the slabs then go where a floor is drawn.)
            if (get(mapEditorPlacementLevelStore) === "auto") return;
            const level = get(mapLayerBuiltLevelsStore)[0] ?? get(mapLayerLevelsStore)[0];
            if (level !== undefined) mapEditorPlacementLevelStore.set(level);
        });
        this.refreshLevels();
    }

    public clear(): void {
        this.graphics?.destroy();
        this.graphics = undefined;
        this.label?.destroy();
        this.label = undefined;
        this.unsubscribeMode?.();
        this.unsubscribeMode = undefined;
        this.cached = undefined;
    }

    /** The floors of the map for the previews: read again at most a few times per second, and after an edit. */
    public previewModel(): FloorModel {
        const now = performance.now();
        if (!this.cached || now - this.cached.at > PREVIEW_MODEL_MS) {
            this.cached = { model: this.readModel(), at: now };
        }
        return this.cached.model;
    }

    public readModel(): FloorModel {
        const items = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            items.push({
                x: entity.x,
                y: entity.y,
                collectionName: prefab.collectionName,
                prefabId: prefab.id,
                elevation: entity.getElevation(),
            });
        }
        return FloorModel.fromPlaced(items);
    }

    private readPlaced(): PlacedFloorEntity[] {
        const placed: PlacedFloorEntity[] = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            if (parseFloorPiece(prefab.collectionName, prefab.id) === undefined) continue;
            placed.push({
                entityId: entity.entityId,
                key: floorPlacementKey(prefab.id, entity.x, entity.y, entity.getEntityData().elevation ?? 0),
            });
        }
        return placed;
    }

    /** The floors the panel offers; the one being edited goes back to the ground when it is no longer offered. */
    public refreshLevels(): void {
        const model = this.readModel();
        // The walls standing on a floor carry the next one: their tops are levels too.
        const wallTops: number[] = [];
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            const elevation = entity.getElevation();
            if (!(elevation > 0)) continue;
            const prefab = entity.getPrefab();
            const piece = parseAnyLevelPrefab(prefab.collectionName, prefab.id);
            if (piece && piece.kind !== "floor" && piece.height >= 2) {
                const height = FLOOR_WALL_HEIGHTS.find((candidate) => candidate === piece.height);
                if (height) wallTops.push(elevation + floorElevation(height));
            }
        }
        const levels = availableLevels(model, wallTops, get(mapLayerBridgePiecesAvailableStore));
        mapLayerLevelsStore.set(levels);
        mapLayerBuiltLevelsStore.set(model.getLevels());
    }

    /** The pipette: the floor drawn under the pointer becomes the one being edited. */
    public pickLevel(world: Point): void {
        // A level picked on the map is a level chosen: the panel shows it selected.
        mapEditorPlacementLevelStore.set(levelUnderPoint(this.readModel(), world.x, world.y));
    }

    /** Whether a stair that starts from the level being edited is under this point: it can be grabbed and moved. */
    public hasStairAt(world: Point): boolean {
        const level = get(mapLayerLevelStore);
        return stairUnderPoint(this.previewModel(), level, world.x, world.y) !== undefined;
    }

    /** The floor drawn under a point of the screen (the ground where there is none), from the floors last read. */
    public levelAt(world: Point): number {
        return levelUnderPoint(this.previewModel(), world.x, world.y);
    }

    /** The stair the mode would place from the level being edited; undefined when no floor is in reach of a stair. */
    private stairShape(): StairShape | undefined {
        const level = get(mapLayerLevelStore);
        const reachable = stairTargets(level, get(mapLayerLevelsStore));
        const target = stairTarget(reachable, get(mapLayerBuiltLevelsStore), get(mapLayerStairTargetStore));
        const rise = target === undefined ? undefined : stairRiseBetween(level, target);
        // The stairs of 20 px came with the pieces of the bridges.
        if (rise === undefined || (rise === 20 && !get(mapLayerBridgePiecesAvailableStore))) return undefined;
        const direction = get(mapLayerStairDirectionStore);
        if (get(mapLayerStairRampStore) && get(mapLayerBridgePiecesAvailableStore)) {
            return { direction, width: get(mapLayerStairWidthStore), rise, open: true, ramp: true };
        }
        return {
            direction,
            width: get(mapLayerStairWidthStore),
            rise,
            open: get(mapLayerStairOpenStore),
            ...(newStairIsShort(direction, get(mapLayerShortStairsAvailableStore)) ? { short: true } : {}),
        };
    }

    private operation(start: Point, end: Point): FloorOperation | undefined {
        const mode = get(mapLayerModeStore);
        const level = get(mapLayerLevelStore);
        const from = floorCellAt(start.x, start.y, level);
        const to = floorCellAt(end.x, end.y, level);
        if (mode === "slab") {
            // Of glass when the switch is on and the catalog has the glass slab; else of the floor chosen.
            const family =
                get(mapLayerSlabWoodStore) && get(mapLayerBridgePiecesAvailableStore)
                    ? SLAB_WOOD_FAMILY
                    : get(mapLayerSlabGlassStore) && get(mapLayerGlassSlabsAvailableStore)
                      ? SLAB_GLASS_FAMILY
                      : get(mapLayerFloorFamilyStore);
            return (model, bounds) => {
                applySlabs(model, level, from, to, family, bounds);
                return true;
            };
        }
        if (mode === "stair") {
            // A press on a stair already placed moves it, with its own shape: the panel sets the next one only.
            if (stairUnderPoint(this.readModel(), level, start.x, start.y)) {
                // A click on a stair, not a drag: nothing to move, nothing to explain.
                if (from.x === to.x && from.y === to.y) return undefined;
                return (model, bounds) => {
                    const picked = stairUnderPoint(model, level, start.x, start.y);
                    return (
                        picked !== undefined &&
                        moveStair(
                            model,
                            picked,
                            { x: picked.foot.x + to.x - from.x, y: picked.foot.y + to.y - from.y },
                            bounds,
                        )
                    );
                };
            }
            const shape = this.stairShape();
            return (model, bounds) => shape !== undefined && placeStair(model, shape, to, level, bounds);
        }
        return undefined;
    }

    /** Draws what the gesture (or, without one, a click here) would do. */
    public draw(start: Point | undefined, current: Point | undefined): void {
        const graphics = this.graphics;
        if (!graphics) return;
        graphics.clear();
        this.scene.markDirty();
        const size = MAP_LAYER_TILE_SIZE;
        const mode = get(mapLayerModeStore);
        const level = get(mapLayerLevelStore);
        if (!isFloorMode(mode)) {
            this.label?.setVisible(false);
            return;
        }
        // The stairs already placed that lead nowhere: the tiles of their top without a slab.
        const placedModel = this.previewModel();
        for (const stair of placedModel.getStairs()) {
            if (stairHasArrival(placedModel, stair)) continue;
            graphics.lineStyle(2, MISSING_COLOR, 1);
            for (const cell of stairArrivalCells(stair)) {
                const x = cell.x * size;
                const y = cell.y * size - stair.top;
                graphics.strokeRect(x + 1, y + 1, size - 2, size - 2);
                graphics.lineBetween(x + 1, y + 1, x + size - 1, y + size - 1);
                graphics.lineBetween(x + size - 1, y + 1, x + 1, y + size - 1);
            }
        }
        if (!current) {
            this.label?.setVisible(false);
            return;
        }
        const levelName =
            level === 0
                ? get(LL).mapEditor.mapLayer.floorLevel.ground()
                : get(LL).mapEditor.mapLayer.floorLevel.cursor({ height: floorLevelTiles(level) });
        this.label
            ?.setText(levelName)
            .setPosition(current.x + 14, current.y + 14)
            .setVisible(true);
        const to = floorCellAt(current.x, current.y, level);
        if (mode === "stair") {
            // Over a placed stair, a press grabs it (a drag moves it, a click does nothing): that stair is outlined,
            // not a new one.
            const hovered = start ? undefined : stairUnderPoint(placedModel, level, current.x, current.y);
            if (hovered) {
                const outline = stairOutline(hovered);
                graphics.fillStyle(GRAB_COLOR, 0.2);
                graphics.fillRect(outline.x, outline.y, outline.width, outline.height);
                graphics.lineStyle(2, GRAB_COLOR, 0.9);
                graphics.strokeRect(outline.x, outline.y, outline.width, outline.height);
                return;
            }
            // A gesture that starts on a placed stair moves it: the preview is that stair, at the tile reached.
            const picked = start ? stairUnderPoint(placedModel, level, start.x, start.y) : undefined;
            const shape = picked?.shape ?? this.stairShape();
            if (!shape) return;
            const model = placedModel;
            const origin = start ? floorCellAt(start.x, start.y, level) : to;
            const target = picked ? { x: picked.foot.x + to.x - origin.x, y: picked.foot.y + to.y - origin.y } : to;
            const fits = picked
                ? canMoveStair(model, picked, target, this.getBounds())
                : canPlaceStair(model, shape, target, level, this.getBounds());
            const color = fits ? OK_COLOR : REFUSED_COLOR;
            const top = level + shape.rise;
            const ground = stairGroundBox(shape, target);
            // Where the stair will show.
            const image = stairImagePosition(shape, target, level);
            const box = stairScreenBox(shape, target);
            graphics.fillStyle(color, 0.3);
            graphics.fillRect(image.x, image.y, box.width, box.height);
            graphics.lineStyle(2, color, 1);
            graphics.strokeRect(image.x, image.y, box.width, box.height);

            const cells: { x: number; y: number }[] = [];
            for (let x = ground.x / size; x < (ground.x + ground.width) / size; x++) {
                for (let y = ground.y / size; y < (ground.y + ground.height) / size; y++) cells.push({ x, y });
            }
            // The slabs of the floor it reaches that its well removes.
            graphics.fillStyle(REFUSED_COLOR, 0.45);
            for (const cell of cells) {
                if (model.hasSlab(top, cell.x, cell.y))
                    graphics.fillRect(cell.x * size, cell.y * size - top, size, size);
            }
            // The tiles of that floor one steps onto at the top: blue with a slab, orange without (the stair would
            // lead nowhere).
            const horizontal = shape.direction === "e" || shape.direction === "o";
            const beyond =
                shape.direction === "n"
                    ? ground.y / size - 1
                    : shape.direction === "s"
                      ? (ground.y + ground.height) / size
                      : shape.direction === "e"
                        ? (ground.x + ground.width) / size
                        : ground.x / size - 1;
            for (let i = 0; i < shape.width; i++) {
                const cell = horizontal ? { x: beyond, y: ground.y / size + i } : { x: ground.x / size + i, y: beyond };
                const arrival = model.hasSlab(top, cell.x, cell.y) ? ARRIVAL_COLOR : MISSING_COLOR;
                graphics.fillStyle(arrival, 0.35);
                graphics.fillRect(cell.x * size, cell.y * size - top, size, size);
                graphics.lineStyle(2, arrival, 1);
                graphics.strokeRect(cell.x * size, cell.y * size - top, size, size);
            }
            // From the first step (the dot, on the floor it starts from) to the top (the arrow head, on the floor it
            // reaches).
            const centreX = ground.x + ground.width / 2;
            const centreY = ground.y + ground.height / 2;
            const foot =
                shape.direction === "n"
                    ? { x: centreX, y: ground.y + ground.height - size / 2 }
                    : shape.direction === "s"
                      ? { x: centreX, y: ground.y + size / 2 }
                      : shape.direction === "e"
                        ? { x: ground.x + size / 2, y: centreY }
                        : { x: ground.x + ground.width - size / 2, y: centreY };
            const head =
                shape.direction === "n"
                    ? { x: centreX, y: ground.y }
                    : shape.direction === "s"
                      ? { x: centreX, y: ground.y + ground.height }
                      : shape.direction === "e"
                        ? { x: ground.x + ground.width, y: centreY }
                        : { x: ground.x, y: centreY };
            const from = { x: foot.x, y: foot.y - level };
            const tip = { x: head.x, y: head.y - top };
            graphics.lineStyle(3, 0xffffff, 1);
            graphics.lineBetween(from.x, from.y, tip.x, tip.y);
            graphics.fillStyle(0xffffff, 1);
            graphics.fillCircle(from.x, from.y, 4);
            const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
            graphics.fillTriangle(
                tip.x,
                tip.y,
                tip.x - 9 * Math.cos(angle - 0.5),
                tip.y - 9 * Math.sin(angle - 0.5),
                tip.x - 9 * Math.cos(angle + 0.5),
                tip.y - 9 * Math.sin(angle + 0.5),
            );
            return;
        }
        if (mode === "slab" && level === 0) return;
        const from = start ? floorCellAt(start.x, start.y, level) : to;
        const x = Math.min(from.x, to.x) * size;
        const y = Math.min(from.y, to.y) * size - level;
        const width = (Math.abs(to.x - from.x) + 1) * size;
        const height = (Math.abs(to.y - from.y) + 1) * size;
        graphics.fillStyle(OK_COLOR, 0.3);
        graphics.fillRect(x, y, width, height);
        graphics.lineStyle(2, OK_COLOR, 1);
        graphics.strokeRect(x, y, width, height);
    }

    /**
     * The commands that make the entities of the map match the floors once `change` has been applied to their model:
     * the slabs and stairs it no longer has are deleted, the missing ones created. Undefined when that would touch too
     * many entities.
     */
    public commandsFor(change: (model: FloorModel) => void): FrontCommand[] | undefined {
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!wamFile) return [];
        const entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();
        const model = this.readModel();
        change(model);
        const diff = diffFloorPlacements(this.readPlaced(), computeFloorPlacements(model));
        if (diff.toCreate.length + diff.toDelete.length > MAX_ENTITIES_PER_OPERATION) return undefined;
        const commands: FrontCommand[] = diff.toDelete.map(
            (entityId) => new DeleteEntityFrontCommand(wamFile, entityId, undefined, entitiesManager),
        );
        for (const item of diff.toCreate) {
            const piece = parseFloorPiece(item.collectionName, item.prefabId);
            if (!piece) continue;
            const entityData: WAMEntityData = {
                x: item.x,
                y: item.y,
                prefabRef: { collectionName: item.collectionName, id: item.prefabId },
                properties: [],
                elevation: item.elevation,
            };
            commands.push(
                new CreateEntityFrontCommand(
                    wamFile,
                    uuidv4(),
                    entityData,
                    undefined,
                    entitiesManager,
                    floorPieceSize(piece),
                ),
            );
        }
        return commands;
    }

    /** Applies the gesture of a floor mode as one undo step. */
    public commit(start: Point, end: Point): void {
        this.graphics?.clear();
        if (get(mapLayerModeStore) === "slab" && get(mapLayerLevelStore) === 0) {
            mapLayerStatusStore.set("slabOnGround");
            return;
        }
        const operation = this.operation(start, end);
        const wamFile = this.scene.getGameMap().getWamFile();
        if (!operation || !wamFile) return;
        const stairMode = get(mapLayerModeStore) === "stair";
        /** Whether the stair just placed leads nowhere yet. */
        let stairLeadsNowhere = false;

        // The factory runs inside the command queue, right before execution: it reads the current state of the map.
        const factory = (): readonly FrontCommand[] => {
            let refused = false;
            const commands = this.commandsFor((model) => {
                refused = !operation(model, this.getBounds());
                if (refused) return;
                const placedStair = stairMode ? model.getStairs().at(-1) : undefined;
                stairLeadsNowhere = placedStair !== undefined && !stairHasArrival(model, placedStair);
            });
            if (refused) {
                if (stairMode) mapLayerStatusStore.set("stairInvalid");
                return [];
            }
            if (commands === undefined) {
                mapLayerStatusStore.set("tooLarge");
                return [];
            }
            return commands;
        };

        this.mapEditorModeManager
            .executeCommands(factory)
            .then(() => {
                this.cached = undefined;
                this.refreshLevels();
                if (stairLeadsNowhere) mapLayerStatusStore.set("stairNoArrival");
            })
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Failed to edit the floors", cause);
                mapLayerStatusStore.set("failed");
                Sentry.captureException(cause);
            });
    }
}
