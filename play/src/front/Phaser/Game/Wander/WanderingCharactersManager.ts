import type { LifeFire } from "@workadventure/map-editor";
import * as Phaser from "phaser";
import { get, type Unsubscriber } from "svelte/store";
import { DEFAULT_LIFE_SETTINGS } from "@workadventure/map-editor";
import { getSeats } from "../../Player/Seat";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { PathfindingManager, PathTileType } from "../../../Utils/PathfindingManager";
import type { TileBarriers } from "../../../Utils/TileBarriers";
import { getWaterRectangles } from "../Water/WaterZones";
import { getPrefabCollisionRectangles } from "../../../Utils/PrefabCollisionRectangles";
import { isMapLayerPrefab } from "../MapEditor/MapLayer/MapLayerCatalog";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { JUNGLE_RADIUS_TILES } from "../Jungle/JunglePlan";
import type { JungleAnimal } from "../Jungle/JunglePlan";
import { getSolidRectangles } from "../../../Utils/EntityHitbox";
import { effectShownStores } from "../../../Stores/EffectsStore";
import { blockRectangles, sameGrids, withAreaBorders } from "./WanderCollisions";
import type { WanderRectangle } from "./WanderCollisions";
import { drinkStance } from "./WanderDrink";
import { RADIUS_TILES, WanderSchedule } from "./WanderSchedule";
import type { Point, Shore, WanderDirection, WanderMap, WanderPose } from "./WanderSchedule";
import { blockWetTiles, changedTiles, shoresOf, wetTilesOf } from "./WanderWater";
import { fearedPoint, fleeTarget, isBrave, straightRunIsClear } from "./WanderFear";
import type { WetTiles } from "./WanderWater";
import {
    WANDER_FRAME_SIZE,
    WANDER_WALK_COLUMNS,
    wanderIdleFrame,
    wanderStillFrame,
    wanderWalkFrames,
} from "./WanderSheet";

const RECONCILE_INTERVAL_MS = 500;
/** How a placed character is named among the tamable ones: by the id of its entity. */
export const ENTITY_ID_PREFIX = "entity:";
const WALK_FRAME_RATE = 8;
const DIRECTIONS: WanderDirection[] = ["down", "left", "right", "up"];
/** How fast a character runs to where its walk has it now, when the water took the ground it was walking on. */
const FLEE_SPEED_PX_PER_S = 192;
/** Closer than this to where its walk has it, a fleeing character is back to its walk. */
const FLEE_DONE_PX = 4;
/** A frame longer than this (a hidden tab) counts as this much time. */
const MAX_FRAME_MS = 100;
/** How far around a tile that became wet or dry the paths may change, beyond the wandering radius, in tiles. */
const WATER_REACH_MARGIN_TILES = 2;
/** The system asks for less motion: a drinking animal holds one stance. */
const REDUCED_MOTION =
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

// A loaded sheet knows its number of columns: 3 for a walk cycle only, 5 with the rest poses (see WanderSheet).
type SheetState = "loading" | { columns: number } | "failed";

/** Where a character may stop: the free tiles, meeting rooms and desks included; not the exits. */
const DESTINATION_TILE_TYPES: ReadonlySet<number> = new Set([
    PathTileType.Walkable,
    PathTileType.MeetingRoom,
    PathTileType.PersonalDesk,
]);

/**
 * What moves a free character instead of its schedule (a tamed jungle animal following its master). No pose: the
 * character is not shown (its master is out of view).
 */
export interface WanderLead {
    poseAt(nowMs: number): WanderPose | undefined;
}

interface WanderingCharacter {
    /** Undefined for a free character (a jungle animal): no object of the map stands for it. */
    entity: Entity | undefined;
    sheetPath: string;
    nest: Point;
    /** The map its schedule walks on: the one of the manager, or the own map of the free characters. */
    map: WanderMap;
    schedule: WanderSchedule;
    // Created once the sheet is loaded.
    sprite: Phaser.GameObjects.Sprite | undefined;
    // Whether the sprite has been placed at least once: until then the entity stays as it is.
    hasPose: boolean;
    // Center of the character, in the coordinates of the characters: this is what opens the doors.
    opener: Point;
    // Whether the last pose applied to the sprite was a walk.
    moving: boolean;
    /** Set for a free character only: it is led instead of following its schedule. */
    lead?: WanderLead;
    /** How far from its nest it wanders, in tiles. */
    radiusTiles: number;
    /** Set when the water changed its walk: it runs from where it is shown to where its walk has it now. */
    fleeing: boolean;
    /** Whether the sprite is drawn in a drinking stance (turned or squeezed): undone when it stops drinking. */
    inStance: boolean;
    /** Where a wild animal runs to, away from an avatar it fears (see WanderFear); undefined when it is calm. */
    scaredTo?: Point;
}

/**
 * Turns the entities whose prefab has a `wander` sheet into characters walking around the place where they were put
 * (their nest). Outside of the map editor the entity is hidden and replaced by an animated sprite following a
 * WanderSchedule; in the map editor the entity is shown still, where it is, so that it can be edited.
 * Nothing goes through the network: every client computes the same positions from the same schedule.
 * Free characters (the jungle animals, see setFreeCharacters) have no entity: they are given by their owner, walk on
 * their own map, never open doors, and are hidden in the map editor.
 */
export class WanderingCharactersManager {
    private characters = new Map<string, WanderingCharacter>();
    private sheets = new Map<string, SheetState>();
    private sheetCompleteListeners = new Map<string, () => void>();
    // The collisions shared by every client (see GameMapFrontWrapper.getSharedCollisionGrid) and the collision
    // rectangles of the objects, refreshed on reconcile.
    private collisionGrid: number[][] | undefined;
    private barriers: TileBarriers | undefined;
    // The same grid before the water of the relief was added to it: tells a change of the water from the others.
    private dryGrid: number[][] | undefined;
    // The water of the relief as the characters see it (see WanderWater), where they can drink, and how often.
    private wet: WetTiles | undefined;
    private waterVersion: number | undefined;
    private shores: Shore[] = [];
    private drinkIntervalMs: number = DEFAULT_LIFE_SETTINGS.drinkInterval * 1000;
    private lastUpdateMs = 0;
    private readonly pathfindingManager: PathfindingManager;
    private readonly tileDimensions: { width: number; height: number };
    private isEditorMode = false;
    // Set once the map is asked for (by the jungle): the collisions are then kept up to date even without characters.
    private mapWanted = false;
    private readonly map: WanderMap;
    private readonly reconcileTimer: Phaser.Time.TimerEvent;
    private readonly unsubscribeEditorMode: Unsubscriber;
    private readonly updateListener = (): void => this.update();
    private readonly loadErrorListener = (file: Phaser.Loader.File): void => this.onLoadError(file);

    constructor(private scene: GameScene) {
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        this.tileDimensions = gameMapFrontWrapper.getTileDimensions();
        // Our own pathfinding: the one of the scene follows the collisions of the current player, and rebuilds the
        // walls on every call.
        this.pathfindingManager = new PathfindingManager(
            gameMapFrontWrapper.getSharedCollisionGrid(),
            this.tileDimensions,
        );
        this.map = {
            isWalkable: (tile) => this.isWalkable(tile),
            findPath: (from, to) => this.findPath(from, to),
            seats: () => getSeats(this.scene).map((seat) => seat.feet),
            shores: () => this.shores,
            drinkIntervalMs: () => this.drinkIntervalMs,
        };
        this.unsubscribeEditorMode = mapEditorModeStore.subscribe((isOn) => {
            this.isEditorMode = isOn;
        });
        this.reconcileTimer = this.scene.time.addEvent({
            delay: RECONCILE_INTERVAL_MS,
            loop: true,
            callback: () => this.reconcile(),
        });
        this.scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.loadErrorListener);
        this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateListener);
    }

    /**
     * Calls the callback with the position of each visible character: like the players, they open the doors.
     */
    public forEachDoorOpener(callback: (position: Point) => void): void {
        for (const character of this.characters.values()) {
            // Free characters stay outdoors: they open no door, unless they follow a master (who went through it).
            if ((character.entity || character.lead) && character.sprite?.visible) {
                callback(character.opener);
            }
        }
    }

    /** Calls the callback with the position of each visible character, free ones included: the presence sensors sense them. */
    public forEachWalker(callback: (position: Point) => void): void {
        for (const character of this.characters.values()) {
            if (character.sprite?.visible) {
                callback(character.opener);
            }
        }
    }

    /** Calls the callback with each character shown now, by its id: its sprite stands on its feet. */
    public forEachShownCharacter(callback: (id: string, sprite: Phaser.GameObjects.Sprite) => void): void {
        for (const [id, character] of this.characters) {
            if (character.sprite?.visible) callback(id, character.sprite);
        }
    }

    /** The map the placed characters walk on, with the current collisions (read now if they never were). */
    public getWanderMap(): WanderMap {
        this.mapWanted = true;
        if (this.collisionGrid === undefined) {
            this.refreshMap();
        }
        return this.map;
    }

    /**
     * Replaces the free characters (characters without an entity) by these: the missing ones are added, the others are
     * removed with their sprite, a moved nest is followed like the one of a moved entity. A new `map` gives every
     * free character a new schedule on it.
     */
    public setFreeCharacters(animals: readonly JungleAnimal[], map: WanderMap): void {
        const wanted = new Map(animals.map((animal) => [animal.id, animal]));
        let removed = false;
        for (const [id, character] of this.characters) {
            if (character.entity) {
                continue;
            }
            const animal = wanted.get(id);
            if (!animal || animal.sheetPath !== character.sheetPath) {
                this.forget(id, character);
                removed = true;
            }
        }
        for (const animal of animals) {
            const character = this.characters.get(animal.id);
            if (!character) {
                this.characters.set(animal.id, {
                    entity: undefined,
                    sheetPath: animal.sheetPath,
                    nest: animal.nest,
                    map,
                    schedule: new WanderSchedule(animal.id, animal.nest, map, JUNGLE_RADIUS_TILES),
                    sprite: undefined,
                    hasPose: false,
                    opener: { x: animal.nest.x, y: animal.nest.y - WANDER_FRAME_SIZE / 2 },
                    moving: false,
                    radiusTiles: JUNGLE_RADIUS_TILES,
                    fleeing: false,
                    inStance: false,
                });
                this.loadSheet(animal.sheetPath);
            } else if (character.entity) {
                // An entity with that id: never, the ids of the free characters are not entity ids.
                continue;
            } else if (character.map !== map) {
                character.map = map;
                character.nest = animal.nest;
                character.schedule = new WanderSchedule(animal.id, animal.nest, map, JUNGLE_RADIUS_TILES);
                character.hasPose = false;
            } else if (character.nest.x !== animal.nest.x || character.nest.y !== animal.nest.y) {
                character.nest = animal.nest;
                character.schedule.setNest(animal.nest);
                // Its nest moved (the water took it, or gave it back): a character that is shown runs to its new
                // walk; one that is not appears there.
                if (character.hasPose && !character.lead) {
                    character.fleeing = true;
                } else {
                    character.hasPose = false;
                }
            }
        }
        if (removed) {
            this.scene.markDirty();
        }
    }

    /**
     * The characters a player may tame: the free ones (by their id) and the placed ones (`entity:<entity id>`), with
     * their sheet and nest. Placed first, by entity id; then the free ones in the order they were given.
     */
    public tameableCharacters(): JungleAnimal[] {
        const placed: JungleAnimal[] = [];
        const free: JungleAnimal[] = [];
        for (const [key, character] of this.characters) {
            const animal = {
                id: character.entity ? `${ENTITY_ID_PREFIX}${key}` : key,
                sheetPath: character.sheetPath,
                nest: character.nest,
            };
            (character.entity ? placed : free).push(animal);
        }
        placed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return [...placed, ...free];
    }

    /** Where a tamable character (see tameableCharacters) is shown, undefined while it is not. */
    public characterPose(id: string): { x: number; y: number; moving: boolean } | undefined {
        const character = this.tameable(id);
        if (!character?.sprite?.visible) {
            return undefined;
        }
        return { x: character.sprite.x, y: character.sprite.y, moving: character.moving };
    }

    /**
     * Gives a tamable character (see tameableCharacters) a lead: it follows that instead of its schedule; or takes it
     * away: the character is then back to its schedule at once, where the schedule has it now. A placed one keeps its
     * object hidden while it is led.
     */
    public setCharacterLead(id: string, lead: WanderLead | undefined): void {
        const character = this.tameable(id);
        if (!character || character.lead === lead) {
            return;
        }
        character.lead = lead;
        // Hidden until its first pose from the new source, instead of showing it at its old place for a frame.
        character.hasPose = false;
        this.scene.markDirty();
    }

    public isLed(id: string): boolean {
        return this.tameable(id)?.lead !== undefined;
    }

    private tameable(id: string): WanderingCharacter | undefined {
        if (id.startsWith(ENTITY_ID_PREFIX)) {
            const character = this.characters.get(id.slice(ENTITY_ID_PREFIX.length));
            return character?.entity ? character : undefined;
        }
        const character = this.characters.get(id);
        return character && !character.entity ? character : undefined;
    }

    /** Where a free character is shown, undefined while it is not (sheet loading or failed, map editor). */
    public freeCharacterPose(id: string): { x: number; y: number; moving: boolean } | undefined {
        const character = this.characters.get(id);
        if (!character || character.entity || !character.sprite?.visible) {
            return undefined;
        }
        return { x: character.sprite.x, y: character.sprite.y, moving: character.moving };
    }

    public destroy(): void {
        this.reconcileTimer.remove();
        this.unsubscribeEditorMode();
        this.scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.loadErrorListener);
        for (const [sheetPath, listener] of this.sheetCompleteListeners) {
            this.scene.load.off(`filecomplete-spritesheet-${sheetPath}`, listener);
        }
        this.sheetCompleteListeners.clear();
        this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateListener);
        for (const character of this.characters.values()) {
            character.sprite?.destroy();
        }
        this.characters.clear();
    }

    /**
     * The nest is where the character stands, in the coordinates of the pathfinding: the "feet" of a character standing
     * on a tile are at the center of that tile. An entity is positioned by its top-left corner (origin 0), so the
     * center of its image is on the tile where it was put.
     */
    private static nestOf(entity: Entity): Point {
        return { x: entity.x + entity.displayWidth / 2, y: entity.y + entity.displayHeight / 2 };
    }

    private reconcile(): void {
        const entities = this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities();
        for (const [entityId, character] of this.characters) {
            // Free characters are managed by setFreeCharacters.
            if (!character.entity) {
                continue;
            }
            const entity = entities.get(entityId);
            if (entity !== character.entity || entity.getPrefab().wander?.sheetPath !== character.sheetPath) {
                this.forget(entityId, character);
            }
        }
        for (const [entityId, entity] of entities) {
            const sheetPath = entity.getPrefab().wander?.sheetPath;
            if (sheetPath === undefined) {
                continue;
            }
            const nest = WanderingCharactersManager.nestOf(entity);
            const character = this.characters.get(entityId);
            if (!character) {
                this.characters.set(entityId, {
                    entity,
                    sheetPath,
                    nest,
                    map: this.map,
                    schedule: new WanderSchedule(entityId, nest, this.map),
                    sprite: undefined,
                    hasPose: false,
                    opener: { x: nest.x, y: nest.y - WANDER_FRAME_SIZE / 2 },
                    moving: false,
                    radiusTiles: RADIUS_TILES,
                    fleeing: false,
                    inStance: false,
                });
                this.loadSheet(sheetPath);
            } else if (character.nest.x !== nest.x || character.nest.y !== nest.y) {
                character.nest = nest;
                character.schedule.setNest(nest);
                // Hidden until its first pose around the new nest, instead of showing it at its old place for a frame.
                character.hasPose = false;
            }
        }
        if (this.characters.size > 0 || this.mapWanted) {
            this.refreshMap();
        }
    }

    /**
     * Feeds the pathfinding with the current collisions and walls, at most once per reconcile: the walls and the
     * rectangles are rebuilt from every entity, the borders of the locked areas are added to the walls, and the tiles
     * under the water of the relief are closed. Other collisions or other walls (an object placed, moved or loaded
     * after the characters, an area locked or unlocked) make every character compute its path again; water that
     * came or went, only the characters that walk near it.
     */
    private refreshMap(): void {
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const dryGrid = blockRectangles(
            gameMapFrontWrapper.getSharedCollisionGrid(),
            this.collisionRectangles(),
            this.tileDimensions,
        );
        // Locking an area closes it to the characters too (checked on every reconcile, twice a second).
        const lockedAreas = (gameMapFrontWrapper.areasManager?.getLockedAreas() ?? []).map((entry) => entry.area);
        const barriers = withAreaBorders(gameMapFrontWrapper.getWallBarriers(), lockedAreas, this.tileDimensions);
        const wetChanges = this.refreshWater(dryGrid);
        const drinkIntervalMs =
            (this.scene.getGameMap().getWamFile()?.getWam().settings?.life?.drinkInterval ??
                DEFAULT_LIFE_SETTINGS.drinkInterval) * 1000;
        const first = this.collisionGrid === undefined || this.barriers === undefined || this.dryGrid === undefined;
        const mapChanged =
            first ||
            this.dryGrid === undefined ||
            this.barriers === undefined ||
            !sameGrids(dryGrid, this.dryGrid) ||
            !barriers.equals(this.barriers) ||
            drinkIntervalMs !== this.drinkIntervalMs;
        if (!mapChanged && wetChanges.length === 0) {
            return;
        }
        this.drinkIntervalMs = drinkIntervalMs;
        this.dryGrid = dryGrid;
        this.barriers = barriers;
        const wet = this.wet;
        const grid = wet ? blockWetTiles(dryGrid, wet, PathTileType.Collider) : dryGrid;
        this.collisionGrid = grid;
        this.shores = wet?.any
            ? shoresOf(
                  wet,
                  this.tileDimensions.width,
                  (tile) => this.isWalkable(tile),
                  (from, to) => barriers.blocksMove(from, to),
              )
            : [];
        this.pathfindingManager.setCollisionGrid(grid);
        this.pathfindingManager.setBarriers(barriers);
        if (first) {
            return;
        }
        for (const character of this.characters.values()) {
            if (mapChanged) {
                character.schedule.reset();
            } else if (this.reaches(character, wetChanges)) {
                // The water came or went near it: it walks around the water as it is now, and runs there.
                character.schedule.reset();
                character.fleeing = true;
            }
        }
    }

    /**
     * Reads the water of the relief again when the server told a new state. Returns the tiles that became wet or
     * dry since the last time: none most of the time, a lake at rest keeps its shores.
     */
    private refreshWater(dryGrid: number[][]): Point[] {
        const water = this.scene.getTerrainWater();
        const version = water.version();
        if (version === this.waterVersion) {
            return [];
        }
        this.waterVersion = version;
        const wet = wetTilesOf(
            dryGrid[0]?.length ?? 0,
            dryGrid.length,
            this.tileDimensions.width,
            water.coveredArea(),
            (x, y) => water.settledDepthAt(x, y),
            this.wet,
        );
        const changes = changedTiles(this.wet, wet);
        this.wet = wet;
        return changes;
    }

    /** Whether one of these tiles is within the reach of the walks of a character. */
    private reaches(character: WanderingCharacter, tiles: readonly Point[]): boolean {
        const reach = character.radiusTiles + WATER_REACH_MARGIN_TILES;
        const nestX = Math.floor(character.nest.x / this.tileDimensions.width);
        const nestY = Math.floor(character.nest.y / this.tileDimensions.height);
        return tiles.some((tile) => Math.abs(tile.x - nestX) <= reach && Math.abs(tile.y - nestY) <= reach);
    }

    /**
     * The thin collisions of the objects, that stop the players through the physics, and the water of the pools,
     * which animals never enter (the water of the relief is closed tile by tile, see refreshWater). The collisions of the map layer are left out, like for the paths of the players: they are already
     * walls between tiles (getWallBarriers).
     */
    private collisionRectangles(): WanderRectangle[] {
        return WanderingCharactersManager.collisionRectanglesOf(this.scene);
    }

    /** The thin collisions of objects and water, which animals never enter. */
    public static collisionRectanglesOf(scene: GameScene): WanderRectangle[] {
        const rectangles: WanderRectangle[] = [...getWaterRectangles(scene)];
        const gameMapFrontWrapper = scene.getGameMapFrontWrapper();
        const cellSize = gameMapFrontWrapper.getTileDimensions().width;
        for (const entity of gameMapFrontWrapper.getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            // The same rectangles as the players: none for the animals themselves, the grid of an object off the grid.
            const solid = getSolidRectangles({ x: entity.x, y: entity.y }, prefab, cellSize);
            if (solid.length === 0 || isMapLayerPrefab(prefab.collectionName, prefab.id)) {
                continue;
            }
            rectangles.push(...getPrefabCollisionRectangles({ x: entity.x, y: entity.y }, solid));
        }
        return rectangles;
    }

    private forget(entityId: string, character: WanderingCharacter): void {
        character.sprite?.destroy();
        this.characters.delete(entityId);
        // The entity is still there but does not wander anymore: show it again.
        if (character.entity?.active) {
            this.showEntity(character.entity, true);
        }
    }

    private loadSheet(sheetPath: string): void {
        if (this.sheets.has(sheetPath)) {
            return;
        }
        if (this.scene.textures.exists(sheetPath)) {
            this.onSheetLoaded(sheetPath);
            return;
        }
        this.sheets.set(sheetPath, "loading");
        const listener = (): void => {
            this.sheetCompleteListeners.delete(sheetPath);
            this.onSheetLoaded(sheetPath);
        };
        this.sheetCompleteListeners.set(sheetPath, listener);
        this.scene.load.once(`filecomplete-spritesheet-${sheetPath}`, listener);
        this.scene.load.spritesheet(sheetPath, sheetPath, {
            frameWidth: WANDER_FRAME_SIZE,
            frameHeight: WANDER_FRAME_SIZE,
        });
        this.scene.load.start();
    }

    private onSheetLoaded(sheetPath: string): void {
        // The frames are numbered row by row: the width of the image gives the number of columns.
        const texture = this.scene.textures.get(sheetPath);
        const image = texture.getSourceImage();
        const columns = Math.floor(image.width / WANDER_FRAME_SIZE);
        const rows = Math.floor(image.height / WANDER_FRAME_SIZE);
        // A sheet too small for the 4 rows of 3 frames (or an image already loaded under that key without frames) would
        // show the whole image, and a sheet that is not 4 rows of 32 px frames (a big drawing) would show pieces
        // of it: the entity stays visible as a still object instead. "__BASE" is not a frame of the sheet.
        const frameCount = texture.frameTotal - 1;
        const expected = DIRECTIONS.length * Math.max(columns, WANDER_WALK_COLUMNS);
        if (rows !== DIRECTIONS.length || frameCount < expected) {
            this.sheets.set(sheetPath, "failed");
            console.error(
                `Invalid wandering sheet "${sheetPath}": ${image.width}x${image.height}, ${DIRECTIONS.length} rows of ${WANDER_FRAME_SIZE}px frames expected`,
            );
            return;
        }
        this.sheets.set(sheetPath, { columns });
        for (const direction of DIRECTIONS) {
            const key = `${sheetPath}:${direction}`;
            if (!this.scene.anims.exists(key)) {
                this.scene.anims.create({
                    key,
                    frames: this.scene.anims.generateFrameNumbers(sheetPath, {
                        frames: wanderWalkFrames(direction, columns),
                    }),
                    frameRate: WALK_FRAME_RATE,
                    repeat: -1,
                });
            }
        }
    }

    private onLoadError(file: Phaser.Loader.File): void {
        if (this.sheets.get(file.key) !== "loading") {
            return;
        }
        // Not retried: the entity stays visible as a still object.
        this.sheets.set(file.key, "failed");
        const listener = this.sheetCompleteListeners.get(file.key);
        if (listener) {
            this.scene.load.off(`filecomplete-spritesheet-${file.key}`, listener);
            this.sheetCompleteListeners.delete(file.key);
        }
        console.error(`Cannot load the wandering sheet "${file.key}"`);
    }

    private update(): void {
        if (this.characters.size === 0) {
            return;
        }
        const now = Date.now();
        const frameMs = Math.min(MAX_FRAME_MS, Math.max(0, now - this.lastUpdateMs));
        this.lastUpdateMs = now;
        let changed = false;
        // Where the avatars stand, read once per frame and only when a wild animal is shown.
        let threats: Point[] | undefined;
        // The fire of the map, when something burns: every animal on its own walk runs from it.
        const fire = this.isEditorMode ? undefined : this.scene.getLifeFire();
        for (const [id, character] of this.characters) {
            const sheet = this.sheets.get(character.sheetPath);
            const columns = typeof sheet === "object" ? sheet.columns : WANDER_WALK_COLUMNS;
            if (!character.sprite && typeof sheet === "object") {
                character.sprite = this.scene.add
                    .sprite(character.nest.x, character.nest.y, character.sheetPath, wanderIdleFrame("down", columns))
                    // The position of a character is the position of its feet.
                    .setOrigin(0.5, 1)
                    // Like the characters, the depth follows the y coordinate to simulate a perspective.
                    .setDepth(character.nest.y)
                    .setVisible(false);
            }
            const sprite = character.sprite;
            if (sprite && !this.isEditorMode) {
                const lead = character.lead;
                const pose = lead ? lead.poseAt(now) : character.schedule.poseAt(now);
                if (lead && !pose) {
                    // Led out of view: not shown, rather than left where it was last seen.
                    character.hasPose = false;
                }
                if (lead) {
                    // Only a character on its own walk flees.
                    character.fleeing = false;
                }
                const onItsWalk = !lead && character.hasPose && sprite.visible && !this.isEditorMode;
                // The wild ones fear the avatars, unless brave today; a pet put on the map does not.
                const fearful = onItsWalk && !character.entity && !isBrave(id, now);
                if (fearful) {
                    threats ??= this.scene.avatarFeetOnGround();
                }
                if (
                    onItsWalk &&
                    (fearful || fire || character.scaredTo) &&
                    this.runFromThreats(character, sprite, fearful ? threats : undefined, fire, frameMs)
                ) {
                    changed = true;
                } else if (
                    pose &&
                    character.fleeing &&
                    character.hasPose &&
                    this.flee(character, sprite, pose, frameMs)
                ) {
                    changed = true;
                } else if (pose) {
                    character.fleeing = false;
                    character.hasPose = true;
                    character.moving = pose.moving;
                    // A drinking character is drawn from its standing frame, bowed to the water.
                    const stance = pose.drinking
                        ? drinkStance(pose.direction, pose.pausedMs, REDUCED_MOTION)
                        : undefined;
                    const x = pose.x + (stance?.dx ?? 0);
                    const y = pose.y + (stance?.dy ?? 0);
                    if (sprite.x !== x || sprite.y !== y) {
                        sprite.setPosition(x, y);
                        character.opener.x = pose.x;
                        character.opener.y = pose.y - WANDER_FRAME_SIZE / 2;
                        changed = true;
                    }
                    if (stance) {
                        if (sprite.angle !== stance.angle || sprite.scaleY !== stance.scaleY) {
                            sprite.setAngle(stance.angle);
                            sprite.setScale(1, stance.scaleY);
                            changed = true;
                        }
                        character.inStance = true;
                    } else if (character.inStance) {
                        sprite.setAngle(0);
                        sprite.setScale(1, 1);
                        character.inStance = false;
                        changed = true;
                    }
                    // Out of the position check: a character standing still where it was created needs it too. Only on
                    // change, as setting the depth sorts the display list again.
                    // On a seat, drawn like a seated player: over the chair (behind it when it shows its back).
                    // A led character goes where it is led, never onto a seat.
                    const seat =
                        pose.moving || lead || pose.drinking
                            ? undefined
                            : getSeats(this.scene).find(
                                  (candidate) =>
                                      Math.abs(candidate.feet.x - pose.x) < 1 &&
                                      Math.abs(candidate.feet.y - pose.y) < 1,
                              );
                    const depth = seat?.depth ?? pose.y;
                    if (sprite.depth !== depth) {
                        sprite.setDepth(depth);
                        changed = true;
                    }
                    if (pose.moving) {
                        sprite.play(`${character.sheetPath}:${pose.direction}`, true);
                    } else {
                        const stillFrame = pose.drinking
                            ? wanderIdleFrame(pose.direction, columns)
                            : wanderStillFrame(pose.direction, pose.pausedMs, columns);
                        // The frames of a sprite sheet are named by their index (a number at runtime).
                        if (sprite.anims.isPlaying || String(sprite.frame.name) !== String(stillFrame)) {
                            sprite.stop();
                            sprite.setFrame(stillFrame);
                            changed = true;
                        }
                    }
                }
            }

            // Reapplied every frame: the entity becomes visible again when its image finishes loading.
            // Turned off on this computer: no animal walks, nor stands at its nest (the map editor still shows them).
            // Basique leaves the animals placed on the map: only their own switch hides them.
            const hiddenByUser = !this.isEditorMode && !get(effectShownStores.wanderers);
            const showSprite = sprite !== undefined && character.hasPose && !this.isEditorMode && !hiddenByUser;
            if (sprite && sprite.visible !== showSprite) {
                sprite.setVisible(showSprite);
                changed = true;
            }
            // A led character out of view is nowhere: its object is not shown at its nest either. But in the map editor
            // the object is shown, to be edited; and without a sprite (sheet loading or failed), it stays as it is.
            const hiddenByLead = character.lead !== undefined && sprite !== undefined && !this.isEditorMode;
            if (character.entity && this.showEntity(character.entity, !showSprite && !hiddenByLead && !hiddenByUser)) {
                changed = true;
            }
        }
        if (changed) {
            this.scene.markDirty();
        }
    }

    /**
     * An animal near a fire, or a wild one near an avatar, runs away from it, on the ground it may walk (outdoors
     * for a wild one: never into a building; never onto a ground that burns), and keeps away until the fire and every
     * avatar are far enough. Once calm, it runs back to its walk, or appears on it when a wall stands on the straight
     * way back.
     * @param threats the avatars it fears; undefined for an animal that does not fear them
     * @returns whether it is running away this frame (the caller then leaves its walk aside)
     */
    private runFromThreats(
        character: WanderingCharacter,
        sprite: Phaser.GameObjects.Sprite,
        threats: readonly Point[] | undefined,
        fire: LifeFire | undefined,
        frameMs: number,
    ): boolean {
        const feet = { x: sprite.x, y: sprite.y };
        const threat = fearedPoint(feet, threats, fire, character.scaredTo !== undefined);
        const walkable = (x: number, y: number): boolean =>
            fire?.burning(x, y) !== true &&
            character.map.isWalkable({
                x: Math.floor(x / this.tileDimensions.width),
                y: Math.floor(y / this.tileDimensions.height),
            });
        if (!threat) {
            if (character.scaredTo) {
                character.scaredTo = undefined;
                const pose = character.schedule.poseAt(Date.now());
                if (pose && straightRunIsClear(feet, pose, walkable)) character.fleeing = true;
                else character.hasPose = false;
            }
            return false;
        }
        // A new way out when it got there, or when the avatar came round to the side it was running to.
        const target = character.scaredTo;
        const stillAway =
            target !== undefined &&
            Math.hypot(target.x - threat.x, target.y - threat.y) > Math.hypot(feet.x - threat.x, feet.y - threat.y);
        if (!target || !stillAway || !this.flee(character, sprite, target, frameMs)) {
            // Cornered: it stays where it is, facing the avatar, rather than running through a wall.
            character.scaredTo = fleeTarget(feet, threat, walkable) ?? feet;
            this.flee(character, sprite, character.scaredTo, frameMs);
        }
        return true;
    }

    /**
     * Moves a fleeing character a frame closer to where its walk has it now, at a run, in a straight line: the water
     * took the ground it was walking on, and its walk was computed again around it.
     * @returns whether it is still running; false once it is there (the caller then puts it on its walk)
     */
    private flee(
        character: WanderingCharacter,
        sprite: Phaser.GameObjects.Sprite,
        pose: Point,
        frameMs: number,
    ): boolean {
        const dx = pose.x - sprite.x;
        const dy = pose.y - sprite.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= FLEE_DONE_PX) {
            return false;
        }
        const step = Math.min(distance, (FLEE_SPEED_PX_PER_S * frameMs) / 1000);
        const x = sprite.x + (dx / distance) * step;
        const y = sprite.y + (dy / distance) * step;
        if (character.inStance) {
            sprite.setAngle(0);
            sprite.setScale(1, 1);
            character.inStance = false;
        }
        sprite.setPosition(x, y);
        sprite.setDepth(y);
        character.opener.x = x;
        character.opener.y = y - WANDER_FRAME_SIZE / 2;
        character.moving = true;
        let direction: WanderDirection;
        if (Math.abs(dx) >= Math.abs(dy)) {
            direction = dx < 0 ? "left" : "right";
        } else {
            direction = dy < 0 ? "up" : "down";
        }
        sprite.play(`${character.sheetPath}:${direction}`, true);
        return true;
    }

    /** @returns whether the visibility changed */
    private showEntity(entity: Entity, visible: boolean): boolean {
        // An entity whose image is not shown yet stays hidden: its loading makes it visible.
        if (visible && entity.texture.key !== entity.getPrefab().imagePath) {
            return false;
        }
        if (entity.visible === visible) {
            return false;
        }
        entity.setVisible(visible);
        return true;
    }

    private isWalkable(tile: Point): boolean {
        const type = this.collisionGrid?.[tile.y]?.[tile.x];
        return type !== undefined && DESTINATION_TILE_TYPES.has(type);
    }

    private async findPath(from: Point, to: Point): Promise<Point[]> {
        const tileDimensions = this.tileDimensions;
        if (
            Math.floor(from.x / tileDimensions.width) === Math.floor(to.x / tileDimensions.width) &&
            Math.floor(from.y / tileDimensions.height) === Math.floor(to.y / tileDimensions.height)
        ) {
            // The pathfinding finds no path within a tile.
            return [from, to];
        }
        try {
            return await this.pathfindingManager.findPathFromGameCoordinates(
                // The pathfinding expects the center of an avatar, half a tile above its feet, and returns feet.
                { x: from.x, y: from.y - tileDimensions.height / 2 },
                to,
            );
        } catch (e) {
            console.warn("Wander: pathfinding failed", e);
            return [];
        }
    }
}
