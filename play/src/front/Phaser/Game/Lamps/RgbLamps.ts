import type { Unsubscriber } from "svelte/store";
import { rgbLampLightsStore, rgbLampPreviewStore, type RgbLampLight } from "../../../Stores/RgbLampStore";
import type { ObstacleRectangle } from "../../../Utils/RectangleObstacles";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import {
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_TILE_SIZE,
    MAP_LAYER_WALL_COLLECTION,
} from "../MapEditor/MapLayer/MapLayerCatalog";
import { edgeKey } from "../MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs, type PlacedPrefabLike } from "../MapEditor/MapLayer/MapLayerOperations";
import { lampSource } from "./LampReconcile";
import { litPolygon, type LightCone, type Segment } from "./RgbLampGeometry";
import { obstacleSegments, shadowRectangles, wallSegments } from "./RgbLampObstacles";
import { rgbLampColour, rgbLampLight, rgbLampSettingsOf, type RgbLampSettings } from "./RgbLampSettings";
import { RgbLampVisual } from "./RgbLampVisual";

interface PlacedRgbLamp {
    entity: Entity;
    visual: RgbLampVisual;
    /** The light as it was last drawn: where it is, its cone and its colour. */
    key: string;
    /** The segments that stopped it when it was last drawn. */
    segmentsKey: string;
    /** The state of the obstacles of the map it was last checked against (see RgbLamps.obstaclesVersion). */
    obstaclesVersion: number;
    light: LightCone | undefined;
    revision: number;
    visible: boolean;
}

/** A tall object and what it stops the light with. */
interface ShadowCaster {
    entityId: string;
    rectangle: ObstacleRectangle;
}

function isRgbLamp(entity: Entity): boolean {
    return entity.getPrefab().lamp?.kind === "rgb";
}

/**
 * The RGB lamps of the map: the objects whose catalog entry says `lamp.kind: "rgb"`. Each lights a cone of its colour
 * (see RgbLampPropertyData), stopped by the walls of the map, the walls of the map layer and the tall objects, all the
 * time, by day and by night, with or without music.
 *
 * A light is only computed and drawn again when something it depends on changed: the lamp was moved or set (looked at
 * at every image, so that the light follows a drag in the editor), or a wall, a door or a tall object changed within
 * its reach (looked at with the objects of the map, a few times a second). A lamp that stands still costs nothing.
 */
export class RgbLamps {
    private readonly lamps = new Map<string, PlacedRgbLamp>();
    private readonly unsubscribePreview: Unsubscriber;
    private preview: { entityId: string; settings: RgbLampSettings } | undefined;
    private revisions = 0;

    // The obstacles of the map, as last read. `obstaclesVersion` changes with them: each lamp then checks whether
    // what stops its own light changed.
    private grid: readonly (readonly number[])[] = [];
    private wallsSignature = "";
    private walls: Segment[] = [];
    private casters: ShadowCaster[] = [];
    private castersSignature = "";
    private obstaclesVersion = 0;

    constructor(
        private readonly scene: GameScene,
        private readonly depth: number,
    ) {
        this.unsubscribePreview = rgbLampPreviewStore.subscribe((preview) => (this.preview = preview));
    }

    private tileSize(): number {
        return this.scene.getGameMapFrontWrapper().getMap().tilewidth ?? MAP_LAYER_TILE_SIZE;
    }

    /** Looks at the objects of the map: the lamps there are, and what stops their light. */
    public reconcile(entities: ReadonlyMap<string, Entity>): void {
        let removed = false;
        for (const [id, lamp] of this.lamps) {
            // An object can be replaced under the same id (an undo, a model changed).
            if (entities.get(id) !== lamp.entity || !isRgbLamp(lamp.entity)) {
                lamp.visual.destroy();
                this.lamps.delete(id);
                removed = true;
            }
        }
        for (const [id, entity] of entities) {
            if (isRgbLamp(entity) && !this.lamps.has(id)) {
                this.lamps.set(id, {
                    entity,
                    visual: new RgbLampVisual(this.scene, id, this.depth),
                    key: "",
                    segmentsKey: "",
                    obstaclesVersion: -1,
                    light: undefined,
                    revision: 0,
                    visible: false,
                });
            }
        }
        if (removed) {
            this.publish();
            // The scene is only drawn when something changed: the light must leave the screen now.
            this.scene.markDirty();
        }
        if (this.lamps.size > 0) {
            this.readObstacles(entities);
        }
    }

    private readObstacles(entities: ReadonlyMap<string, Entity>): void {
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
            this.obstaclesVersion += 1;
        }
    }

    /** At every image: draws again the lights that changed, and only them. */
    public update(): void {
        if (this.lamps.size === 0) {
            return;
        }
        const tileSize = this.tileSize();
        let changed = false;
        for (const [id, lamp] of this.lamps) {
            const { entity } = lamp;
            // Read at every image: a script will be able to drive the lamp through its property.
            const settings =
                this.preview?.entityId === id ? this.preview.settings : rgbLampSettingsOf(entity.getProperties());
            const light = rgbLampLight(lampSource(entity, entity.getPrefab().lamp?.anchor), settings, tileSize);
            const key = `${light.x},${light.y},${light.radius},${light.direction},${light.angle},${settings.color}`;
            if (key !== lamp.key || lamp.obstaclesVersion !== this.obstaclesVersion) {
                const segments = obstacleSegments(light, {
                    grid: this.grid,
                    tileSize,
                    walls: this.walls,
                    // A lamp that is itself a tall object does not stand in its own light.
                    rectangles: this.casters
                        .filter((caster) => caster.entityId !== id)
                        .map((caster) => caster.rectangle),
                });
                const segmentsKey = segments
                    .map((segment) => `${segment.ax},${segment.ay},${segment.bx},${segment.by}`)
                    .join(";");
                if (key !== lamp.key || segmentsKey !== lamp.segmentsKey) {
                    lamp.visual.draw(light, litPolygon(light, segments), rgbLampColour(settings.color));
                    lamp.revision = ++this.revisions;
                    lamp.light = light;
                    changed = true;
                }
                lamp.key = key;
                lamp.segmentsKey = segmentsKey;
                lamp.obstaclesVersion = this.obstaclesVersion;
            }
            if (lamp.visible !== entity.visible) {
                lamp.visible = entity.visible;
                lamp.visual.setVisible(lamp.visible);
                changed = true;
            }
        }
        if (changed) {
            this.publish();
            // The scene is only drawn when something changed.
            this.scene.markDirty();
        }
    }

    /** Tells the night veil where the lights are: it is pierced with their shape. */
    private publish(): void {
        const lights: RgbLampLight[] = [];
        for (const [id, lamp] of this.lamps) {
            if (lamp.visible && lamp.light) {
                lights.push({
                    id,
                    x: lamp.light.x - lamp.light.radius,
                    y: lamp.light.y - lamp.light.radius,
                    size: lamp.light.radius * 2,
                    textureKey: lamp.visual.textureKey,
                    revision: lamp.revision,
                });
            }
        }
        rgbLampLightsStore.set(lights);
    }

    public destroy(): void {
        this.unsubscribePreview();
        for (const lamp of this.lamps.values()) {
            lamp.visual.destroy();
        }
        this.lamps.clear();
        rgbLampLightsStore.set([]);
    }
}
