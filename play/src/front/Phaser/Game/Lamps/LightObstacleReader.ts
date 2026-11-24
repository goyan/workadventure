import { groundPrefabOfUpper } from "../MapEditor/MapLayer/MapLayerLevels";
import type { ObstacleRectangle } from "../../../Utils/RectangleObstacles";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { MAP_LAYER_DOOR_COLLECTION, MAP_LAYER_WALL_LIKE_COLLECTIONS } from "../MapEditor/MapLayer/MapLayerCatalog";
import { edgeKey } from "../MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs, type PlacedPrefabLike } from "../MapEditor/MapLayer/MapLayerOperations";
import type { Segment } from "./RgbLampGeometry";
import { shadowRectangles, wallSegments } from "./RgbLampObstacles";

/** On a raised floor no tile of the map stops a light. */
const NO_GRID: readonly (readonly number[])[] = [];

/**
 * What stops a light on each floor of the map: the ground, and each raised floor a light stands on. A light on a
 * stair, or on a floor nothing is placed on, meets nothing.
 */
export class LightObstaclesByLevel {
    private readonly ground: LightObstacleReader;
    private readonly raised = new Map<number, LightObstacleReader>();
    private readonly open: LightObstacleReader;
    private entities: ReadonlyMap<string, Entity> = new Map();
    private elevations: number[] = [];

    constructor(
        private readonly scene: Pick<GameScene, "getGameMapFrontWrapper" | "isDoorOpen">,
        private readonly tileSize: () => number,
    ) {
        this.ground = new LightObstacleReader(scene, tileSize);
        // Never read: no obstacle at all.
        this.open = new LightObstacleReader(scene, tileSize, Number.POSITIVE_INFINITY);
    }

    /** Looks at the map and its objects again, for the floors that have a light. */
    public read(entities: ReadonlyMap<string, Entity>): void {
        this.entities = entities;
        const elevations = new Set<number>();
        for (const entity of entities.values()) {
            const elevation = entity.getElevation();
            if (elevation > 0) elevations.add(elevation);
        }
        this.elevations = [...elevations];
        this.ground.read(entities);
        for (const [level, reader] of this.raised) {
            if (elevations.has(level)) reader.read(entities);
            else this.raised.delete(level);
        }
    }

    /** The obstacles a light at this altitude meets. */
    public at(floorZ: number): LightObstacleReader {
        if (floorZ < 2) return this.ground;
        const level = this.elevations.find((elevation) => Math.abs(elevation - floorZ) < 2);
        if (level === undefined) return this.open;
        let reader = this.raised.get(level);
        if (!reader) {
            reader = new LightObstacleReader(this.scene, this.tileSize, level);
            reader.read(this.entities);
            this.raised.set(level, reader);
        }
        return reader;
    }
}

/** A tall object and what it stops the light with. */
export interface ShadowCaster {
    entityId: string;
    rectangle: ObstacleRectangle;
}

/**
 * What stops a light on the map, as last read: the collision grid of the tiles, the walls of the map layer (a closed
 * door is a wall) and the tall objects (`castsShadow`). `version` changes whenever one of them changes: a light then
 * checks whether what stops it changed, and is left alone otherwise.
 */
export class LightObstacleReader {
    public grid: readonly (readonly number[])[] = [];
    public walls: Segment[] = [];
    public casters: ShadowCaster[] = [];
    public version = 0;
    private wallsSignature = "";
    private castersSignature = "";

    constructor(
        private readonly scene: Pick<GameScene, "getGameMapFrontWrapper" | "isDoorOpen">,
        private readonly tileSize: () => number,
        /**
         * Altitude of the floor of the map whose obstacles are read (0: the ground). On a raised floor: the walls
         * and the tall objects of that floor, where they are drawn, and none of the tiles of the map.
         */
        private readonly level = 0,
    ) {}

    /** Looks at the map and its objects again. */
    public read(entities: ReadonlyMap<string, Entity>): void {
        // The same array as long as the walls of the map do not change (see getMapCollisionGrid).
        const grid = this.level > 0 ? NO_GRID : this.scene.getGameMapFrontWrapper().getMapCollisionGrid();
        let changed = grid !== this.grid;
        this.grid = grid;

        const pieces: PlacedPrefabLike[] = [];
        const openDoors: PlacedPrefabLike[] = [];
        const casters: ShadowCaster[] = [];
        let wallsSignature = "";
        let castersSignature = "";
        const tileSize = this.tileSize();
        for (const [entityId, entity] of entities) {
            const prefab = entity.getPrefab();
            const elevation = entity.getElevation();
            // On a raised floor the walls are the same pieces in collections of their own: read as on the ground,
            // where they stand (their altitude further south).
            const raised = this.level > 0 ? groundPrefabOfUpper(prefab.collectionName, prefab.id) : undefined;
            if (this.level > 0 && raised && elevation !== this.level) continue;
            const collectionName = raised?.collectionName ?? prefab.collectionName;
            if ((this.level === 0 || raised) && MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(collectionName)) {
                const piece = {
                    x: entity.x,
                    y: entity.y + this.level,
                    collectionName,
                    prefabId: raised?.prefabId ?? prefab.id,
                };
                // The doors of a raised floor are read closed (their state is not known here).
                const open =
                    this.level === 0 && collectionName === MAP_LAYER_DOOR_COLLECTION && this.scene.isDoorOpen(entityId);
                pieces.push(piece);
                if (open) {
                    openDoors.push(piece);
                }
                wallsSignature += `${prefab.id}@${entity.x},${entity.y}${open ? "!" : ""};`;
            } else if (prefab.castsShadow === true && Math.abs(elevation - this.level) < 2) {
                for (const rectangle of shadowRectangles(prefab, { x: entity.x, y: entity.y }, tileSize)) {
                    casters.push({ entityId, rectangle });
                    castersSignature += `${entityId}@${rectangle.x},${rectangle.y},${rectangle.width},${rectangle.height};`;
                }
            }
        }
        if (wallsSignature !== this.wallsSignature) {
            this.wallsSignature = wallsSignature;
            // A door is read from its first piece, open or not: the doors that are open now are read apart.
            const open = new Set<string>();
            for (const door of modelFromPlacedPrefabs(openDoors).getDoors()) {
                open.add(edgeKey(door.orientation, door.x, door.y));
            }
            const level = this.level;
            this.walls = wallSegments(modelFromPlacedPrefabs(pieces), (door) =>
                open.has(edgeKey(door.orientation, door.x, door.y)),
            ).map((wall) => (level > 0 ? { ...wall, ay: wall.ay - level, by: wall.by - level } : wall));
            changed = true;
        }
        if (castersSignature !== this.castersSignature) {
            this.castersSignature = castersSignature;
            this.casters = casters;
            changed = true;
        }
        if (changed) {
            this.version += 1;
        }
    }
}
