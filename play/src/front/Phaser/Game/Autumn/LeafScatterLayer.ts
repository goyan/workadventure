import { DEPTH_TILE_INDEX } from "../DepthIndexes";
import { pixelBlocksShownNow } from "../Terrain/PixelBlocksShown";
import type { WeatherView } from "../Weather/WeatherFrame";
import { seenFromFar } from "../Weather/ScreenScale";
import type { LeafSources } from "./LeafDensity";
import { leafCandidatesInView, liesOn, type ScatteredLeaf } from "./LeafScatter";

/** Above the floors (0.5) and the seasonal grass (0.6), below objects and avatars. */
const LEAF_SCATTER_DEPTH = DEPTH_TILE_INDEX + 0.65;
/** Over the blocks of the relief (0.655), where they draw the ground. */
const LEAF_OVER_BLOCKS_DEPTH = DEPTH_TILE_INDEX + 0.67;

/**
 * Leaves lying under the trees, around the camera: a map-sized image would exceed the texture size, so only the view and a margin
 * of a quarter view on each side are drawn, again when the camera leaves that margin.
 */
export class LeafScatterLayer {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private drawn: WeatherView | undefined;
    /** The leaves of the drawn area wherever the ground is, and which of them lie on it. */
    private candidates: ScatteredLeaf[] = [];
    private lying: boolean[] = [];
    private depth = LEAF_SCATTER_DEPTH;

    /** The drops the leaves were last drawn with (dropVersion). */
    private dropsDrawn: number | undefined;

    /**
     * `dropAt`: how much lower the ground at a point is drawn, the relief seen in 3/4 (GameScene.groundDropAt): a leaf
     * lies where its ground is drawn. `dropVersion` changes when those drops do: the leaves are laid again.
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly dropAt: (x: number, y: number) => number = () => 0,
        private readonly dropVersion: () => number = () => 0,
    ) {
        this.graphics = scene.add.graphics().setDepth(this.depth);
    }

    /** Returns true when it redrew. `isGround`: where a leaf may lie (outdoors, out of the water). */
    update(
        view: WeatherView,
        isGround: (x: number, y: number) => boolean,
        sources: LeafSources,
        force: boolean,
    ): boolean {
        const depth = pixelBlocksShownNow() ? LEAF_OVER_BLOCKS_DEPTH : LEAF_SCATTER_DEPTH;
        if (depth !== this.depth) {
            this.depth = depth;
            this.graphics.setDepth(depth);
        }
        // Seen from far a leaf is a pixel, and the view holds tens of thousands of them: none.
        if (seenFromFar(this.scene)) {
            if (!this.drawn) return false;
            this.drawn = undefined;
            this.candidates = [];
            this.lying = [];
            this.graphics.clear();
            return true;
        }
        const drawn = this.drawn;
        const drops = this.dropVersion();
        if (
            !force &&
            drops === this.dropsDrawn &&
            drawn &&
            view.x >= drawn.x &&
            view.y >= drawn.y &&
            view.x + view.width <= drawn.x + drawn.width &&
            view.y + view.height <= drawn.y + drawn.height
        )
            return false;
        const marginX = view.width / 4;
        const marginY = view.height / 4;
        this.drawn = {
            x: view.x - marginX,
            y: view.y - marginY,
            width: view.width + 2 * marginX,
            height: view.height + 2 * marginY,
        };
        this.dropsDrawn = drops;
        this.candidates = leafCandidatesInView(this.drawn, sources);
        this.lying = this.candidates.map((leaf) => liesOn(leaf, isGround));
        this.draw();
        return true;
    }

    /**
     * The ground changed under the drawn leaves (the water rose or fell): looks again where each of them lies, and
     * redraws only when one of them comes or goes. Returns true when it redrew.
     */
    refreshGround(isGround: (x: number, y: number) => boolean): boolean {
        if (!this.drawn) return false;
        const lying = this.candidates.map((leaf) => liesOn(leaf, isGround));
        if (lying.every((lies, index) => lies === this.lying[index])) return false;
        this.lying = lying;
        this.draw();
        return true;
    }

    private draw(): void {
        this.graphics.clear();
        this.candidates.forEach((leaf, index) => {
            if (!this.lying[index]) return;
            this.graphics.fillStyle(leaf.color, 1);
            this.graphics.fillRect(
                leaf.x,
                leaf.y + Math.round(this.dropAt(leaf.x, leaf.y)),
                leaf.vertical ? 3 : 4,
                leaf.vertical ? 4 : 3,
            );
        });
    }

    setVisible(visible: boolean): void {
        this.graphics.setVisible(visible);
    }

    setAlpha(alpha: number): void {
        this.graphics.setAlpha(alpha);
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
