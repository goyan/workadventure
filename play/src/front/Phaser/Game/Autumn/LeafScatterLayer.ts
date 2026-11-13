import { DEPTH_TILE_INDEX } from "../DepthIndexes";
import type { WeatherView } from "../Weather/WeatherFrame";
import { scatteredLeavesInView } from "./LeafScatter";

/** Above the floors (0.5) and the seasonal grass (0.6), below objects and avatars. */
const LEAF_SCATTER_DEPTH = DEPTH_TILE_INDEX + 0.65;

/**
 * Scattered leaves around the camera: a map-sized image would exceed the texture size, so only the view and a margin
 * of a quarter view on each side are drawn, again when the camera leaves that margin.
 */
export class LeafScatterLayer {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private drawn: WeatherView | undefined;

    constructor(scene: Phaser.Scene) {
        this.graphics = scene.add.graphics().setDepth(LEAF_SCATTER_DEPTH);
    }

    /** Returns true when it redrew. */
    update(view: WeatherView, isOutdoor: (x: number, y: number) => boolean, force: boolean): boolean {
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
        this.graphics.clear();
        for (const leaf of scatteredLeavesInView(this.drawn, isOutdoor)) {
            this.graphics.fillStyle(leaf.color, 1);
            this.graphics.fillRect(leaf.x, leaf.y, leaf.vertical ? 3 : 4, leaf.vertical ? 4 : 3);
        }
        return true;
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
