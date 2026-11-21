import { get, type Unsubscriber, derived } from "svelte/store";
import type { SeasonPlace } from "@workadventure/map-editor";
import { FrostPrints } from "@wa/front/Phaser/Game/Weather/FrostPrints";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { seasonalThemeModeStore } from "../../../Stores/SeasonalThemeStore";
import { AutumnDecor } from "../Autumn/AutumnDecor";
import { ChristmasDecor } from "../Christmas/ChristmasDecor";
import type { WalkerSample } from "../Christmas/FootprintTrail";
import type { AlphaMask, SnowEntity } from "../Christmas/SnowCaps";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { basicActiveStore } from "../../../Stores/BasicModeStore";
import type { LeafConditions, SeasonalDecor, SeasonalDecorDeps } from "./SeasonalDecor";
import { activeSeasonalTheme, SeasonalTheme, SeasonalThemeMode } from "./SeasonalTheme";
import { readFrameAlpha } from "./readFrameAlpha";

/** The calendar is checked again every minute, so the theme changes at midnight without a reload. */
const DATE_CHECK_MS = 60_000;
/**
 * Object images load after the map, and seasonal trees change image with the season: check the visible images this
 * often, and decorate again when they changed.
 */
const LOADED_CHECK_MS = 1000;
/** The image Phaser shows while the real one has not loaded yet. */
const MISSING_TEXTURE = "__MISSING";
/**
 * The map snow builds up and melts over 10 minutes: its opacity moves by steps of a fortieth, so the scene redraws about
 * 40 times rather than at every frame.
 */
const SNOW_ALPHA_STEPS = 40;
/** The footprints on the frost fade with it by steps of a tenth. */
const FROST_ALPHA_STEPS = 10;

export interface SeasonalThemeDeps {
    outdoorGrid: () => OutdoorGrid | undefined;
    outdoorVersion: () => number;
    entities: () => Iterable<SnowEntity>;
    /** The scene only redraws when told to. */
    markDirty: () => void;
    serverDate: () => Date | undefined;
    /** The place of the map, whose season the automatic theme follows (Paris without one). */
    place?: () => SeasonPlace | undefined;
    createDecor?: (theme: SeasonalTheme) => SeasonalDecor | undefined;
    readPixels?: (entity: SnowEntity) => AlphaMask | undefined;
    /** How much the map snow covers the ground, 0 to 1; 0 when the map snow is not shown. */
    mapSnowCoverage?: () => number;
    /** The wind of the map and the date, for the leaves of autumn. */
    leafConditions?: () => LeafConditions;
    /** Whether a point is under water: nothing seasonal lies there. */
    isWet?: (x: number, y: number) => boolean;
    /** Changes when the water does. */
    waterVersion?: () => number;
    /** How frosted the ground is for this player, 0 to 1 (Weather/Frost.ts): footprints show on it. */
    frost?: () => number;
}

interface ActiveDecor {
    theme: SeasonalTheme;
    decor: SeasonalDecor | undefined;
    builtVersion: number;
    visible: boolean;
    /** Opacity last given to the decor. */
    alpha: number;
    /** Objects may have moved while editing: decorate them again when it ends. */
    objectsStale: boolean;
    /** Visible images when the objects were last decorated, and when that was checked. */
    loadedSignature: number;
    loadedCheckAt: number;
}

/**
 * The personal seasonal theme outdoors: picks the theme, and creates, shows, hides and destroys its decor. The map snow
 * is a second, snow decor (Christmas/) fading in over the theme one as the snow builds up, and out as it melts.
 */
export class SeasonalThemeManager {
    private readonly unsubscribers: Unsubscriber[] = [];
    private mode = get(seasonalThemeModeStore);
    private editing = get(mapEditorModeStore);
    private theme: SeasonalTheme | undefined;
    private lastCheck = -Infinity;
    private active: ActiveDecor | undefined;
    /** The snow decor of the map snow, while it lies. */
    private snow: ActiveDecor | undefined;
    /** The footprints on the frosted ground, while it is frosted and neither the snow nor Christmas leaves its own. */
    private frostPrints: FrostPrints | undefined;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly deps: SeasonalThemeDeps,
    ) {
        this.unsubscribers.push(
            // Basique has no seasonal decor.
            derived([seasonalThemeModeStore, basicActiveStore], ([mode, basic]) =>
                basic ? SeasonalThemeMode.None : mode,
            ).subscribe((mode) => {
                this.mode = mode;
                this.lastCheck = -Infinity;
            }),
            mapEditorModeStore.subscribe((editing) => {
                if (this.editing && !editing) {
                    for (const decor of [this.active, this.snow]) if (decor) decor.objectsStale = true;
                }
                this.editing = editing;
            }),
        );
    }

    activeTheme(): SeasonalTheme | undefined {
        return this.theme;
    }

    update(time: number, walkers: () => WalkerSample[]): void {
        if (time - this.lastCheck >= DATE_CHECK_MS) {
            const serverDate = this.deps.serverDate();
            this.theme = activeSeasonalTheme(this.mode, serverDate, this.deps.place?.());
            // Without the server time, auto has no theme yet: ask again next frame rather than in a minute.
            if (serverDate || this.mode !== SeasonalThemeMode.Auto) this.lastCheck = time;
        }
        if (this.active && this.active.theme !== this.theme) this.removeDecor();
        const snowAlpha = this.snowAlpha();
        const snowDecor = snowAlpha > 0;
        if (!snowDecor) this.removeSnowDecor();
        const grid = this.deps.outdoorGrid();
        if (!grid) return;
        const visible = !this.editing;
        let samples: WalkerSample[] | undefined;
        const walkerSamples = (): WalkerSample[] => (samples ??= visible ? walkers() : []);
        if (this.theme) {
            const active = this.active ?? (this.active = this.createDecor(this.theme));
            // Under the map snow the theme decor fades out, and is gone under a full cover.
            this.drive(active, grid, time, visible, snowDecor ? 1 - snowAlpha : 1, walkerSamples);
        }
        if (snowDecor) {
            const snow = this.snow ?? (this.snow = this.createDecor(SeasonalTheme.Christmas));
            this.drive(snow, grid, time, visible, snowAlpha, walkerSamples);
        }
        this.driveFrostPrints(time, visible, snowAlpha > 0 || this.theme === SeasonalTheme.Christmas, walkerSamples);
    }

    private driveFrostPrints(time: number, visible: boolean, snowPrints: boolean, walkers: () => WalkerSample[]): void {
        const frost = snowPrints ? 0 : Math.round((this.deps.frost?.() ?? 0) * FROST_ALPHA_STEPS) / FROST_ALPHA_STEPS;
        if (frost <= 0) {
            if (this.frostPrints) {
                this.frostPrints.destroy();
                this.frostPrints = undefined;
                this.deps.markDirty();
            }
            return;
        }
        const prints =
            this.frostPrints ??
            (this.frostPrints = new FrostPrints(
                this.scene,
                (x, y) => this.deps.outdoorGrid()?.isOutdoorAt(x, y) ?? false,
                (x, y) => this.deps.isWet?.(x, y) ?? false,
            ));
        prints.setVisible(visible);
        if (prints.update(time, walkers(), frost)) this.deps.markDirty();
    }

    destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.removeDecor();
        this.removeSnowDecor();
        this.frostPrints?.destroy();
        this.frostPrints = undefined;
    }

    /** The map snow cover, by steps of a fortieth; any snow shows at least one step. */
    private snowAlpha(): number {
        const coverage = Math.min(1, this.deps.mapSnowCoverage?.() ?? 0);
        if (!(coverage > 0)) return 0;
        return Math.max(1, Math.round(coverage * SNOW_ALPHA_STEPS)) / SNOW_ALPHA_STEPS;
    }

    /** Draws, shows, fades and animates one decor: the theme one and the snow one get the same treatment. */
    private drive(
        active: ActiveDecor,
        grid: OutdoorGrid,
        time: number,
        visible: boolean,
        alpha: number,
        walkers: () => WalkerSample[],
    ): void {
        const decor = active.decor;
        if (!decor) return;
        const version = this.deps.outdoorVersion();
        if (version !== active.builtVersion) {
            decor.redrawGround(grid);
            active.builtVersion = version;
            this.rebuildObjects(active, decor, grid, time);
        } else if (active.objectsStale && !this.editing) {
            this.rebuildObjects(active, decor, grid, time);
        } else if (!this.editing && time - active.loadedCheckAt >= LOADED_CHECK_MS) {
            active.loadedCheckAt = time;
            if (this.visibleSignature() !== active.loadedSignature) this.rebuildObjects(active, decor, grid, time);
        }
        if (visible !== active.visible) {
            active.visible = visible;
            decor.setVisible(visible);
            this.deps.markDirty();
        }
        if (alpha !== active.alpha) {
            active.alpha = alpha;
            decor.setAlpha(alpha);
            this.deps.markDirty();
        }
        if (decor.update(time, walkers())) this.deps.markDirty();
    }

    private rebuildObjects(active: ActiveDecor, decor: SeasonalDecor, grid: OutdoorGrid, time: number): void {
        decor.rebuildObjects(this.deps.entities(), grid);
        active.loadedSignature = this.visibleSignature();
        active.loadedCheckAt = time;
        active.objectsStale = false;
        this.deps.markDirty();
    }

    /**
     * Changes when an image appears, disappears, finishes loading, or a tree turns to its season. Another frame of an
     * animated object (a door opening) changes nothing: the decor is not built again for it.
     */
    private visibleSignature(): number {
        let signature = 0;
        for (const entity of this.deps.entities()) {
            if (!entity.visible) continue;
            const textureKey = entity.texture?.key ?? "";
            const key = entity.getPrefab().seasonal ? textureKey : textureKey === MISSING_TEXTURE ? "" : "loaded";
            let hash = 17;
            for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
            signature = (signature * 33 + hash) | 0;
        }
        return signature;
    }

    private createDecor(theme: SeasonalTheme): ActiveDecor {
        return {
            theme,
            decor: (this.deps.createDecor ?? ((t: SeasonalTheme) => this.defaultDecor(t)))(theme),
            builtVersion: -1,
            visible: true,
            // Not given yet: the first frame sets it, whatever it is.
            alpha: Number.NaN,
            objectsStale: false,
            loadedSignature: 0,
            loadedCheckAt: -Infinity,
        };
    }

    private defaultDecor(theme: SeasonalTheme): SeasonalDecor | undefined {
        const deps: SeasonalDecorDeps = {
            isOutdoor: (x, y) => this.deps.outdoorGrid()?.isOutdoorAt(x, y) ?? false,
            readPixels: this.deps.readPixels ?? readFrameAlpha(this.scene),
            leafConditions: this.deps.leafConditions,
            isWet: this.deps.isWet,
            waterVersion: this.deps.waterVersion,
        };
        return theme === SeasonalTheme.Christmas
            ? new ChristmasDecor(this.scene, deps)
            : new AutumnDecor(this.scene, deps);
    }

    private removeDecor(): void {
        if (!this.active) return;
        this.active.decor?.destroy();
        this.active = undefined;
        this.deps.markDirty();
    }

    private removeSnowDecor(): void {
        if (!this.snow) return;
        this.snow.decor?.destroy();
        this.snow = undefined;
        this.deps.markDirty();
    }
}
