import type { WalkerSample } from "../Christmas/FootprintTrail";
import type { SnowEntity } from "../Christmas/SnowCaps";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { SeasonalDecor, SeasonalDecorDeps } from "../Seasonal/SeasonalDecor";
import { KickedLeafLayer } from "./KickedLeafLayer";
import { KickedLeafTrail } from "./KickedLeafTrail";
import {
    LEAF_KICK_MIN_DENSITY,
    LEAF_PILE_MIN_DENSITY,
    leafDensityAt,
    leafTreesOf,
    leafWindKey,
    quantizeWind,
    type LeafSources,
} from "./LeafDensity";
import { LeafPiles } from "./LeafPiles";
import { LeafScatterLayer } from "./LeafScatterLayer";

/** Kicked leaves only need a redraw now and then while they fly and fade. */
const FLIGHT_REDRAW_MS = 100;
/** The water of the relief changes every second: the leaves around it are laid again this often at most. */
const WATER_REDRAW_MS = 5000;
/** Autumn goes by steps of a thirtieth (about three days): the leaves on the ground are laid again then. */
const PROGRESS_STEPS = 30;

/**
 * Autumn outdoors: leaves lying under the trees and downwind of them, piles at the foot of the objects among them,
 * and leaves kicked up by walkers there. Nothing far from every tree, nothing in the water.
 */
export class AutumnDecor implements SeasonalDecor {
    private readonly scatter: LeafScatterLayer;
    private readonly piles: LeafPiles;
    private readonly kicked: KickedLeafLayer;
    private readonly trail: KickedLeafTrail;
    private groundChanged = true;
    private lastFlightRedraw = -Infinity;
    /** The objects last decorated, to pile them again when the wind moves the leaves. */
    private entities: SnowEntity[] = [];
    private grid: OutdoorGrid | undefined;
    private sources: LeafSources = { trees: [], wind: quantizeWind(undefined, undefined), progress: 1 };
    private sourcesKey = "";
    private treesChanged = false;
    private drawnWater: number | undefined;
    private lastWaterRedraw = -Infinity;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly deps: SeasonalDecorDeps,
    ) {
        this.scatter = new LeafScatterLayer(scene);
        this.piles = new LeafPiles(scene, deps.readPixels);
        this.kicked = new KickedLeafLayer(scene);
        this.trail = new KickedLeafTrail((x, y) => this.hasLeavesAt(x, y, LEAF_KICK_MIN_DENSITY));
        this.refreshSources();
    }

    redrawGround(_grid: OutdoorGrid): void {
        this.groundChanged = true;
    }

    rebuildObjects(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void {
        this.entities = [...entities];
        this.grid = grid;
        this.sources = { ...this.sources, trees: leafTreesOf(this.entities, this.deps.isOutdoor) };
        this.treesChanged = true;
        this.pile();
    }

    update(time: number, walkers: WalkerSample[]): boolean {
        const moved = this.refreshSources();
        if (moved) this.pile();
        let force = this.groundChanged || this.treesChanged || moved;
        const water = this.deps.waterVersion?.();
        if (water !== this.drawnWater && time - this.lastWaterRedraw >= WATER_REDRAW_MS) force = true;
        if (force) {
            this.drawnWater = water;
            this.lastWaterRedraw = time;
        }
        let dirty = this.scatter.update(this.scene.cameras.main.worldView, this.isGround, this.sources, force);
        this.groundChanged = false;
        this.treesChanged = false;
        // An empty list (editing) forgets where everyone was, so that leaving the editor kicks nothing.
        const leaves = this.trail.update(walkers, time);
        if (leaves.length > 0) {
            this.kicked.add(leaves, time);
            dirty = true;
        }
        if (this.kicked.update(time) && time - this.lastFlightRedraw >= FLIGHT_REDRAW_MS) {
            this.lastFlightRedraw = time;
            dirty = true;
        }
        return dirty;
    }

    setVisible(visible: boolean): void {
        this.scatter.setVisible(visible);
        this.piles.setVisible(visible);
        this.kicked.setVisible(visible);
    }

    setAlpha(alpha: number): void {
        this.scatter.setAlpha(alpha);
        this.piles.setAlpha(alpha);
        this.kicked.setAlpha(alpha);
    }

    destroy(): void {
        this.scatter.destroy();
        this.piles.destroy();
        this.kicked.destroy();
    }

    /** Where a leaf may lie: outdoors, out of the water. */
    private readonly isGround = (x: number, y: number): boolean =>
        this.deps.isOutdoor(x, y) && !(this.deps.isWet?.(x, y) ?? false);

    private hasLeavesAt(x: number, y: number, least: number): boolean {
        const { trees, wind, progress } = this.sources;
        return this.isGround(x, y) && leafDensityAt(x, y, trees, wind, progress) >= least;
    }

    private pile(): void {
        if (!this.grid) return;
        this.piles.rebuild(this.entities, this.grid, (x, y) => this.hasLeavesAt(x, y, LEAF_PILE_MIN_DENSITY));
    }

    /** Reads the wind and the date, rounded; returns true when the leaves on the ground move with them. */
    private refreshSources(): boolean {
        const conditions = this.deps.leafConditions?.();
        const wind = quantizeWind(conditions?.windSpeed, conditions?.windFrom);
        const progress = Math.round((conditions?.progress ?? 1) * PROGRESS_STEPS) / PROGRESS_STEPS;
        const key = `${leafWindKey(wind)}:${progress}`;
        if (key === this.sourcesKey) return false;
        const first = this.sourcesKey === "";
        this.sourcesKey = key;
        this.sources = { ...this.sources, wind, progress };
        return !first;
    }
}
