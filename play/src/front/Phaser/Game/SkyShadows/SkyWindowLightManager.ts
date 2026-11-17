import { skyWindowLightsStore } from "../../../Stores/SkyWindowLightStore";
import { MAP_LAYER_WALL_LIKE_COLLECTIONS } from "../MapEditor/MapLayer/MapLayerCatalog";
import { modelFromPlacedPrefabs, type PlacedPrefabLike } from "../MapEditor/MapLayer/MapLayerOperations";
import type { SkyLight } from "../Night/SkyLight";
import type { SkyShadowManagerOptions, SkyShadowScene } from "./SkyShadowManager";
import { shadowArea, shadowRedraw, shadowResolution } from "./SkyShadowFrame";
import type { DrawnShadows, ShadowFrame } from "./SkyShadowFrame";
import { SkyWindowLightLayer } from "./SkyWindowLightLayer";
import type { WindowLightPatch } from "./SkyWindowLightLayer";
import { windowLightPatch, windowOpenings } from "./SkyWindowLight";
import type { WindowOpening } from "./SkyWindowLight";

/** The walls are looked at again twice a second at most. */
const READ_INTERVAL_MS = 500;
/** How much colour a patch of light adds to the floor under a high sun in a clear sky. */
const WINDOW_LIGHT_ALPHA = 0.35;
/** Under this light no patch is drawn. */
const NO_LIGHT = 0.005;
/** What stands on a raised floor is left out: the light falls on the ground floor only. */
const RAISED = 2;
const VEIL_ID = "sky-windows";

/**
 * The sun and the moon coming in through the windows and the glazed doors of the map layer: on the floor of the room
 * behind each pane that faces the light, a patch of light of its colour, kept inside the room. At night the moonlight
 * pierces the night veil a little (skyWindowLightsStore). Drawn again only when the light, the walls, the outdoors,
 * the zoom or the view require it (shadowRedraw), as the shadows are.
 */
export class SkyWindowLightManager {
    private readonly layer: SkyWindowLightLayer;
    private pieces: PlacedPrefabLike[] = [];
    private openings: WindowOpening[] = [];
    private signature = "";
    private openingsKey = "";
    private readAt: number | undefined;
    private drawn: DrawnShadows | undefined;
    private published = false;

    constructor(
        private readonly scene: SkyShadowScene & ConstructorParameters<typeof SkyWindowLightLayer>[0],
        private readonly options: SkyShadowManagerOptions,
    ) {
        this.layer = new SkyWindowLightLayer(scene);
    }

    public update(now: number): void {
        const light = this.options.light();
        const grid = this.options.outdoorGrid();
        if (!this.options.enabled() || !light || light.intensity < NO_LIGHT || !grid) {
            this.clear();
            this.readAt = undefined;
            return;
        }
        if (this.readAt === undefined || now - this.readAt >= READ_INTERVAL_MS) {
            this.readAt = now;
            this.readWalls();
        }
        const key = `${this.signature}|${this.options.outdoorVersion()}`;
        if (key !== this.openingsKey) {
            this.openingsKey = key;
            const model = modelFromPlacedPrefabs(this.pieces);
            this.openings = windowOpenings(
                model,
                (x, y) => grid.roomAt(x, y),
                (x, y) => grid.isOutdoorAt(x, y),
            );
        }
        if (this.openings.length === 0) {
            this.clear();
            return;
        }
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        const frame: ShadowFrame = {
            light,
            casters: key,
            outdoorVersion: this.options.outdoorVersion(),
            view: { x: view.x, y: view.y, width: view.width, height: view.height },
            zoom: shadowResolution(camera.zoom),
        };
        const action = shadowRedraw(this.drawn, frame);
        if (action === "none") return;
        if (action === "alpha" && this.drawn) {
            this.layer.setAlpha(WINDOW_LIGHT_ALPHA * light.intensity);
            // Only the intensity: the shadows are still where the light was when they were drawn.
            this.drawn = { ...this.drawn, light: { ...this.drawn.light, intensity: light.intensity } };
            this.publish(light);
            this.scene.markDirty();
            return;
        }
        const area = shadowArea(frame.view);
        const patches: WindowLightPatch[] = [];
        for (const opening of this.openings) {
            const polygon = windowLightPatch(opening, light);
            if (polygon) patches.push({ polygon, room: opening.room });
        }
        // No pane faces the light: nothing to draw, nor to pierce the veil with.
        if (patches.length === 0) {
            this.clear();
            return;
        }
        this.layer.draw(area, frame.zoom, patches, grid, light.color, WINDOW_LIGHT_ALPHA * light.intensity);
        this.drawn = { ...frame, area };
        this.publish(light);
        this.scene.markDirty();
    }

    public destroy(): void {
        skyWindowLightsStore.set([]);
        this.layer.destroy();
    }

    private readWalls(): void {
        const pieces: PlacedPrefabLike[] = [];
        let signature = "";
        for (const entity of this.options.entities()) {
            const { prefab } = entity;
            if (entity.elevation >= RAISED || !MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(prefab.collectionName))
                continue;
            pieces.push({ x: entity.x, y: entity.y, collectionName: prefab.collectionName, prefabId: prefab.id });
            signature += `${prefab.id}@${entity.x},${entity.y};`;
        }
        if (signature !== this.signature) {
            this.signature = signature;
            this.pieces = pieces;
        }
    }

    /** The moonlight pierces the night veil a little, as much as it lights; the sun needs no hole in it. */
    private publish(light: SkyLight): void {
        if (light.body !== "moon") {
            this.unpublish();
            return;
        }
        const { square } = this.layer;
        skyWindowLightsStore.set([
            {
                id: VEIL_ID,
                x: square.x,
                y: square.y,
                size: square.size,
                textureKey: this.layer.textureKey,
                revision: this.layer.revision,
                intensity: light.intensity,
            },
        ]);
        this.published = true;
    }

    /** Takes the moonlight out of the night veil, once: the veil is drawn again whenever the store changes. */
    private unpublish(): void {
        if (!this.published) return;
        this.published = false;
        skyWindowLightsStore.set([]);
    }

    private clear(): void {
        if (!this.drawn) return;
        this.layer.hide();
        this.drawn = undefined;
        this.unpublish();
        this.scene.markDirty();
    }
}
