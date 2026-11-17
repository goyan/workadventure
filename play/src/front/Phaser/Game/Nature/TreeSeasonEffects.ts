import { Season } from "@workadventure/map-editor";
import type * as Phaser from "phaser";
import { FLOOR_OBJECT_DEPTH, OVERHEAD_OBJECT_DEPTH } from "../../ECS/EntityLayerDepth";
import { groundLeaves, treeLeaves, type TreeBox } from "./TreeLeafFall";
import { snowClumps, SNOW_DUMP_SECONDS, treeSnowCycle } from "./TreeSnowLoad";
import { phaseOf } from "./TreeSway";

/** A tree placed on the map, as its leaves and its snow need it (an `Entity` fits). */
export interface SeasonTreeObject {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    depth: number;
    /** Hidden while its image loads. */
    visible: boolean;
    getPrefab(): { imagePath: string; seasonal?: Partial<Record<Season, string>> };
}

export interface TreeSeasonEffectsOptions {
    /** The trees of the map, with an id for their own time. */
    trees: () => Iterable<{ id: string; object: SeasonTreeObject }>;
    /** The season the trees show: the calendar, the snow of the map or the personal theme. */
    season: () => Season;
    /** How far into autumn it is, 0 to 1: how many leaves lie under the trees. */
    autumnProgress: () => number;
    /** Wind speed (km/h) of the map weather, undefined without one (a light breeze then). */
    windSpeed: () => number | undefined;
    /** Where the wind comes from (degrees, 0 north), undefined without a real weather. */
    windFrom: () => number | undefined;
    /** How much snow covers the map for this person, 0 to 1. */
    snowCoverage: () => number;
    /** False while the map is edited, or the weather effects are hidden: the trees look as they always did. */
    enabled: () => boolean;
    isOutdoor: (x: number, y: number) => boolean;
    /** What the camera shows, in map pixels. */
    view: () => TreeBox;
    reducedMotion?: boolean;
}

/** Wind of the light breeze without a real weather, as the swaying of the trees. */
const BREEZE_KMH = 10;
/** Leaves and snow move 15 times a second, as the trees sway: each move draws the whole map again. */
const FRAME_MS = 1000 / 15;
/** A tree a little outside the screen still drops what falls into it. */
const VIEW_MARGIN = 48;
/** Over every overhead object (the trees), under the overlay layers and the night veil. */
const EFFECTS_DEPTH = OVERHEAD_OBJECT_DEPTH + 60_000;
/** The leaves on the ground: over the floors and the floor objects, under every character. */
const GROUND_DEPTH = FLOOR_OBJECT_DEPTH + 0.45;
const SNOW_COLOR = 0xf4f7ff;
/** A tree with less snow than this drops none: there is nothing to fall yet. */
const LIGHTEST_DUMP = 0.3;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * What the season does to the trees that sway. In autumn the wind takes their leaves, which fall under the foliage.
 * and stay on the ground around its foot, more of them as autumn goes. While the map is snowy each tree shows its snowy
 * image, whole, and drops some of its snow on each side now and then.
 * Everything comes from the server time and the id of the tree: the same for everyone.
 */
export class TreeSeasonEffects {
    private readonly reducedMotion: boolean;
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly ground: Phaser.GameObjects.Graphics;
    private lastFrameAt = -Infinity;
    private drawn = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: TreeSeasonEffectsOptions,
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        this.graphics = scene.add.graphics().setDepth(EFFECTS_DEPTH);
        this.ground = scene.add.graphics().setDepth(GROUND_DEPTH);
    }

    /** `now` in ms, `epoch` the server time in ms. */
    public update(now: number, epoch: number): void {
        const season = this.options.season();
        const autumn = season === Season.Autumn;
        const winter = season === Season.Winter;
        if (this.reducedMotion || !this.options.enabled() || (!autumn && !winter)) {
            this.clear();
            return;
        }
        if (now - this.lastFrameAt < FRAME_MS) return;
        this.lastFrameAt = now;
        this.graphics.clear();
        this.ground.clear();
        const seconds = epoch / 1000;
        const fallen = autumn ? this.options.autumnProgress() : 0;
        const view = this.options.view();
        const wind = this.options.windSpeed() ?? BREEZE_KMH;
        const windFrom = this.options.windFrom();
        const coverage = winter ? this.options.snowCoverage() : 0;
        let drawn = false;
        for (const { id, object } of this.options.trees()) {
            if (!object.visible) continue;
            const box = { x: object.x, y: object.y, width: object.displayWidth, height: object.displayHeight };
            if (
                box.x > view.x + view.width + VIEW_MARGIN ||
                box.x + box.width < view.x - VIEW_MARGIN ||
                box.y > view.y + view.height + VIEW_MARGIN ||
                box.y + box.height < view.y - VIEW_MARGIN
            )
                continue;
            // A tree stands where its foot is: the middle of its bottom edge.
            if (!this.options.isOutdoor(box.x + box.width / 2, box.y + box.height - 1)) continue;
            if (autumn) {
                // Evergreens and palms keep their leaves: their autumn image is their summer one.
                const seasons = object.getPrefab().seasonal;
                if (seasons && seasons[Season.Autumn] === seasons[Season.Summer]) continue;
                for (const leaf of groundLeaves(phaseOf(id), fallen, box)) {
                    this.ground.fillStyle(leaf.color, 0.9);
                    this.ground.fillRect(leaf.x, leaf.y, leaf.vertical ? 3 : 4, leaf.vertical ? 4 : 3);
                    drawn = true;
                }
                for (const leaf of treeLeaves(seconds, wind, windFrom, phaseOf(id), box)) {
                    this.graphics.fillStyle(leaf.color, 0.95 * leaf.alpha);
                    this.graphics.fillRect(
                        Math.round(leaf.x),
                        Math.round(leaf.y),
                        leaf.vertical ? 3 : 4,
                        leaf.vertical ? 4 : 3,
                    );
                    drawn = true;
                }
                continue;
            }
            // A snowy tree shows its own snowy image, whole: only the snow it drops now and then is drawn.
            if (!object.getPrefab().seasonal?.[Season.Winter] || coverage < LIGHTEST_DUMP) continue;
            const cycle = treeSnowCycle(seconds, phaseOf(id));
            if (cycle.sinceDump > SNOW_DUMP_SECONDS + 1) continue;
            for (const clump of snowClumps(cycle.sinceDump, box)) {
                this.graphics.fillStyle(SNOW_COLOR, clump.alpha);
                this.graphics.fillRect(clump.x, clump.y, clump.width, clump.height);
                drawn = true;
            }
        }
        if (drawn || this.drawn) this.scene.markDirty();
        this.drawn = drawn;
    }

    private clear(): void {
        if (!this.drawn) return;
        this.graphics.clear();
        this.ground.clear();
        this.drawn = false;
        this.lastFrameAt = -Infinity;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.graphics.destroy();
        this.ground.destroy();
    }
}
