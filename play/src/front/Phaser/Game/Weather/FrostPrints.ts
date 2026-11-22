import { FootprintLayer } from "@wa/front/Phaser/Game/Christmas/FootprintLayer";
import { FootprintTrail } from "@wa/front/Phaser/Game/Christmas/FootprintTrail";
import type { WalkerSample } from "@wa/front/Phaser/Game/Christmas/FootprintTrail";

/** The dark ground showing through the frost where a foot pressed it. */
export const FROST_PRINT_COLOR = "#5f6a63";
/** Fading prints only need a redraw now and then. */
const FADE_REDRAW_MS = 100;

/**
 * The footprints left on the frosted or snowy ground (Weather/Frost.ts, the snow of the meadow or of the player's own
 * city), for this player only: where `takes` says (outdoors, never on open water), and as strong as the frost or the
 * snow. In the colour of the ground through the frost, or of the default footprints in the snow.
 */
export class FrostPrints {
    private readonly layer: FootprintLayer;
    private readonly trail: FootprintTrail;
    private lastFadeRedraw = Number.NEGATIVE_INFINITY;
    private alpha = Number.NaN;

    /** `dropAt`: how much lower the ground at a point is drawn, the relief seen in 3/4: a print lies on it. */
    constructor(
        scene: Phaser.Scene,
        takes: (x: number, y: number) => boolean,
        color?: string,
        dropAt?: (x: number, y: number) => number,
    ) {
        this.layer = new FootprintLayer(scene, color, dropAt);
        this.trail = new FootprintTrail(takes);
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
