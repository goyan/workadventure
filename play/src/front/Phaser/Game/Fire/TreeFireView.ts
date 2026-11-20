import * as Phaser from "phaser";
import { DEPTH_LAMP_LIGHT_INDEX, DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { seedOf } from "../Nature/SnowyTreeTexture";
import { seenFromFar } from "../Weather/ScreenScale";
import { FLAMES_TEXTURE, GLOW_TEXTURE, SMOKE_TEXTURE } from "./FireView";
import { FLAME_FRAMES_PER_SECOND, flamePose, glowShare, smokeOf } from "./FlameShape";
import type { TreeFireState } from "./TreeFireState";
import { emberPoint, treeFlameIntensity, treeFlames } from "./TreeFlames";
import type { TreeFlame } from "./TreeFlames";

/** Flames are drawn in the trees of the view up to this many: beyond, the other trees carry one each. */
const MAX_TREE_FLAMES = 300;
/** Trees this far out of the view (map pixels) still show their flames: they rise and lean over their neighbours. */
const VIEW_MARGIN_PX = 200;
/** The glow of a tree on fire, as a share of the width of its crown, and how strong at its height. */
const TREE_GLOW_WIDTHS = 2.4;
const TREE_GLOW_ALPHA = 0.9;
/** The smoke of a tree: each puff of the grass, this many times as big, from this many points of the crown. */
const TREE_SMOKE_SCALE = 2.2;
const TREE_SMOKE_COLUMNS = 2;
/** An ember in flight: a bright point this wide (map pixels), and the glow around it. */
const EMBER_PX = 6;
const EMBER_GLOW_PX = 36;

/** A tree of the map as the view needs it (an `Entity` fits). */
export interface BurningTreeObject {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    depth: number;
    visible: boolean;
}

/**
 * The fire of the trees, as the server tells it: flames all over the crown of a tree on fire, the lower ones first,
 * bigger than the flames of the grass and laid by the wind, some behind the tree and some in front; a column of
 * smoke and a glow; and the embers that fly from a tree to where they start the next fire. The flames are the loop
 * of drawn frames of FireView, laid as images: they move a few times a second and the scene is drawn again only
 * then, except while an ember flies. Seen from far, one flame a tree. The server alone decides what burns.
 */
export class TreeFireView {
    private readonly flames: Phaser.GameObjects.Image[] = [];
    private readonly glows: Phaser.GameObjects.Image[] = [];
    private readonly puffs: Phaser.GameObjects.Image[] = [];
    private readonly embers: Phaser.GameObjects.Image[] = [];
    /** The flames of each tree on fire, kept while its image and the zoom stay the same. */
    private readonly anchors = new Map<string, { key: string; flames: TreeFlame[] }>();
    private lastStep = -1;
    private drawn = false;
    private flying = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly state: Pick<TreeFireState, "burning" | "isBurning" | "embers">,
        private readonly tree: (id: string) => BurningTreeObject | undefined,
        private readonly wind: () => { windFrom?: number; windSpeed?: number } | undefined,
        private readonly reducedMotion: () => boolean,
        private readonly enabled: () => boolean = () => true,
    ) {}

    public update(now: number): void {
        const reducedMotion = this.reducedMotion();
        this.drawEmbers(now, reducedMotion);
        if (!this.enabled() || !this.state.isBurning()) {
            if (this.drawn) this.clear();
            return;
        }
        // The flames move with their frames: between two of them nothing changes, and nothing is drawn again.
        const step = Math.floor((now / 1000) * FLAME_FRAMES_PER_SECOND);
        if (step === this.lastStep) return;
        this.lastStep = step;
        const view = this.scene.cameras.main.worldView;
        const far = seenFromFar(this.scene);
        const wind = this.wind();
        const seconds = now / 1000;
        const burning = this.state.burning();
        let flames = 0;
        let glows = 0;
        let puffs = 0;
        const seen = new Set<string>();
        for (const { id, fire } of burning) {
            const tree = this.tree(id);
            if (!tree || !tree.visible) continue;
            if (
                tree.x > view.right + VIEW_MARGIN_PX ||
                tree.x + tree.displayWidth < view.x - VIEW_MARGIN_PX ||
                tree.y > view.bottom + VIEW_MARGIN_PX ||
                tree.y + tree.displayHeight < view.y - VIEW_MARGIN_PX
            ) {
                continue;
            }
            seen.add(id);
            // Past the most flames the view carries, a tree keeps one, as seen from far.
            const single = far || flames >= MAX_TREE_FLAMES;
            const key = `${tree.x},${tree.y},${tree.displayWidth},${tree.displayHeight},${single}`;
            let anchors = this.anchors.get(id);
            if (!anchors || anchors.key !== key) {
                const box = { x: tree.x, y: tree.y, width: tree.displayWidth, height: tree.displayHeight };
                anchors = { key, flames: treeFlames(box, seedOf(id), single) };
                this.anchors.set(id, anchors);
            }
            for (const flame of anchors.flames) {
                const intensity = treeFlameIntensity(flame, fire);
                if (intensity <= 0) continue;
                const input = {
                    intensity,
                    windFrom: wind?.windFrom,
                    windSpeed: wind?.windSpeed,
                    seconds,
                    seed: flame.seed,
                    reducedMotion,
                };
                const pose = flamePose(input);
                const image = this.imageAt(this.flames, flames++, FLAMES_TEXTURE)
                    .setOrigin(0.5, 1)
                    .setFrame(pose.frame)
                    .setPosition(flame.x, flame.y)
                    .setScale(pose.scaleX * flame.scale, pose.scaleY * flame.scale)
                    .setRotation(pose.rotation)
                    .setVisible(true);
                // Some behind the tree, the others in front of it: it burns through.
                // Set only when it changes: each set makes Phaser sort the whole scene again.
                const depth = tree.depth + (flame.behind ? -0.25 : 0.25);
                if (image.depth !== depth) image.setDepth(depth);
            }
            const middleX = tree.x + tree.displayWidth / 2;
            const crownY = tree.y + tree.displayHeight * 0.35;
            const glow = tree.displayWidth * TREE_GLOW_WIDTHS;
            // The glows add up: the trees of a forest on fire share theirs, as the flames of a thick front do.
            this.imageAt(this.glows, glows++, GLOW_TEXTURE)
                .setDepth(DEPTH_LAMP_LIGHT_INDEX + 1)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setPosition(middleX, crownY)
                .setDisplaySize(glow, glow)
                .setAlpha(fire * TREE_GLOW_ALPHA * glowShare(Math.ceil(burning.length / 4)))
                .setVisible(true);
            for (let column = 0; column < (single ? 1 : TREE_SMOKE_COLUMNS); column++) {
                const smoke = smokeOf({
                    intensity: fire,
                    windFrom: wind?.windFrom,
                    windSpeed: wind?.windSpeed,
                    seconds,
                    seed: (seedOf(id) + column * 0.37) % 1,
                    reducedMotion,
                });
                for (const puff of smoke) {
                    const size = puff.radius * 2 * TREE_SMOKE_SCALE;
                    this.imageAt(this.puffs, puffs++, SMOKE_TEXTURE)
                        .setDepth(DEPTH_NIGHT_INDEX - 1)
                        .setPosition(
                            middleX + (column - 0.5) * tree.displayWidth * 0.3 + puff.x * TREE_SMOKE_SCALE,
                            crownY + puff.y * TREE_SMOKE_SCALE,
                        )
                        .setDisplaySize(size, size)
                        .setAlpha(puff.alpha)
                        .setVisible(true);
                }
            }
        }
        for (const id of this.anchors.keys()) if (!seen.has(id)) this.anchors.delete(id);
        this.hideFrom(this.flames, flames);
        this.hideFrom(this.glows, glows);
        this.hideFrom(this.puffs, puffs);
        this.drawn = flames + glows + puffs > 0;
        this.scene.markDirty();
    }

    /** The embers in the air: a bright point on its arc, and its glow. Drawn at every image while one flies. */
    private drawEmbers(now: number, reducedMotion: boolean): void {
        const embers = reducedMotion || !this.enabled() ? [] : this.state.embers(now);
        let shown = 0;
        for (const ember of embers) {
            const point = emberPoint(ember, now);
            if (!point) continue;
            // Brighter as it leaves, fading as it falls.
            const alpha = 1 - 0.5 * point.along;
            this.imageAt(this.embers, shown++, GLOW_TEXTURE)
                .setDepth(DEPTH_LAMP_LIGHT_INDEX + 2)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setPosition(point.x, point.y)
                .setDisplaySize(EMBER_GLOW_PX, EMBER_GLOW_PX)
                .setAlpha(alpha)
                .setVisible(true);
            this.imageAt(this.embers, shown++, GLOW_TEXTURE)
                .setDepth(DEPTH_LAMP_LIGHT_INDEX + 2)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setPosition(point.x, point.y)
                .setDisplaySize(EMBER_PX, EMBER_PX)
                .setAlpha(1)
                .setVisible(true);
        }
        this.hideFrom(this.embers, shown);
        if (shown > 0 || this.flying) this.scene.markDirty();
        this.flying = shown > 0;
    }

    public destroy(): void {
        for (const image of [...this.flames, ...this.glows, ...this.puffs, ...this.embers]) image.destroy();
        this.flames.length = 0;
        this.glows.length = 0;
        this.puffs.length = 0;
        this.embers.length = 0;
    }

    private imageAt(pool: Phaser.GameObjects.Image[], index: number, texture: string): Phaser.GameObjects.Image {
        pool[index] ??= this.scene.add.image(0, 0, texture);
        return pool[index];
    }

    private hideFrom(pool: Phaser.GameObjects.Image[], from: number): void {
        for (let index = from; index < pool.length; index++) pool[index].setVisible(false);
    }

    private clear(): void {
        this.hideFrom(this.flames, 0);
        this.hideFrom(this.glows, 0);
        this.hideFrom(this.puffs, 0);
        this.anchors.clear();
        this.drawn = false;
        this.lastStep = -1;
        this.scene.markDirty();
    }
}
