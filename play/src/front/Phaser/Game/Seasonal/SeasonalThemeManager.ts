import { get, type Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { seasonalThemeModeStore } from "../../../Stores/SeasonalThemeStore";
import { AutumnDecor } from "../Autumn/AutumnDecor";
import { ChristmasDecor } from "../Christmas/ChristmasDecor";
import type { WalkerSample } from "../Christmas/FootprintTrail";
import type { AlphaMask, SnowEntity } from "../Christmas/SnowCaps";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { SeasonalDecor, SeasonalDecorDeps } from "./SeasonalDecor";
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

export interface SeasonalThemeDeps {
    outdoorGrid: () => OutdoorGrid | undefined;
    outdoorVersion: () => number;
    entities: () => Iterable<SnowEntity>;
    /** The scene only redraws when told to. */
    markDirty: () => void;
    serverDate: () => Date | undefined;
    createDecor?: (theme: SeasonalTheme) => SeasonalDecor | undefined;
    readPixels?: (entity: SnowEntity) => AlphaMask | undefined;
}

interface ActiveDecor {
    theme: SeasonalTheme;
    decor: SeasonalDecor | undefined;
    builtVersion: number;
    visible: boolean;
    /** Visible images when the objects were last decorated, and when that was checked. */
    loadedSignature: number;
    loadedCheckAt: number;
}

/** The personal seasonal theme outdoors: picks the theme, and creates, shows, hides and destroys its decor. */
export class SeasonalThemeManager {
    private readonly unsubscribers: Unsubscriber[] = [];
    private mode = get(seasonalThemeModeStore);
    private editing = get(mapEditorModeStore);
    private theme: SeasonalTheme | undefined;
    private lastCheck = -Infinity;
    private active: ActiveDecor | undefined;
    private objectsStale = false;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly deps: SeasonalThemeDeps,
    ) {
        this.unsubscribers.push(
            seasonalThemeModeStore.subscribe((mode) => {
                this.mode = mode;
                this.lastCheck = -Infinity;
            }),
            mapEditorModeStore.subscribe((editing) => {
                // Objects may have moved while editing: decorate them again when it ends.
                if (this.editing && !editing) this.objectsStale = true;
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
            this.theme = activeSeasonalTheme(this.mode, serverDate);
            // Without the server time, auto has no theme yet: ask again next frame rather than in a minute.
            if (serverDate || this.mode !== SeasonalThemeMode.Auto) this.lastCheck = time;
        }
        if (this.active && this.active.theme !== this.theme) this.removeDecor();
        if (!this.theme) return;
        const grid = this.deps.outdoorGrid();
        if (!grid) return;
        const active = this.active ?? this.createDecor(this.theme);
        const decor = active.decor;
        if (!decor) return;
        const version = this.deps.outdoorVersion();
        if (version !== active.builtVersion) {
            decor.redrawGround(grid);
            active.builtVersion = version;
            this.rebuildObjects(active, decor, grid, time);
        } else if (this.objectsStale && !this.editing) {
            this.rebuildObjects(active, decor, grid, time);
        } else if (!this.editing && time - active.loadedCheckAt >= LOADED_CHECK_MS) {
            active.loadedCheckAt = time;
            if (this.visibleSignature() !== active.loadedSignature) this.rebuildObjects(active, decor, grid, time);
        }
        const visible = !this.editing;
        if (visible !== active.visible) {
            active.visible = visible;
            decor.setVisible(visible);
            this.deps.markDirty();
        }
        if (decor.update(time, visible ? walkers() : [])) this.deps.markDirty();
    }

    destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.removeDecor();
    }

    private rebuildObjects(active: ActiveDecor, decor: SeasonalDecor, grid: OutdoorGrid, time: number): void {
        decor.rebuildObjects(this.deps.entities(), grid);
        active.loadedSignature = this.visibleSignature();
        active.loadedCheckAt = time;
        this.objectsStale = false;
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
        this.active = {
            theme,
            decor: (this.deps.createDecor ?? ((t: SeasonalTheme) => this.defaultDecor(t)))(theme),
            builtVersion: -1,
            visible: true,
            loadedSignature: 0,
            loadedCheckAt: -Infinity,
        };
        return this.active;
    }

    private defaultDecor(theme: SeasonalTheme): SeasonalDecor | undefined {
        const deps: SeasonalDecorDeps = {
            isOutdoor: (x, y) => this.deps.outdoorGrid()?.isOutdoorAt(x, y) ?? false,
            readPixels: this.deps.readPixels ?? readFrameAlpha(this.scene),
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
}
