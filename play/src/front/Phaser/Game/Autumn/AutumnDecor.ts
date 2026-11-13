import type { WalkerSample } from "../Christmas/FootprintTrail";
import type { SnowEntity } from "../Christmas/SnowCaps";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { SeasonalDecor, SeasonalDecorDeps } from "../Seasonal/SeasonalDecor";
import { KickedLeafLayer } from "./KickedLeafLayer";
import { KickedLeafTrail } from "./KickedLeafTrail";
import { LeafPiles } from "./LeafPiles";
import { LeafScatterLayer } from "./LeafScatterLayer";

/** Kicked leaves only need a redraw now and then while they fly and fade. */
const FLIGHT_REDRAW_MS = 100;

/** Autumn outdoors: scattered leaves, piles at the foot of objects, and leaves kicked up by walkers. */
export class AutumnDecor implements SeasonalDecor {
    private readonly scatter: LeafScatterLayer;
    private readonly piles: LeafPiles;
    private readonly kicked: KickedLeafLayer;
    private readonly trail: KickedLeafTrail;
    private groundChanged = true;
    private lastFlightRedraw = -Infinity;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly deps: SeasonalDecorDeps,
    ) {
        this.scatter = new LeafScatterLayer(scene);
        this.piles = new LeafPiles(scene, deps.readPixels);
        this.kicked = new KickedLeafLayer(scene);
        this.trail = new KickedLeafTrail(deps.isOutdoor);
    }

    redrawGround(_grid: OutdoorGrid): void {
        this.groundChanged = true;
    }

    rebuildObjects(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void {
        this.piles.rebuild(entities, grid);
    }

    update(time: number, walkers: WalkerSample[]): boolean {
        let dirty = this.scatter.update(this.scene.cameras.main.worldView, this.deps.isOutdoor, this.groundChanged);
        this.groundChanged = false;
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
}
