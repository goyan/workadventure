import type { ObstacleRectangle } from "../../../Utils/RectangleObstacles";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { MAP_LAYER_DOOR_COLLECTION, MAP_LAYER_WALL_COLLECTION } from "../MapEditor/MapLayer/MapLayerCatalog";
import { edgeKey } from "../MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs, type PlacedPrefabLike } from "../MapEditor/MapLayer/MapLayerOperations";
import type { Segment } from "./RgbLampGeometry";
import { shadowRectangles, wallSegments } from "./RgbLampObstacles";

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
    ) {}

    /** Looks at the map and its objects again. */
    public read(entities: ReadonlyMap<string, Entity>): void {
        // The same array as long as the walls of the map do not change (see getMapCollisionGrid).
        const grid = this.scene.getGameMapFrontWrapper().getMapCollisionGrid();
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
            const { collectionName } = prefab;
            if (collectionName === MAP_LAYER_WALL_COLLECTION || collectionName === MAP_LAYER_DOOR_COLLECTION) {
                const piece = { x: entity.x, y: entity.y, collectionName, prefabId: prefab.id };
                const open = collectionName === MAP_LAYER_DOOR_COLLECTION && this.scene.isDoorOpen(entityId);
                pieces.push(piece);
                if (open) {
                    openDoors.push(piece);
                }
                wallsSignature += `${prefab.id}@${entity.x},${entity.y}${open ? "!" : ""};`;
            } else if (prefab.castsShadow === true) {
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
            this.walls = wallSegments(modelFromPlacedPrefabs(pieces), (door) =>
                open.has(edgeKey(door.orientation, door.x, door.y)),
            );
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
