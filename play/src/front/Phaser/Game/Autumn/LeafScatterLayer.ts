import { DEPTH_TILE_INDEX } from "../DepthIndexes";
import type { WeatherView } from "../Weather/WeatherFrame";
import { seenFromFar } from "../Weather/ScreenScale";
import type { LeafSources } from "./LeafDensity";
import { leafCandidatesInView, liesOn, type ScatteredLeaf } from "./LeafScatter";

/** Above the floors (0.5) and the seasonal grass (0.6), below objects and avatars. */
const LEAF_SCATTER_DEPTH = DEPTH_TILE_INDEX + 0.65;

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

    constructor(private readonly scene: Phaser.Scene) {
        this.graphics = scene.add.graphics().setDepth(LEAF_SCATTER_DEPTH);
    }

    /** Returns true when it redrew. `isGround`: where a leaf may lie (outdoors, out of the water). */
    update(
        view: WeatherView,
        isGround: (x: number, y: number) => boolean,
        sources: LeafSources,
        force: boolean,
    ): boolean {
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
        if (
            !force &&
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
            this.graphics.fillRect(leaf.x, leaf.y, leaf.vertical ? 3 : 4, leaf.vertical ? 4 : 3);
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
