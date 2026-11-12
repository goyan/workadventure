import type { Unsubscriber } from "svelte/store";
import { rgbLampLightsStore, rgbLampPreviewStore, type RgbLampLight } from "../../../Stores/RgbLampStore";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { lampSource } from "./LampReconcile";
import { LightObstacleReader } from "./LightObstacleReader";
import { litPolygon, type LightCone } from "./RgbLampGeometry";
import { obstacleSegments } from "./RgbLampObstacles";
import { rgbLampColour, rgbLampLight, rgbLampSettingsOf, type RgbLampSettings } from "./RgbLampSettings";
import { RgbLampVisual } from "./RgbLampVisual";

interface PlacedRgbLamp {
    entity: Entity;
    visual: RgbLampVisual;
    /** The light as it was last drawn: where it is, its cone and its colour. */
    key: string;
    /** The segments that stopped it when it was last drawn. */
    segmentsKey: string;
    /** The state of the obstacles of the map it was last checked against (see LightObstacleReader.version). */
    obstaclesVersion: number;
    light: LightCone | undefined;
    revision: number;
    visible: boolean;
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

    // The obstacles of the map, as last read: each lamp checks whether what stops its own light changed.
    private readonly obstacles: LightObstacleReader;

    constructor(
        private readonly scene: GameScene,
        private readonly depth: number,
    ) {
        this.unsubscribePreview = rgbLampPreviewStore.subscribe((preview) => (this.preview = preview));
        this.obstacles = new LightObstacleReader(scene, () => this.tileSize());
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
            this.obstacles.read(entities);
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
            if (key !== lamp.key || lamp.obstaclesVersion !== this.obstacles.version) {
                const segments = obstacleSegments(light, {
                    grid: this.obstacles.grid,
                    tileSize,
                    walls: this.obstacles.walls,
                    // A lamp that is itself a tall object does not stand in its own light.
                    rectangles: this.obstacles.casters
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
                lamp.obstaclesVersion = this.obstacles.version;
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
