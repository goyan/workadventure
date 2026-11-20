import { FootprintLayer } from "@wa/front/Phaser/Game/Christmas/FootprintLayer";
import { FootprintTrail } from "@wa/front/Phaser/Game/Christmas/FootprintTrail";
import type { WalkerSample } from "@wa/front/Phaser/Game/Christmas/FootprintTrail";

/** The dark ground showing through the frost where a foot pressed it. */
const FROST_PRINT_COLOR = "#5f6a63";
/** Fading prints only need a redraw now and then. */
const FADE_REDRAW_MS = 100;

/**
 * The footprints left on the frosted ground (Weather/Frost.ts), for this player only: outdoors, never on water, and as
 * strong as the frost. In the snow the snow decor leaves its own.
 */
export class FrostPrints {
    private readonly layer: FootprintLayer;
    private readonly trail: FootprintTrail;
    private lastFadeRedraw = Number.NEGATIVE_INFINITY;
    private alpha = Number.NaN;

    constructor(
        scene: Phaser.Scene,
        isOutdoor: (x: number, y: number) => boolean,
        isWet: (x: number, y: number) => boolean,
    ) {
        this.layer = new FootprintLayer(scene, FROST_PRINT_COLOR);
        this.trail = new FootprintTrail((x, y) => isOutdoor(x, y) && !isWet(x, y));
    }

    /** Whether the scene must be drawn again. */
    update(time: number, walkers: WalkerSample[], frost: number): boolean {
        let dirty = false;
        if (frost !== this.alpha) {
            this.alpha = frost;
            this.layer.setAlpha(frost);
            dirty = true;
        }
        const marks = this.trail.update(walkers, time);
        if (marks.length > 0) {
            this.layer.add(marks, time);
            dirty = true;
        }
        this.layer.update(time);
        if (this.layer.count > 0 && time - this.lastFadeRedraw >= FADE_REDRAW_MS) {
            this.lastFadeRedraw = time;
            dirty = true;
        }
        return dirty;
    }

    setVisible(visible: boolean): void {
        this.layer.setVisible(visible);
    }

    destroy(): void {
        this.layer.destroy();
    }
}
