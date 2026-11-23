import * as Phaser from "phaser";
import type {
    AtLeast,
    EntityData,
    EntityDataProperties,
    EntityDataProperty,
    EntityDescriptionPropertyData,
    EntityPrefab,
    WAMEntityData,
} from "@workadventure/map-editor";
import { Season, GameMapProperties } from "@workadventure/map-editor";
import { deepmergeInto } from "deepmerge-ts";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import { SNOW_STEPS, seedOf, snowyTreeTexture, treeSnowStep } from "../Game/Nature/SnowyTreeTexture";
import { charredTreeTexture } from "../Game/Nature/CharredTreeTexture";
import { growingTreeTexture, growStep, stumpTexture, TREE_FOOT } from "../Game/Nature/FallenTreeTexture";
import { isSwayingTree } from "../Game/Nature/TreeSway";
import { parseFloorPiece } from "../Game/MapEditor/MapLayer/MapLayerFloors";
import { parseAnyLevelPrefab } from "../Game/MapEditor/MapLayer/MapLayerLevels";
import { FLOOR_LEVEL_DEPTH, floorDepth, floorPieceDepth } from "../Game/MapEditor/MapLayer/FloorDepth";
import type { ActionsMenuAction } from "../../Stores/ActionsMenuStore";
import { actionsMenuStore } from "../../Stores/ActionsMenuStore";
import { mapEditorModeStore } from "../../Stores/MapEditorStore";
import { createColorStore } from "../../Stores/OutlineColorStore";
import { getImageCoWebsiteTitle, ImageCoWebsite, isImageCoWebsiteUrl } from "../../WebRtc/CoWebsite/ImageCoWebsite";
import { SimpleCoWebsite } from "../../WebRtc/CoWebsite/SimpleCoWebsite";
import { coWebsites } from "../../Stores/CoWebsiteStore";
import type { ActivatableInterface } from "../Game/ActivatableInterface";
import { isTreadmillBelt } from "../../Utils/ObjectCategories";
import { GameScene } from "../Game/GameScene";
import type { OutlineableInterface } from "../Game/OutlineableInterface";
import { switchPropertyOf } from "../Game/Switches/SwitchTargets";
import {
    WALL_THICKNESS,
    MAP_LAYER_FLOOR_DEPTH,
    isMapLayerPrefab,
    mapLayerGroundBottom,
    parseMapLayerPrefab,
} from "../Game/MapEditor/MapLayer/MapLayerCatalog";
import {
    applyDepthStep,
    applySupportDepthFloor,
    standsOnSameFloor,
    applyHungOnWallDepth,
    applyWallDepthFloor,
    getDepthStepRange,
} from "../Game/MapEditor/MapLayer/ObjectDepthFloor";
import type {
    DepthStepRange,
    SupportDepthBox,
    WallDepthBox,
    WallFaceBox,
} from "../Game/MapEditor/MapLayer/ObjectDepthFloor";
import { SpeechDomElement } from "../Entity/SpeechDomElement";
import LL from "../../../i18n/i18n-svelte";
import { DEBUG_MODE } from "../../Enum/EnvironmentVariable";
import { TexturesHelper } from "../Helpers/TexturesHelper";
import { reachesView } from "../Game/ViewCulling";
import { hitWhereDrawn, standsOnGround } from "../Game/Terrain/GroundDrop";
import { getLayerDepth, stackableDepths } from "./EntityLayerDepth";

import Sprite = Phaser.GameObjects.Sprite;
import Graphics = Phaser.GameObjects.Graphics;

export enum EntityEvent {
    Moved = "EntityEvent:Moved",
    Updated = "EntityEvent:Updated",
    Delete = "EntityEvent:Delete",
    /**
     * Any change done to this Entity properties. Adding new one, deleting or modifying existing one.
     * We send whole array of properties with this event.
     */
    PropertyActivated = "EntityEvent:PropertyActivated",
}

export const DEFAULT_ACTIVABLE_RADIUS = 14;

// NOTE: Tiles-based entity for now. Individual images later on
/** The colour and the opacity of an object seen under the water of the relief (the blue of its shallows). */
const SUBMERGED_TINT = 0x7fb6d9;
const SUBMERGED_ALPHA = 0.55;
type HitTest = (area: unknown, x: number, y: number, object: Phaser.GameObjects.GameObject) => boolean;
/** The hit tests already brought back to where their object is drawn (Entity.hitWhereDrawn): never wrapped twice. */
const movedHitTests = new WeakSet<HitTest>();

export class Entity extends Sprite implements ActivatableInterface, OutlineableInterface {
    public readonly activationRadius: number = DEFAULT_ACTIVABLE_RADIUS;
    private readonly outlineColorStore = createColorStore();
    /** An animated treadmill: its belt moves only while someone runs on it. */
    private treadmillBelt = false;
    private readonly outlineColorStoreUnsubscribe: Unsubscriber;

    private entityData: Required<WAMEntityData>;
    /** Depth before the manual stacking, from the position of the foot and the neighbouring images. */
    private automaticDepth = 0;
    /** Whether the water of the relief covers it (a drain in a pool, in a flood): drawn as seen through the water. */
    private submerged = false;
    private prefab: EntityPrefab;
    private season = Season.Summer;
    /** How much snow covers the ground, 0 to 1: a tree under snow whitens with it, at its own pace. */
    private snowCover = 1;

    private activatable!: boolean;
    private oldPosition: { x: number; y: number };

    private updatePropertyActivableTimeOut: NodeJS.Timeout | undefined;

    private speechDomElement: SpeechDomElement | null = null;

    private debugActivationZoneCircle: Graphics | null = null;

    constructor(
        scene: GameScene,
        public readonly entityId: string,
        data: WAMEntityData,
        prefab: EntityPrefab,
    ) {
        super(scene, data.x, data.y, prefab.imagePath);
        this.setOrigin(0);

        this.oldPosition = this.getPosition();

        this.entityData = {
            ...data,
            name: data.name ?? "",
            properties: data.properties ?? [],
            depthStep: data.depthStep ?? 0,
            elevation: data.elevation ?? 0,
        };
        this.prefab = prefab;

        scene
            .getEntityPermissionsPromise()
            .then(() => {
                this.activatable = this.hasAnyPropertiesSet();
                if (this.activatable) {
                    this.setInteractive({ pixelPerfect: true, cursor: "pointer" });
                    this.scene.input.setDraggable(this);
                    this.createDebugActivationZone();
                }
            })
            .catch((error) => console.error(error));

        this.updateDepth();

        this.outlineColorStoreUnsubscribe = this.outlineColorStore.subscribe(() => {
            this.updateOutline();
        });

        this.scene.add.existing(this);
        scene.getOutlineManager().add(this, () => {
            return this.getCurrentOutline();
        });

        // Listen to drag events to update debug activation zone
        this.on(Phaser.Input.Events.DRAG, () => {
            this.updateDebugActivationZone();
        });
    }

    /**
     * Not drawn when out of what the camera of the scene shows (Phaser draws every object, on screen or not). Only
     * for that camera: a texture an object is drawn into has its own, with another view.
     */
    public override willRender(camera: Phaser.Cameras.Scene2D.Camera): boolean {
        if (!super.willRender(camera)) return false;
        if (camera !== this.scene.cameras.main) return true;
        // Drawn lower or higher on a relief seen in 3/4: in the view at its place or where it is drawn.
        const reach = Math.abs(this.groundDrop);
        return reachesView(
            { x: this.x, y: this.y - reach, width: this.displayWidth, height: this.displayHeight + 2 * reach },
            camera.worldView,
        );
    }

    /** Shows the loaded image of the prefab, played in a loop when it is an animated strip. */
    public showPrefabTexture(): this {
        const animation = this.prefab.animation;
        const animationKey = animation
            ? TexturesHelper.addEntityAnimation(this.scene, this.prefab.imagePath, animation)
            : undefined;
        const scene = this.scene as GameScene;
        // The depth offset locates the ground contact above an image's transparent bottom margin.
        const sheltered =
            scene
                .getOutdoorGrid?.()
                ?.isOutdoorAt(
                    this.x + this.displayWidth / 2,
                    this.y + this.displayHeight + (this.prefab.depthOffset ?? 0) - 1,
                ) === false;
        const season = this.season === Season.Winter && sheltered ? Season.Summer : this.season;
        const seasonalPath = this.prefab.seasonal?.[season];
        // A tree under snow turns white but its trunk: its own summer image, covered (see snowyTreeTexture). Anything
        // else with a drawn winter image (a pine, a rock, a stump) shows its summer image covering as the snow settles,
        // and its winter image once the ground is white: no object is whiter than the ground around it.
        const step = this.snowCover >= 1 ? SNOW_STEPS : treeSnowStep(this.snowCover, seedOf(this.entityId));
        const snowyTree =
            this.prefab.seasonal && season === Season.Winter && (isSwayingTree(this.prefab.id) || step < SNOW_STEPS)
                ? snowyTreeTexture(this.scene, this.prefab.seasonal?.[Season.Summer] ?? this.prefab.imagePath, step)
                : undefined;
        const shown =
            snowyTree ??
            (seasonalPath && this.scene.textures.exists(seasonalPath) ? seasonalPath : this.prefab.imagePath);
        // A tree the fire took is its own image of the season, charred as far as it burnt: no snow settles on it.
        // Not while the map is edited: the trees then show their plain image, as the rest of the weather is hidden.
        const charred =
            isSwayingTree(this.prefab.id) && !get(mapEditorModeStore)
                ? (scene.getTreeFire?.().degreeOf(this.entityId) ?? 0)
                : 0;
        const unsnowed =
            seasonalPath && this.scene.textures.exists(seasonalPath) ? seasonalPath : this.prefab.imagePath;
        // A tree the wind laid down: its stump stands while it lies on the ground (drawn by FallenTreeView), then it
        // grows back from its foot. Not while the map is edited either.
        const fallen =
            isSwayingTree(this.prefab.id) && !get(mapEditorModeStore)
                ? scene.getTreeFire?.().fallenOf(this.entityId)
                : undefined;
        const fallenTexture = fallen
            ? fallen.lying
                ? stumpTexture(this.scene, unsnowed)
                : growingTreeTexture(this.scene, unsnowed, growStep(fallen.grown))
            : undefined;
        scene.getFallenTreeView?.()?.show(
            this.entityId,
            fallen?.lying
                ? {
                      textureKey: unsnowed,
                      footX: this.x + TREE_FOOT.x,
                      footY: this.y + TREE_FOOT.y,
                      toward: fallen.toward,
                      depth: this.depth,
                  }
                : undefined,
        );
        this.setTexture(
            fallenTexture ?? (charred > 0 ? charredTreeTexture(this.scene, unsnowed, charred) : undefined) ?? shown,
        );
        if (animationKey) {
            this.play(animationKey);
        }
        this.treadmillBelt =
            animationKey !== undefined && isTreadmillBelt(this.prefab, scene.wamFile?.settings?.categories);
        if (this.treadmillBelt) this.setBeltMoving(scene.treadmillBelts.isMoving(this.entityId));
        return this;
    }

    /** A treadmill shows its first image while nobody runs on it, and moves its belt while someone does. */
    public setBeltMoving(moving: boolean): void {
        const animation = this.anims.currentAnim;
        if (!this.treadmillBelt || !animation) return;
        if (moving) this.anims.resume();
        else this.anims.pause(animation.frames[0]);
        (this.scene as GameScene).markDirty();
    }

    public setSeason(season: Season, snowCover = 1): void {
        this.season = season;
        this.snowCover = snowCover;
        if (this.prefab.seasonal) this.showPrefabTexture();
    }

    public get description(): string | undefined {
        const descriptionProperty = this.entityData.properties.find(
            (p): p is EntityDescriptionPropertyData => p.type === "entityDescriptionProperties",
        );
        return descriptionProperty?.description;
    }

    public get searchable(): boolean | undefined {
        const descriptionProperty = this.entityData.properties.find(
            (p): p is EntityDescriptionPropertyData => p.type === "entityDescriptionProperties",
        );
        return descriptionProperty?.searchable;
    }

    public get canEdit(): boolean {
        // Checked at the top-left corner (the entity position), like map-storage does: it is the only point
        // of the entity the server knows, so any other point would let the UI offer edits the server refuses.
        return (this.scene as GameScene)
            .getEntityPermissions()
            .canEdit({ x: this.x, y: this.y, z: this.entityData.elevation });
    }

    public get canRead(): boolean {
        return (this.scene as GameScene)
            .getEntityPermissions()
            .canRead({ ...this.getCenter(), z: this.entityData.elevation });
    }

    /**
     * This method is being used after command execution from outside and it will not trigger any emits
     */
    /**
     * Moves the entity to another level (0: the ground), over the same place of the ground: its image is drawn the
     * difference of altitude higher or lower. Saved like any other edit of the entity.
     */
    public setElevation(elevation: number): void {
        if (elevation === this.entityData.elevation) return;
        const y = this.y + this.entityData.elevation - elevation;
        this.emit(EntityEvent.Updated, this.appendId({ y, elevation }));
    }

    /** Altitude of the floor the entity stands on, in pixels above the ground: 0 on the ground. */
    public getElevation(): number {
        return this.entityData.elevation;
    }

    public updateEntity(dataToModify: Partial<WAMEntityData>): void {
        deepmergeInto(this.entityData, dataToModify);
        // TODO: Find a way to update it without need of using conditions
        if (dataToModify.properties !== undefined) {
            this.entityData.properties = dataToModify.properties;
        }

        this.setPosition(this.entityData.x, this.entityData.y);
        this.updateDepth();
        this.oldPosition = this.getPosition();
        const wasActivatable = this.activatable;
        this.activatable = this.hasAnyPropertiesSet();
        if (this.activatable) {
            this.setInteractive({ pixelPerfect: true, cursor: "pointer" });
            this.scene.input.setDraggable(this);
            if (!wasActivatable) {
                this.createDebugActivationZone();
            } else {
                this.updateDebugActivationZone();
            }
        } else {
            if (!get(mapEditorModeStore)) {
                this.disableInteractive();
            }
            this.destroyDebugActivationZone();
        }
    }

    public destroy(): void {
        this.outlineColorStoreUnsubscribe();
        this.destroyDebugActivationZone();
        super.destroy();
    }

    public getPosition(): { x: number; y: number } {
        return { x: this.x, y: this.y };
    }

    /**
     * Returns the activation rectangle for this entity.
     * The rectangle is centered on the entity's bounding box and extends by activationRadius on all sides.
     */
    public getActivationRectangle(): { x: number; y: number; width: number; height: number } {
        // Entity position is top-left corner (setOrigin(0))
        const entityRect = {
            x: this.x,
            y: this.y,
            width: this.displayWidth,
            height: this.displayHeight,
        };

        // Expand the rectangle by activationRadius on all sides
        return {
            x: entityRect.x - this.activationRadius,
            y: entityRect.y - this.activationRadius,
            width: entityRect.width + this.activationRadius * 2,
            height: entityRect.height + this.activationRadius * 2,
        };
    }

    /**
     * Returns the collision rectangle for this entity (without activation radius).
     */
    public getCollisionRectangle(): { x: number; y: number; width: number; height: number } {
        return {
            x: this.x,
            y: this.y,
            width: this.displayWidth,
            height: this.displayHeight,
        };
    }

    public activate(): void {
        if (!this.canEdit && !this.canRead) {
            return;
        }
        if (get(mapEditorModeStore)) {
            actionsMenuStore.clear();
            return;
        }
        if (!this.hasAnyPropertiesSet()) {
            return;
        }
        this.toggleActionsMenu();
    }

    public deactivate(): void {
        actionsMenuStore.clear();
    }

    public getCollisionGrid(): number[][] | undefined {
        return this.prefab.collisionGrid;
    }

    public getReversedCollisionGrid(): number[][] | undefined {
        return this.prefab.collisionGrid?.map((row) => row.map((value) => (value === 1 ? -1 : value)));
    }

    public setFollowOutlineColor(color: number): void {
        this.outlineColorStore.setFollowColor(color);
    }

    public removeFollowOutlineColor(): void {
        this.outlineColorStore.removeFollowColor();
    }

    public setApiOutlineColor(color: number): void {
        this.outlineColorStore.setApiColor(color);
    }

    public removeApiOutlineColor(): void {
        this.outlineColorStore.removeApiColor();
    }

    public setEditColor(color: number): void {
        this.outlineColorStore.setEditColor(color);
    }

    public removeEditColor(): void {
        this.outlineColorStore.removeEditColor();
    }

    public setPointedToEditColor(color: number): void {
        this.outlineColorStore.setPointedToEditColor(color);
    }

    public removePointedToEditColor(): void {
        this.outlineColorStore.removePointedToEditColor();
    }

    public pointerOverOutline(color: number): void {
        this.outlineColorStore.pointerOver(color);
    }

    public pointerOutOutline(): void {
        this.outlineColorStore.pointerOut();
    }

    public characterCloseByOutline(color: number): void {
        this.outlineColorStore.characterCloseBy(color);
    }

    public characterFarAwayOutline(): void {
        this.outlineColorStore.characterFarAway();
    }

    public delete() {
        this.emit(EntityEvent.Delete);
    }

    public isActivatable(): boolean {
        return this.activatable;
    }

    public getEntityData(): Required<WAMEntityData> {
        return this.entityData;
    }

    /**
     * Shows the object under the water (tinted by it, half seen through it) while the water of the relief covers it,
     * and as it is again once the water went down: a drain is seen at the bottom of a pool until it emptied it.
     */
    public setSubmerged(submerged: boolean): void {
        if (submerged === this.submerged) return;
        this.submerged = submerged;
        if (submerged) {
            this.setTint(SUBMERGED_TINT);
            this.setAlpha(SUBMERGED_ALPHA);
        } else {
            this.clearTint();
            this.setAlpha(1);
        }
    }

    public getPrefab(): EntityPrefab {
        return this.prefab;
    }

    /** The custom image was edited in the catalog: draw this copy with the new settings. */
    public setPrefab(prefab: EntityPrefab): void {
        this.prefab = prefab;
        this.updateDepth();
    }

    /**
     * Floors and walls of the map layer belong to the Map tool: no editor tool or player may click, select or drag them.
     * `prefab` is not set yet when Phaser builds the object, hence the optional access.
     */
    public override setInteractive(
        hitArea?: Phaser.Types.Input.InputConfiguration | unknown,
        callback?: Phaser.Types.Input.HitAreaCallback,
        dropZone?: boolean,
    ): this {
        if (this.prefab && isMapLayerPrefab(this.prefab.collectionName, this.prefab.id)) {
            // Callers also make the object draggable, which needs an input object: give it one that nothing can hit.
            return super.setInteractive({
                hitArea: new Phaser.Geom.Rectangle(0, 0, 0, 0),
                hitAreaCallback: () => false,
            });
        }
        super.setInteractive(hitArea, callback, dropZone);
        this.hitWhereDrawn();
        return this;
    }

    /**
     * Phaser tests a click against the place of the object, which never moves: drawn lower or higher on a relief seen
     * in 3/4 (getGroundDrop), it is clicked where it is seen.
     */
    private hitWhereDrawn(): void {
        const input = this.input;
        const test = input?.hitAreaCallback as HitTest | undefined;
        if (!input || !test || movedHitTests.has(test)) return;
        const whereDrawn = hitWhereDrawn<unknown, Entity>(
            (area, x, y) => test(area, x, y, this),
            () => this.groundDrop,
        );
        const moved: HitTest = (area, x, y) => whereDrawn(area, x, y, this);
        movedHitTests.add(moved);
        input.hitAreaCallback = moved;
    }

    /** How much lower the object is drawn, standing on a relief seen in 3/4 (higher on a mount): see PlacedDrops. */
    private groundDrop = 0;
    public getGroundDrop(): number {
        return this.groundDrop;
    }

    /** Draws the object this much lower, only while the image is drawn (CharacterDrops): its place never changes. */
    public setGroundDrop(drop: number): void {
        const rounded = Math.round(drop);
        if (rounded === this.groundDrop) return;
        this.groundDrop = rounded;
        // (Its scene is gone once it is destroyed.)
        (this.scene as GameScene | undefined)?.markDirty();
    }

    /** Whether the object stands on the ground, and so follows it on a relief seen in 3/4 (standsOnGround). */
    public standsOnGround(): boolean {
        const { collectionName, id, layer } = this.prefab;
        return standsOnGround({
            cartePiece:
                isMapLayerPrefab(collectionName, id) ||
                parseFloorPiece(collectionName, id) !== undefined ||
                parseAnyLevelPrefab(collectionName, id) !== undefined,
            layer,
            elevation: this.entityData.elevation,
        });
    }

    /**
     * Objects are sorted by the y of their foot, like the characters. The floors of the map layer are the lowest
     * level above the ground tiles: nothing, neither a character nor a companion walking over a tile row, may go under.
     */
    public updateDepth(depthOffset: number = this.prefab.depthOffset ?? 0): void {
        const floorPiece = parseFloorPiece(this.prefab.collectionName, this.prefab.id);
        if (floorPiece) {
            // A slab or a stair of the raised floors: in the band of depths of its altitude.
            this.setDepth(floorPieceDepth(floorPiece, this.x, this.y, this.entityData.elevation));
            return;
        }
        const hung = this.updateGroundDepth(depthOffset);
        // Standing on a raised floor: the same order among the things of its floor, in the band of its altitude.
        // (What is always over everything, like a ceiling lamp, stays where it is; what hangs on a wall is drawn
        // right over that wall.)
        if (!hung && this.entityData.elevation > 0 && this.depth < FLOOR_LEVEL_DEPTH) {
            this.setDepth(floorDepth(this.entityData.elevation, this.depth));
        }
    }

    /** The depth the entity has standing on the ground, sorted by its foot. */
    /** Returns whether the object hangs on the face of a wall (it is then drawn right over that wall). */
    private updateGroundDepth(depthOffset: number): boolean {
        if (parseMapLayerPrefab(this.prefab.collectionName, this.prefab.id)?.kind === "floor") {
            this.setDepth(MAP_LAYER_FLOOR_DEPTH);
            return false;
        }
        if (this.prefab.layer === "floor" || this.prefab.layer === "overhead") {
            // Fixed levels, whatever the position of the players: under all of them (a pool, a rug) or over all of
            // them (a ceiling lamp). Among themselves, the manual stacking of the editor still applies.
            this.automaticDepth = getLayerDepth(this.prefab.layer, this.y + this.displayHeight);
            this.setDepth(applyDepthStep(this.automaticDepth, this.entityData.depthStep, this.getStackableDepths()));
            return false;
        }
        const naturalDepth = this.y + this.displayHeight + depthOffset;
        if (isMapLayerPrefab(this.prefab.collectionName, this.prefab.id)) {
            this.setDepth(naturalDepth);
            return false;
        }
        const elevation = this.entityData.elevation;
        // Above the ground with a slab of its altitude under its foot: it stands on that floor. Without one, it
        // may hang on a wall.
        let standsOnFloor = false;
        const box = { x: this.x, y: this.y, width: this.displayWidth, height: this.displayHeight };
        const walls: WallDepthBox[] = [];
        const faces: WallFaceBox[] = [];
        const supports: SupportDepthBox[] = [];
        for (const neighbour of this.getOverlappingEntities()) {
            const prefab = neighbour.getPrefab();
            const neighbourBox = {
                x: neighbour.x,
                y: neighbour.y,
                width: neighbour.displayWidth,
                height: neighbour.displayHeight,
                depth: neighbour.depth,
                naturalDepth: neighbour.y + neighbour.displayHeight + (prefab.depthOffset ?? 0),
            };
            if (
                elevation > 0 &&
                neighbour.getElevation() === elevation &&
                parseFloorPiece(prefab.collectionName, prefab.id) !== undefined &&
                box.y + box.height > neighbour.y &&
                box.y + box.height <= neighbour.y + neighbour.displayHeight + 1
            ) {
                standsOnFloor = true;
            }
            const anyLevelPiece = parseAnyLevelPrefab(prefab.collectionName, prefab.id);
            const piece = parseMapLayerPrefab(prefab.collectionName, prefab.id);
            if (anyLevelPiece && !piece) {
                // A wall of a raised floor: something can hang on its face too.
                if (
                    anyLevelPiece.kind === "facade" ||
                    anyLevelPiece.kind === "lintel" ||
                    anyLevelPiece.kind === "end"
                ) {
                    faces.push({
                        ...neighbourBox,
                        y: neighbour.y + WALL_THICKNESS,
                        height: neighbour.displayHeight - WALL_THICKNESS,
                    });
                }
            } else if (piece) {
                if (piece.kind === "facade" || piece.kind === "lintel" || piece.kind === "end") {
                    // The south face of the wall, under its cap: where a painting hangs.
                    faces.push({
                        ...neighbourBox,
                        y: neighbour.y + WALL_THICKNESS,
                        height: neighbour.displayHeight - WALL_THICKNESS,
                    });
                }
                if (depthOffset < 0 && piece.kind !== "floor") {
                    // A high wall draws its cap above the tiles north of it: the wall stands where its foot is.
                    walls.push({ ...neighbourBox, footY: mapLayerGroundBottom(piece, neighbour.y) });
                }
            } else if (
                this.prefab.seat === undefined &&
                standsOnSameFloor(elevation, {
                    elevation: neighbour.getElevation(),
                    floorPiece: parseFloorPiece(prefab.collectionName, prefab.id) !== undefined,
                })
            ) {
                supports.push({ ...neighbourBox, collisionGrid: prefab.collisionGrid });
            }
        }
        // Sorted above its foot: a wall crossing it must not hide it when it stands on the tile in front of that wall.
        // Hung on the face of a wall (a painting up a high wall): over that wall.
        // Only above the ground: on the ground the same image stands behind the wall.
        const behindWalls = applyWallDepthFloor(naturalDepth, box, walls);
        const wallDepth = elevation > 0 && !standsOnFloor ? applyHungOnWallDepth(behindWalls, box, faces) : behindWalls;
        const hung = wallDepth !== behindWalls;
        // An object standing on another one (a plant on a table) is drawn over it.
        this.automaticDepth = applySupportDepthFloor(wallDepth, box, supports);
        // Then the manual stacking chosen in the editor, relative to the images it overlaps.
        this.setDepth(applyDepthStep(this.automaticDepth, this.entityData.depthStep, this.getStackableDepths()));
        return hung;
    }

    /** Depths of the images this one overlaps. The floors stay under everything: no object goes below them. */
    private getStackableDepths(): number[] {
        return stackableDepths(
            this.prefab.layer,
            this.getOverlappingEntities()
                .filter(
                    (entity) =>
                        parseMapLayerPrefab(entity.prefab.collectionName, entity.prefab.id)?.kind !== "floor" &&
                        standsOnSameFloor(this.entityData.elevation, {
                            elevation: entity.getElevation(),
                            floorPiece: parseFloorPiece(entity.prefab.collectionName, entity.prefab.id) !== undefined,
                        }),
                )
                .map((entity) => ({ layer: entity.prefab.layer, depth: entity.depth })),
        );
    }

    /** How many images the object can still be moved over (`up`) or under (`down`) with its manual stacking. */
    public getDepthStepRange(): DepthStepRange {
        return getDepthStepRange(this.automaticDepth, this.getStackableDepths());
    }

    /** The other entities whose image overlaps this one. */
    public getOverlappingEntities(): Entity[] {
        const entitiesManager = (this.scene as GameScene).getGameMapFrontWrapper?.()?.getEntitiesManager?.();
        const overlapping: Entity[] = [];
        for (const entity of entitiesManager?.getEntities().values() ?? []) {
            if (
                entity !== this &&
                entity.x < this.x + this.displayWidth &&
                this.x < entity.x + entity.displayWidth &&
                entity.y < this.y + this.displayHeight &&
                this.y < entity.y + entity.displayHeight
            ) {
                overlapping.push(entity);
            }
        }
        return overlapping;
    }

    public getProperties(): EntityDataProperties {
        return this.entityData.properties;
    }

    public addProperty(property: EntityDataProperty): void {
        // A new list, as in setProperty: the one in place may also be the map's, read by the undo.
        this.entityData.properties = [...this.entityData.properties, property];
        this.emit(EntityEvent.Updated, this.appendId({ properties: this.entityData.properties }));
    }

    /**
     * Sets the property of this type (added when the entity has none) and, when a position is given, moves the
     * entity, in one update: a single step to undo.
     */
    public setProperty(property: EntityDataProperty, position?: { x: number; y: number }): void {
        const index = this.entityData.properties.findIndex((existing) => existing.type === property.type);
        // A new list: the one in place is also the map's, which the update reads to know what an undo brings back.
        this.entityData.properties =
            index === -1
                ? [...this.entityData.properties, property]
                : this.entityData.properties.map((existing, at) => (at === index ? property : existing));
        this.emit(EntityEvent.Updated, this.appendId({ properties: this.entityData.properties, ...position }));
    }

    public setEntityName(name: string): void {
        this.entityData.name = name;
        this.emit(EntityEvent.Updated, this.appendId({ name }));
    }

    public updateProperty(changes: AtLeast<EntityDataProperty, "id">): void {
        // New objects, as in setProperty: the property in place may also be the map's, read by the undo.
        this.entityData.properties = this.entityData.properties.map((property) => {
            if (property.id !== changes.id) {
                return property;
            }
            const updated = structuredClone(property);
            deepmergeInto(updated, changes);
            return updated;
        });
        this.onPropertiesUpdated();
    }

    private onPropertiesUpdated(): void {
        this.emit(EntityEvent.Updated, this.appendId({ properties: this.entityData.properties }));

        // Update activatable status
        if (this.updatePropertyActivableTimeOut) clearTimeout(this.updatePropertyActivableTimeOut);
        this.updatePropertyActivableTimeOut = setTimeout(() => {
            const wasActivatable = this.activatable;
            this.activatable = this.hasAnyPropertiesSet();
            if (this.activatable) {
                this.setInteractive({ pixelPerfect: true, cursor: "pointer" });
                this.scene.input.setDraggable(this);
                if (!wasActivatable) {
                    this.createDebugActivationZone();
                }
            } else {
                this.destroyDebugActivationZone();
            }
        }, 500);
    }

    public deleteProperty(id: string): boolean {
        const index = this.entityData.properties.findIndex((property) => property.id === id);
        if (index !== -1) {
            // A new list, as in setProperty: the one in place may also be the map's, read by the undo.
            this.entityData.properties = this.entityData.properties.filter((property) => property.id !== id);
            this.emit(EntityEvent.Updated, this.appendId({ properties: this.entityData.properties }));
            return true;
        } else {
            return false;
        }
    }

    public getOldPosition(): { x: number; y: number } {
        return this.oldPosition;
    }

    private getCurrentOutline(): { thickness: number; color?: number } {
        return { thickness: 2, color: get(this.outlineColorStore) };
    }

    private hasAnyPropertiesSet(): boolean {
        if (!this.canEdit && !this.canRead) {
            return false;
        }
        return Boolean(this.description?.trim()) || this.getDefaultActionsMenuActions().length > 0;
    }

    private toggleActionsMenu(): void {
        const previousActionsMenu = get(actionsMenuStore);
        if (previousActionsMenu !== undefined) {
            actionsMenuStore.clear();
            // If the previous actions menu is for the same entity, don't create a new one
            if (previousActionsMenu.id === this.entityId) return;
        }

        // If there is only one action in the default actions menu, execute it
        const defaultActionsMenu = this.getDefaultActionsMenuActions();
        if (defaultActionsMenu.length === 1) {
            const action = defaultActionsMenu[0].callback();
            if (action instanceof Promise)
                action.catch((error) => console.error("Error during executing the default action: " + error));
            return;
        }

        const description = this.entityData.properties.find(
            (p): p is EntityDescriptionPropertyData => p.type === "entityDescriptionProperties",
        );
        actionsMenuStore.initialize(
            this.entityId,
            this.entityData.name != undefined && this.entityData.name != ""
                ? this.entityData.name
                : (this.prefab.name ?? ""),
            description?.description,
            this.prefab.imagePath,
        );
        for (const action of defaultActionsMenu) {
            actionsMenuStore.addAction(action);
        }
    }

    private updateOutline() {
        if (this.scene instanceof GameScene) {
            this.scene.getOutlineManager().update(this);
        } else {
            throw new Error("Not the Game Scene");
        }
    }

    private getDefaultActionsMenuActions(): ActionsMenuAction[] {
        if (!this.entityData.properties) {
            return [];
        }
        const actions: ActionsMenuAction[] = [];
        const properties = this.entityData.properties;

        for (const property of properties) {
            switch (property.type) {
                //TODO: see if we add livekit here
                case "jitsiRoomProperty": {
                    const roomName = property.roomName;
                    const roomConfig = property.jitsiRoomConfig;
                    actions.push({
                        actionName: property.buttonLabel ?? "",
                        protected: true,
                        priority: 1,
                        callback: () => {
                            this.emit(
                                EntityEvent.PropertyActivated,
                                {
                                    propertyName: GameMapProperties.JITSI_ROOM,
                                    propertyValue: roomName,
                                },
                                {
                                    propertyName: GameMapProperties.JITSI_CONFIG,
                                    propertyValue: JSON.stringify(roomConfig),
                                },
                            );
                            actionsMenuStore.clear();
                        },
                    });
                    break;
                }
                case "openWebsite": {
                    // TODO add description to the empty interaction
                    if (!property.link) break;
                    const link = property.link;
                    const newTab = property.newTab;
                    actions.push({
                        actionName: property.buttonLabel ?? "",
                        protected: true,
                        priority: 1,
                        callback: () => {
                            if (newTab) {
                                this.emit(EntityEvent.PropertyActivated, {
                                    propertyName: GameMapProperties.OPEN_TAB,
                                    propertyValue: link,
                                });
                            } else {
                                const coWebsite = new SimpleCoWebsite(
                                    new URL(link),
                                    property.allowAPI,
                                    property.policy,
                                    property.width,
                                    property.closable,
                                );
                                try {
                                    coWebsites.add(coWebsite);
                                } catch (error) {
                                    console.error("Error during loading a co-website: " + coWebsite.getUrl(), error);
                                }
                            }
                            actionsMenuStore.clear();
                        },
                    });
                    break;
                }
                case "playAudio": {
                    const playAudioProperty = property;
                    actions.push({
                        actionName: property.buttonLabel ?? "",
                        protected: true,
                        priority: 1,
                        callback: () => {
                            // Not routed through EntityEvent.PropertyActivated: that path only
                            // reacts to values that change, so the same sound could not be played
                            // twice in a row, and it carries the URL alone, losing the volume.
                            (this.scene as GameScene).getEntityAudioManager().play(this.entityId, playAudioProperty);
                        },
                    });
                    break;
                }
                case "switchPropertyData": {
                    // A switch: sets the state of the objects it commands (see GameSwitches).
                    // Read through the checked reader: the property may come from an edit command as it was sent.
                    const switchProperty = switchPropertyOf(this);
                    const action = switchProperty
                        ? (this.scene as GameScene).getSwitches()?.actionOf(this, switchProperty)
                        : undefined;
                    if (action) actions.push(action);
                    break;
                }
                case "openFile": {
                    if (!property.link) break;
                    const newTab = property.newTab;
                    actions.push({
                        actionName: property.buttonLabel ?? "",
                        protected: true,
                        priority: 1,
                        callback: async () => {
                            const answer = await (this.scene as GameScene).connection?.queryMapStorageJwtToken();
                            const link = property.link + (answer && answer.jwt ? `?token=${answer.jwt}` : "");

                            if (newTab) {
                                this.emit(EntityEvent.PropertyActivated, {
                                    propertyName: GameMapProperties.OPEN_TAB,
                                    propertyValue: link,
                                });
                            } else {
                                const url = new URL(link);
                                const coWebsite = isImageCoWebsiteUrl(url)
                                    ? new ImageCoWebsite(
                                          url,
                                          property.name ?? getImageCoWebsiteTitle(url),
                                          property.width,
                                          property.closable,
                                      )
                                    : new SimpleCoWebsite(
                                          url,
                                          false, // No need for API in file viewer
                                          property.policy,
                                          property.width,
                                          property.closable,
                                      );
                                try {
                                    coWebsites.add(coWebsite);
                                } catch (error) {
                                    console.error("Error during loading a co-website: " + coWebsite.getUrl(), error);
                                }
                            }
                            actionsMenuStore.clear();
                        },
                    });
                    break;
                }
            }
        }
        return actions;
    }

    private appendId(data: Partial<WAMEntityData>): Partial<EntityData> {
        return {
            ...data,
            id: this.entityId,
        };
    }

    // Play text on the entity
    public playText(id: string, text: string, duration = 10000, callback = () => this.destroyText()) {
        const x = this.x + this.width / 2;
        // Over the object where it is drawn: lower in a hollow of a relief seen in 3/4, higher on a mount.
        const y = this.y + this.groundDrop;
        this.speechDomElement = new SpeechDomElement(id, text, this.scene, x, y - 10, callback);
        this.scene.add.existing(this.speechDomElement);
        this.speechDomElement.play(x, y - 20, duration);
    }

    // Destroy text
    public destroyText() {
        if (this.speechDomElement) {
            this.speechDomElement.destroy();
            this.speechDomElement = null;
        }
    }

    // Get action button label from properties
    get actionButtonLabel(): string {
        if (this.entityData.properties.length === 0)
            return get(LL).mapEditor.explorer.details.moveToEntity({ name: "" });
        const property = this.entityData.properties.find((p) => p.type !== "entityDescriptionProperties");
        if (!property) return get(LL).mapEditor.explorer.details.moveToEntity({ name: "" });

        const properties = get(LL).mapEditor.properties;
        let propertyKey = property.type as keyof typeof properties;

        // If the property is an openWebsite and the application is not website, we need to use the application as the property key
        if (propertyKey === "openWebsite" && "application" in property) {
            const openWebsiteProperty = property as { application: string };
            if (openWebsiteProperty.application != "website") {
                propertyKey = openWebsiteProperty.application as keyof typeof properties;
            }
        }

        const propertyTranslation = properties[propertyKey];
        if (
            propertyTranslation != undefined &&
            "actionButtonLabel" in propertyTranslation &&
            typeof (propertyTranslation as { actionButtonLabel?: unknown }).actionButtonLabel === "function"
        ) {
            return (propertyTranslation as { actionButtonLabel: () => string }).actionButtonLabel();
        }
        return get(LL).mapEditor.explorer.details.moveToEntity({ name: "" });
    }

    /**
     * Creates a debug visualization of the activation zone around the entity
     * Only visible when debug mode is enabled in localStorage
     */
    private createDebugActivationZone(): void {
        if (!DEBUG_MODE || !this.activatable) {
            return;
        }

        this.destroyDebugActivationZone();

        this.debugActivationZoneCircle = this.scene.add.graphics();

        // Get rectangles
        const collisionRect = this.getCollisionRectangle();
        const activationRect = this.getActivationRectangle();

        // Draw activation zone rectangle (green)
        this.debugActivationZoneCircle.lineStyle(2, 0x00ff00, 0.8); // Green rectangle with transparency
        this.debugActivationZoneCircle.strokeRect(
            activationRect.x,
            activationRect.y,
            activationRect.width,
            activationRect.height,
        );

        // Draw collision rectangle (blue)
        this.debugActivationZoneCircle.lineStyle(2, 0x0000ff, 0.8); // Blue rectangle with transparency
        this.debugActivationZoneCircle.strokeRect(
            collisionRect.x,
            collisionRect.y,
            collisionRect.width,
            collisionRect.height,
        );

        // Draw center marker - red cross at the center of the collision rectangle
        const centerX = collisionRect.x + collisionRect.width / 2;
        const centerY = collisionRect.y + collisionRect.height / 2;
        const crossSize = 12;
        const crossThickness = 3;
        this.debugActivationZoneCircle.lineStyle(crossThickness, 0xff0000, 1.0); // Red cross, fully opaque
        // Horizontal line
        this.debugActivationZoneCircle.lineBetween(centerX - crossSize, centerY, centerX + crossSize, centerY);
        // Vertical line
        this.debugActivationZoneCircle.lineBetween(centerX, centerY - crossSize, centerX, centerY + crossSize);

        // Draw small filled circle at center for better visibility
        const centerMarkerRadius = 3;
        this.debugActivationZoneCircle.fillStyle(0xff0000, 1.0); // Red filled circle
        this.debugActivationZoneCircle.fillCircle(centerX, centerY, centerMarkerRadius);

        // Set depth above the entity so the visualization is visible
        this.debugActivationZoneCircle.setDepth(this.depth + 1000); // Render above the entity
        this.debugActivationZoneCircle.setScrollFactor(this.scrollFactorX, this.scrollFactorY);
    }

    /**
     * Updates the position of the debug activation zone visualization
     */
    private updateDebugActivationZone(): void {
        if (!DEBUG_MODE || !this.debugActivationZoneCircle || !this.activatable) {
            return;
        }

        this.debugActivationZoneCircle.clear();

        // Get rectangles
        const collisionRect = this.getCollisionRectangle();
        const activationRect = this.getActivationRectangle();

        // Draw activation zone rectangle (green)
        this.debugActivationZoneCircle.lineStyle(2, 0x00ff00, 0.8); // Green rectangle with transparency
        this.debugActivationZoneCircle.strokeRect(
            activationRect.x,
            activationRect.y,
            activationRect.width,
            activationRect.height,
        );

        // Draw collision rectangle (blue)
        this.debugActivationZoneCircle.lineStyle(2, 0x0000ff, 0.8); // Blue rectangle with transparency
        this.debugActivationZoneCircle.strokeRect(
            collisionRect.x,
            collisionRect.y,
            collisionRect.width,
            collisionRect.height,
        );

        // Draw center marker - red cross at the center of the collision rectangle
        const centerX = collisionRect.x + collisionRect.width / 2;
        const centerY = collisionRect.y + collisionRect.height / 2;
        const crossSize = 12;
        const crossThickness = 3;
        this.debugActivationZoneCircle.lineStyle(crossThickness, 0xff0000, 1.0); // Red cross, fully opaque
        // Horizontal line
        this.debugActivationZoneCircle.lineBetween(centerX - crossSize, centerY, centerX + crossSize, centerY);
        // Vertical line
        this.debugActivationZoneCircle.lineBetween(centerX, centerY - crossSize, centerX, centerY + crossSize);

        // Draw small filled circle at center for better visibility
        const centerMarkerRadius = 3;
        this.debugActivationZoneCircle.fillStyle(0xff0000, 1.0); // Red filled circle
        this.debugActivationZoneCircle.fillCircle(centerX, centerY, centerMarkerRadius);

        // Set depth above the entity so the visualization is visible
        this.debugActivationZoneCircle.setDepth(this.depth + 1000); // Ensure it stays above the entity
    }

    /**
     * Destroys the debug activation zone circle
     */
    private destroyDebugActivationZone(): void {
        if (this.debugActivationZoneCircle) {
            this.debugActivationZoneCircle.destroy();
            this.debugActivationZoneCircle = null;
        }
    }
}
