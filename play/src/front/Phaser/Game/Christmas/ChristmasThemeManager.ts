import { get, type Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { christmasThemeModeStore } from "../../../Stores/ChristmasThemeStore";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { isChristmasActive } from "./ChristmasSeason";
import { FootprintLayer } from "./FootprintLayer";
import { FootprintTrail, type WalkerSample } from "./FootprintTrail";
import { SnowCaps, type AlphaMask, type SnowEntity } from "./SnowCaps";
import { SnowGround } from "./SnowGround";

/** The date is checked again every minute, so the theme starts at midnight on December 1st without a reload. */
const DATE_CHECK_MS = 60_000;
/** Object images load after the map: count the visible ones this often, and snow the newcomers. */
const LOADED_CHECK_MS = 1000;
/** Fading footprints only need a redraw now and then. */
const FADE_REDRAW_MS = 100;

export interface ChristmasThemeDeps {
    outdoorGrid: () => OutdoorGrid | undefined;
    outdoorVersion: () => number;
    entities: () => Iterable<SnowEntity>;
    /** The scene only redraws when told to. */
    markDirty: () => void;
    readPixels?: (entity: SnowEntity) => AlphaMask | undefined;
    now?: () => Date;
}

interface Layers {
    ground: SnowGround;
    caps: SnowCaps;
    prints: FootprintLayer;
    trail: FootprintTrail;
    builtVersion: number;
    visible: boolean;
    /** Visible entities when the caps were last built, and when that was checked. */
    loadedCount: number;
    loadedCheckAt: number;
}

/** The personal Christmas theme outdoors: snowy ground, snow on objects and footprints. */
export class ChristmasThemeManager {
    private readonly unsubscribers: Unsubscriber[] = [];
    private mode = get(christmasThemeModeStore);
    private editing = get(mapEditorModeStore);
    private active = false;
    private lastCheck = -Infinity;
    private lastFadeRedraw = -Infinity;
    private layers: Layers | undefined;
    private capsStale = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly deps: ChristmasThemeDeps,
    ) {
        this.unsubscribers.push(
            christmasThemeModeStore.subscribe((mode) => {
                this.mode = mode;
                this.lastCheck = -Infinity;
            }),
            mapEditorModeStore.subscribe((editing) => {
                // Objects may have moved while editing: put the snow back on them when it ends.
                if (this.editing && !editing) this.capsStale = true;
                this.editing = editing;
            }),
        );
    }

    isActive(): boolean {
        return this.active;
    }

    update(time: number, walkers: () => WalkerSample[]): void {
        if (time - this.lastCheck >= DATE_CHECK_MS) {
            this.lastCheck = time;
            this.active = isChristmasActive(this.mode, this.deps.now?.() ?? new Date());
        }
        if (!this.active) {
            this.removeLayers();
            return;
        }
        const grid = this.deps.outdoorGrid();
        if (!grid) return;
        const layers = this.layers ?? this.createLayers();
        const version = this.deps.outdoorVersion();
        if (version !== layers.builtVersion) {
            layers.ground.draw(grid);
            layers.builtVersion = version;
            this.rebuildCaps(layers, grid, time);
        } else if (this.capsStale && !this.editing) {
            this.rebuildCaps(layers, grid, time);
        } else if (!this.editing && time - layers.loadedCheckAt >= LOADED_CHECK_MS) {
            layers.loadedCheckAt = time;
            if (this.countVisible() !== layers.loadedCount) this.rebuildCaps(layers, grid, time);
        }
        const visible = !this.editing;
        if (visible !== layers.visible) {
            layers.visible = visible;
            layers.ground.setVisible(visible);
            layers.caps.setVisible(visible);
            layers.prints.setVisible(visible);
            this.deps.markDirty();
        }
        if (visible) {
            const marks = layers.trail.update(walkers(), time);
            if (marks.length > 0) {
                layers.prints.add(marks, time);
                this.deps.markDirty();
            }
        } else {
            // Forget where everyone was, so that leaving the editor draws no line.
            layers.trail.update([]);
        }
        layers.prints.update(time);
        if (layers.prints.count > 0 && time - this.lastFadeRedraw >= FADE_REDRAW_MS) {
            this.lastFadeRedraw = time;
            this.deps.markDirty();
        }
    }

    destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.removeLayers();
    }

    private rebuildCaps(layers: Layers, grid: OutdoorGrid, time: number): void {
        layers.caps.rebuild(this.deps.entities(), grid);
        layers.loadedCount = this.countVisible();
        layers.loadedCheckAt = time;
        this.capsStale = false;
        this.deps.markDirty();
    }

    private countVisible(): number {
        let count = 0;
        for (const entity of this.deps.entities()) if (entity.visible) count++;
        return count;
    }

    private createLayers(): Layers {
        this.layers = {
            ground: new SnowGround(this.scene),
            caps: new SnowCaps(this.scene, this.deps.readPixels ?? readFrameAlpha(this.scene)),
            prints: new FootprintLayer(this.scene),
            trail: new FootprintTrail((x, y) => this.deps.outdoorGrid()?.isOutdoorAt(x, y) ?? false),
            builtVersion: -1,
            visible: true,
            loadedCount: 0,
            loadedCheckAt: -Infinity,
        };
        return this.layers;
    }

    private removeLayers(): void {
        if (!this.layers) return;
        this.layers.ground.destroy();
        this.layers.caps.destroy();
        this.layers.prints.destroy();
        this.layers = undefined;
        this.deps.markDirty();
    }
}

/** Reads the alpha of an entity's frame through a canvas. Throws when the browser refuses (CORS). */
export function readFrameAlpha(scene: Phaser.Scene): (entity: SnowEntity) => AlphaMask | undefined {
    return (entity) => {
        const frame = scene.textures.getFrame(entity.texture.key, entity.frame.name);
        const source = frame?.source.image;
        if (!frame || !(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return undefined;
        const { cutX, cutY, cutWidth: width, cutHeight: height } = frame;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return undefined;
        context.drawImage(source, cutX, cutY, width, height, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const alpha = new Uint8ClampedArray(width * height);
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
        return { width, height, alpha };
    };
}
