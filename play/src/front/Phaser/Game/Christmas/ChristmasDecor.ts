import type { SeasonalDecor, SeasonalDecorDeps } from "../Seasonal/SeasonalDecor";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { FootprintLayer } from "./FootprintLayer";
import { FootprintTrail, type WalkerSample } from "./FootprintTrail";
import { SnowCaps, type SnowEntity } from "./SnowCaps";

/** Fading footprints only need a redraw now and then. */
const FADE_REDRAW_MS = 100;

/**
 * Winter outdoors (the theme once called Christmas): snow on top of objects and footprints. The snow on the ground is
 * drawn by the terrain (ReliefTiles), in the season of the theme.
 */
export class ChristmasDecor implements SeasonalDecor {
    private readonly caps: SnowCaps;
    private readonly prints: FootprintLayer;
    private readonly trail: FootprintTrail;
    private lastFadeRedraw = -Infinity;

    constructor(scene: Phaser.Scene, deps: SeasonalDecorDeps) {
        this.caps = new SnowCaps(scene, deps.readPixels);
        this.prints = new FootprintLayer(scene);
        this.trail = new FootprintTrail(deps.isOutdoor);
    }

    redrawGround(_grid: OutdoorGrid): void {
        // The snowy ground is the terrain's (ReliefTiles).
    }

    rebuildObjects(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void {
        this.caps.rebuild(entities, grid);
    }

    update(time: number, walkers: WalkerSample[]): boolean {
        let dirty = false;
        // An empty list (editing) forgets where everyone was, so that leaving the editor draws no line.
        const marks = this.trail.update(walkers, time);
        if (marks.length > 0) {
            this.prints.add(marks, time);
            dirty = true;
        }
        this.prints.update(time);
        if (this.prints.count > 0 && time - this.lastFadeRedraw >= FADE_REDRAW_MS) {
            this.lastFadeRedraw = time;
            dirty = true;
        }
        return dirty;
    }

    setVisible(visible: boolean): void {
        this.caps.setVisible(visible);
        this.prints.setVisible(visible);
    }

    setAlpha(alpha: number): void {
        this.caps.setAlpha(alpha);
        this.prints.setAlpha(alpha);
    }

    destroy(): void {
        this.caps.destroy();
        this.prints.destroy();
    }
}
