import { FootprintLayer, TINTED_PRINTS } from "../Christmas/FootprintLayer";
import type { PrintStyle } from "../Christmas/FootprintLayer";
import { FootprintTrail, type WalkerSample } from "../Christmas/FootprintTrail";
import type { Cover } from "./Pixel/MaterialField";

/** The grounds that keep the print of a step. */
export type FootprintSurface = "snow" | "mud" | "sand";

/** The colour and the strength of a print in each ground: bluish in the snow (as it always was), dark in the mud. */
export const FOOTPRINT_TINTS: Record<FootprintSurface, { color: number; alpha: number }> = {
    snow: { color: 0xb4bedb, alpha: 0.5 },
    mud: { color: 0x2a1c14, alpha: 0.7 },
    sand: { color: 0xa98c58, alpha: 0.6 },
};

/** Fading prints only need a redraw now and then. */
const FADE_REDRAW_MS = 100;

/** Whether a ground keeps the print of a step: the snow, the mud and the sand; not the grass, nor a floor. */
export function footprintSurface(cover: Cover): FootprintSurface | undefined {
    return cover === "snow" || cover === "mud" || cover === "sand" ? cover : undefined;
}

/**
 * The footprints the players leave on the ground, all the year: in the snow, the mud and the sand, of the colour of
 * that ground, as low as it is drawn (a hollow seen in 3/4). Once the decor of the winter only.
 */
export class GroundFootprints {
    private readonly trail: FootprintTrail;
    private readonly layer: FootprintLayer;
    private lastFadeRedraw = Number.NEGATIVE_INFINITY;

    constructor(
        scene: Phaser.Scene,
        private readonly surfaceAt: (x: number, y: number) => FootprintSurface | undefined,
        private readonly dropAt: (x: number, y: number) => number,
        /** Whether a point is on the deck of a bridge: a wooden deck keeps no print. */
        private readonly onBridge: (x: number, y: number) => boolean = () => false,
    ) {
        this.trail = new FootprintTrail((x, y) => !this.onBridge(x, y) && this.surfaceAt(x, y) !== undefined);
        this.layer = new FootprintLayer(scene, TINTED_PRINTS);
    }

    /** Lays the prints of the walkers (none while the map is edited: an empty list) and fades the old ones. */
    public update(time: number, walkers: WalkerSample[]): boolean {
        let dirty = false;
        const marks = this.trail.update(walkers, time);
        if (marks.length > 0) {
            this.layer.add(marks, time, (x, y) => this.styleAt(x, y));
            dirty = true;
        }
        this.layer.update(time);
        if (this.layer.count > 0 && time - this.lastFadeRedraw >= FADE_REDRAW_MS) {
            this.lastFadeRedraw = time;
            dirty = true;
        }
        return dirty;
    }

    public setVisible(visible: boolean): void {
        this.layer.setVisible(visible);
    }

    public destroy(): void {
        this.layer.destroy();
    }

    private styleAt(x: number, y: number): PrintStyle {
        const tint = FOOTPRINT_TINTS[this.surfaceAt(x, y) ?? "snow"];
        return { tint: tint.color, alpha: tint.alpha, drop: this.dropAt(x, y) };
    }
}
