import * as Sentry from "@sentry/svelte";
import type { SkyLight } from "../Night/SkyLight";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { WeatherView } from "../Weather/WeatherFrame";
import { readShadowCasters } from "./SkyShadowCasters";
import type { ShadowCategories, ShadowSourceEntity } from "./SkyShadowCasters";
import { shadowPolygons } from "./SkyShadowGeometry";
import type { Point, ShadowCasters, ShadowTree } from "./SkyShadowGeometry";
import { indoorRuns, SHADOW_COLOR, shadowAlpha, shadowArea, shadowRedraw, shadowResolution } from "./SkyShadowFrame";
import type { DrawnShadows, ShadowFrame } from "./SkyShadowFrame";
import { SkyShadowLayer } from "./SkyShadowLayer";

/** What throws the shadows is looked at again twice a second at most: an object being dragged is not read at every image. */
const CASTERS_INTERVAL_MS = 500;
/** Under this light the shadows are not drawn at all. */
const NO_LIGHT = 0.005;

export interface SkyShadowManagerOptions {
    /** The light of the sky (NightManager.skyLight). */
    light: () => SkyLight | undefined;
    /** The objects placed on the map. */
    entities: () => Iterable<ShadowSourceEntity>;
    /** The outdoor cells of the map: the shadows are only drawn there. Without a grid, everywhere. */
    outdoorGrid: () => OutdoorGrid | undefined;
    /** Changes each time the outdoor grid is computed again. */
    outdoorVersion: () => number;
    /** The kinds of things that throw a shadow, for this person; all of them without. */
    categories?: () => ShadowCategories | undefined;
    /** False in the map editor, or with the shadows turned off by this person. */
    enabled: () => boolean;
}

/** The scene as the shadows need it (a GameScene fits). */
export interface SkyShadowScene {
    markDirty(): void;
    cameras: { main: { worldView: WeatherView; zoom: number } };
}

/**
 * The shadows of the sun and of the moon on the ground outdoors: thrown by the walls of the map layer, the tall
 * objects and the trees, away from the body that lights the map (NightManager.skyLight). Drawn again only when the
 * light has moved enough, when what throws them or the outdoors changed, or before a scroll reaches the edge of what
 * was drawn; a fading light only changes their opacity.
 */
export class SkyShadowManager {
    private readonly layer: SkyShadowLayer;
    private casters: ShadowCasters = { boxes: [], trees: [], details: [] };
    private castersSignature = "";
    private castersReadAt: number | undefined;
    private drawn: DrawnShadows | undefined;
    private broken = false;

    constructor(
        private readonly scene: SkyShadowScene & ConstructorParameters<typeof SkyShadowLayer>[0],
        private readonly options: SkyShadowManagerOptions,
    ) {
        this.layer = new SkyShadowLayer(scene);
    }

    /**
     * At every image. A failure while drawing (a canvas refused by the browser…) must never escape: it would stop the
     * loop of the game (a blue page, as with PR #257). It is reported once, and the layer stays off for the scene.
     */
    public update(now: number): void {
        if (this.broken) return;
        try {
            this.refresh(now);
        } catch (error) {
            this.broken = true;
            Sentry.captureException(error);
            this.layer.hide();
            this.drawn = undefined;
            this.scene.markDirty();
        }
    }

    private refresh(now: number): void {
        const light = this.options.light();
        if (!this.options.enabled() || !light || light.intensity < NO_LIGHT) {
            if (this.drawn) {
                this.layer.hide();
                this.drawn = undefined;
                // The game only renders dirty scenes: the shadows must leave the screen now.
                this.scene.markDirty();
            }
            // Read again when they come back: the map may have changed meanwhile (the map editor).
            this.castersReadAt = undefined;
            return;
        }
        if (this.castersReadAt === undefined || now - this.castersReadAt >= CASTERS_INTERVAL_MS) {
            this.castersReadAt = now;
            const { casters, signature } = readShadowCasters(
                this.options.entities(),
                this.castersSignature,
                this.options.categories?.(),
            );
            if (casters) {
                this.casters = casters;
                this.castersSignature = signature;
            }
        }
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        const frame: ShadowFrame = {
            light,
            casters: this.castersSignature,
            outdoorVersion: this.options.outdoorVersion(),
            view: { x: view.x, y: view.y, width: view.width, height: view.height },
            zoom: shadowResolution(camera.zoom),
        };
        const action = shadowRedraw(this.drawn, frame);
        if (action === "none") return;
        if (action === "alpha" && this.drawn) {
            this.layer.setAlpha(shadowAlpha(light));
            // Only the intensity: the shadows are still where the light was when they were drawn.
            this.drawn = { ...this.drawn, light: { ...this.drawn.light, intensity: light.intensity } };
            this.scene.markDirty();
            return;
        }
        const area = shadowArea(frame.view);
        const grid = this.options.outdoorGrid();
        const indoor = grid ? indoorRuns((column, row) => grid.isOutdoorCell(column, row), grid.cellSize, area) : [];
        this.layer.draw(area, frame.zoom, this.polygonsOver(area, light), indoor, SHADOW_COLOR, shadowAlpha(light));
        this.drawn = { ...frame, area };
        this.scene.markDirty();
    }

    public destroy(): void {
        this.layer.destroy();
    }

    /** The shadows that may fall in the area: those of the casters standing in it or less than the longest shadow away. */
    private polygonsOver(area: WeatherView, light: SkyLight): Point[][] {
        const reach = light.shadowLength.max;
        const near = (x: number, y: number, width: number, height: number): boolean =>
            x + width >= area.x - reach &&
            y + height >= area.y - reach &&
            x <= area.x + area.width + reach &&
            y <= area.y + area.height + reach;
        const nearTree = (tree: ShadowTree): boolean =>
            near(tree.x - tree.crownRadius, tree.y - tree.crownRadius, 2 * tree.crownRadius, 0);
        return shadowPolygons(
            {
                boxes: this.casters.boxes.filter((box) => near(box.x, box.y, box.width, box.height)),
                trees: this.casters.trees.filter(nearTree),
                details: (this.casters.details ?? []).filter(nearTree),
            },
            light,
        );
    }
}
