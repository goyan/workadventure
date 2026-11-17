import { Season } from "@workadventure/map-editor";
import type * as Phaser from "phaser";
import { FLOOR_OBJECT_DEPTH, OVERHEAD_OBJECT_DEPTH } from "../../ECS/EntityLayerDepth";
import { groundLeaves, treeLeaves, type TreeBox } from "./TreeLeafFall";
import { snowClumps, SNOW_DUMP_SECONDS, treeSnowCycle, treeSnowLoad } from "./TreeSnowLoad";
import { POSE_PAD } from "./TreePoses";
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
    /** The season the trees would show without snow: what is under the snow. */
    bareSeason: () => Season;
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
    /** The pose a tree sways in (TreeSway.poseOf), 0 straight: the bare image over a snowy tree bends with it. */
    pose?: (id: string) => number;
    /** Key of the texture showing an image in a pose (TreePoseTextures.key), undefined when there is none. */
    poseTexture?: (textureKey: string, pose: number) => string | undefined;
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
/** The snow settles on the top of the tree and comes down to the bottom of its foliage: this share of its image. */
const FOLIAGE_SHARE = 0.75;
const SNOW_COLOR = 0xf4f7ff;
/** A tree with less snow than this drops none: there is nothing to fall yet. */
const LIGHTEST_DUMP = 0.3;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

type BareImage = Phaser.GameObjects.Image;

/**
 * What the season does to the trees that sway. In autumn the wind takes their leaves, which fall under the foliage.
 * and stay on the ground around its foot, more of them as autumn goes. While the map is snowy the snow settles on the
 * top of each tree and comes down its foliage, then falls off on each side once it is too heavy: the bare image of the
 * tree is drawn over its snowy one with its top cut off, lower and lower, and comes back whole when the snow falls.
 * Everything comes from the server time and the id of the tree: the same for everyone.
 */
export class TreeSeasonEffects {
    private readonly reducedMotion: boolean;
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly ground: Phaser.GameObjects.Graphics;
    private readonly bareImages = new Map<string, BareImage>();
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
            const bare = this.bareTexture(object);
            if (!bare) continue;
            const cycle = treeSnowCycle(seconds, phaseOf(id));
            // The bare image bends as its tree does: a bent image has room for its top on each side.
            const pose = this.options.pose?.(id) ?? 0;
            const bent = pose === 0 ? undefined : this.options.poseTexture?.(bare, pose);
            const image = this.bareImage(id, bent ?? bare);
            const { width, height } = image.frame;
            const scale = object.displayWidth / (bent ? width - 2 * POSE_PAD : width);
            image
                .setPosition(object.x - (bent ? POSE_PAD * scale : 0), object.y)
                .setDisplaySize(width * scale, object.displayHeight)
                .setDepth(object.depth + 0.01);
            // The snowy tree shows above the cut: the snow line comes down as the tree loads.
            const snowLine = Math.round(height * FOLIAGE_SHARE * treeSnowLoad(coverage, cycle.load));
            image.setCrop(0, snowLine, width, height - snowLine);
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
        // Under the snow the foliage is green: an autumn tree is replaced by its snowy one, never shown orange.
        const bareSeason = this.options.bareSeason();
        const barePath = prefab.seasonal?.[bareSeason === Season.Autumn ? Season.Summer : bareSeason];
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
        this.ground.clear();
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
        this.ground.destroy();
    }
}
