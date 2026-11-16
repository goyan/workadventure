import { Season } from "@workadventure/map-editor";
import type * as Phaser from "phaser";
import { OVERHEAD_OBJECT_DEPTH } from "../../ECS/EntityLayerDepth";
import { treeLeaves, type TreeBox } from "./TreeLeafFall";
import { snowClumps, SNOW_DUMP_SECONDS, treeSnowCycle, treeSnowLoad } from "./TreeSnowLoad";
import { phaseOf, type SwayingObject } from "./TreeSway";

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
    /** The season the trees would show without snow: what is under the snow. */
    bareSeason: () => Season;
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
const SNOW_COLOR = 0xf4f7ff;
/** A tree with less snow than this drops none: there is nothing to fall yet. */
const LIGHTEST_DUMP = 0.3;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

type BareImage = Phaser.GameObjects.Image;

/**
 * What the season does to the trees that sway. In autumn the wind takes their leaves, which fall under the foliage.
 * While the map is snowy the snow builds up on each tree, then falls off on each side once it is too heavy: the tree's
 * own snowy image shows more and more through its bare image drawn over it, which comes back when the snow falls.
 * Everything comes from the server time and the id of the tree: the same for everyone.
 */
export class TreeSeasonEffects {
    private readonly reducedMotion: boolean;
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly bareImages = new Map<string, BareImage>();
    private lastFrameAt = -Infinity;
    private drawn = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: TreeSeasonEffectsOptions,
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        this.graphics = scene.add.graphics().setDepth(EFFECTS_DEPTH);
    }

    /** The bare images over the snowy trees, for them to sway with their tree. */
    public *overlays(): Generator<{ id: string; object: SwayingObject }> {
        for (const [id, object] of this.bareImages) yield { id, object };
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
        const seconds = epoch / 1000;
        const view = this.options.view();
        const wind = this.options.windSpeed() ?? BREEZE_KMH;
        const windFrom = this.options.windFrom();
        const coverage = winter ? this.options.snowCoverage() : 0;
        const snowy = new Set<string>();
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
            const bare = this.bareTexture(object);
            if (!bare) continue;
            const cycle = treeSnowCycle(seconds, phaseOf(id));
            this.bareImage(id, bare)
                .setPosition(object.x, object.y)
                .setDisplaySize(object.displayWidth, object.displayHeight)
                .setDepth(object.depth + 0.01)
                .setAlpha(1 - treeSnowLoad(coverage, cycle.load));
            snowy.add(id);
            drawn = true;
            if (coverage < LIGHTEST_DUMP || cycle.sinceDump > SNOW_DUMP_SECONDS + 1) continue;
            for (const clump of snowClumps(cycle.sinceDump, box)) {
                this.graphics.fillStyle(SNOW_COLOR, clump.alpha);
                this.graphics.fillRect(clump.x, clump.y, clump.width, clump.height);
            }
        }
        for (const [id, image] of this.bareImages) {
            if (snowy.has(id)) continue;
            image.destroy();
            this.bareImages.delete(id);
        }
        if (drawn || this.drawn) this.scene.markDirty();
        this.drawn = drawn;
    }

    /** The image of the tree without snow, when it has a snowy one to show under it. */
    private bareTexture(object: SeasonTreeObject): string | undefined {
        const prefab = object.getPrefab();
        const snowyPath = prefab.seasonal?.[Season.Winter];
        if (!snowyPath || !this.scene.textures.exists(snowyPath)) return undefined;
        const barePath = prefab.seasonal?.[this.options.bareSeason()];
        const path = barePath && this.scene.textures.exists(barePath) ? barePath : prefab.imagePath;
        return path !== snowyPath && this.scene.textures.exists(path) ? path : undefined;
    }

    private bareImage(id: string, texture: string): BareImage {
        const known = this.bareImages.get(id);
        if (known) {
            if (known.texture?.key !== texture) known.setTexture(texture);
            return known;
        }
        const image = this.scene.add.image(0, 0, texture).setOrigin(0);
        this.bareImages.set(id, image);
        return image;
    }

    private clear(): void {
        if (!this.drawn && this.bareImages.size === 0) return;
        this.graphics.clear();
        for (const image of this.bareImages.values()) image.destroy();
        this.bareImages.clear();
        this.drawn = false;
        this.lastFrameAt = -Infinity;
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const image of this.bareImages.values()) image.destroy();
        this.bareImages.clear();
        this.graphics.destroy();
    }
}
