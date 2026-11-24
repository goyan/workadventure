import type * as Phaser from "phaser";
import { metresOf, TERRAIN_CELL } from "@workadventure/map-editor";
import type { Hurricane } from "@workadventure/map-editor";
import { hash01 } from "../Autumn/LeafPalette";
import { HurricaneFlood } from "./HurricaneFlood";
import type { TerrainWater } from "./TerrainWater";

/** Over the ground, under the water of the relief (TerrainView: the ground at 0.65, its water at 0.66). */
const FLOOD_MARKS_DEPTH = 0.658;
/** The marks and the highest rise are read again this often (ms): the water changes a few times a second. */
const FLOOD_READ_MS = 1000;
/** The drowned ground: darker, a muddy green, and the colours of the wrack: foam and debris. */
const DROWNED_COLOR = 0x26301a;
const DROWNED_ALPHA = 0.4;
const FOAM_COLOR = 0xeeeee2;
const DEBRIS_COLOR = 0x5a4632;
/** Bits of wrack on a cell of the highest line, a couple of map pixels each. */
const WRACK_BITS = 5;

/**
 * The flood of a hurricane as this browser sees it (HurricaneFlood): the marks it leaves on the land it covered
 * (drowned ground, a wrack of foam and debris along the highest line), and the rise of the water it tells the panel
 * of the hurricane and the floors badge.
 */
export class HurricaneFloodView {
    private readonly flood = new HurricaneFlood();
    private readonly graphics: Phaser.GameObjects.Graphics;
    private hurricaneId: number | undefined;
    private readAt = -Infinity;

    public constructor(
        scene: Phaser.Scene,
        private readonly water: TerrainWater,
        /** Told the most the water has risen over a cell since the hurricane began (m); undefined when none. */
        private readonly tellHighest: (metres: number | undefined) => void,
    ) {
        this.graphics = scene.add.graphics().setDepth(FLOOD_MARKS_DEPTH);
    }

    /** The hurricane of the room as the server tells it: a new one starts the count from the water as it is now. */
    public setHurricane(hurricane: Hurricane | undefined, now: number): void {
        if (hurricane && hurricane.id !== this.hurricaneId) {
            this.hurricaneId = hurricane.id;
            this.flood.begin(this.water.settled());
            this.readAt = -Infinity;
        } else if (!hurricane && this.hurricaneId !== undefined) {
            this.hurricaneId = undefined;
            this.flood.end(now);
        }
    }

    /**
     * Each image: once a second, the water read and the marks drawn again. Not `shown` (Basique), the marks are not
     * drawn; the rise is still followed and told.
     */
    public update(now: number, shown: boolean): void {
        if (!shown && this.graphics.visible) {
            this.graphics.clear().setVisible(false);
            this.readAt = -Infinity;
        }
        if (now - this.readAt < FLOOD_READ_MS) return;
        this.readAt = now;
        if (!this.flood.following(now)) {
            if (this.graphics.visible) this.graphics.clear().setVisible(false);
            this.tellHighest(undefined);
            return;
        }
        this.flood.observe(this.water.settled(), now);
        this.tellHighest(metresOf(this.flood.highestRisePx()));
        if (shown) this.draw(now);
    }

    /** How much higher than before the hurricane the water stands at a point of the map (m); undefined if none. */
    public riseAt(x: number, y: number): number | undefined {
        const rise = this.flood.riseAt(
            Math.floor(x / TERRAIN_CELL),
            Math.floor(y / TERRAIN_CELL),
            this.water.settledDepthAt(x, y),
        );
        return rise === undefined ? undefined : metresOf(rise);
    }

    private draw(now: number): void {
        const marks = this.flood.marks(now);
        const graphics = this.graphics.clear().setVisible(marks.length > 0);
        for (const mark of marks) {
            const x = mark.cellX * TERRAIN_CELL;
            const y = mark.cellY * TERRAIN_CELL;
            graphics.fillStyle(DROWNED_COLOR, DROWNED_ALPHA * mark.strength);
            graphics.fillRect(x, y, TERRAIN_CELL, TERRAIN_CELL);
            if (mark.kind !== "wrack") continue;
            for (let bit = 0; bit < WRACK_BITS; bit++) {
                const foam = hash01(mark.cellX, mark.cellY, 501 + bit) < 0.55;
                graphics.fillStyle(foam ? FOAM_COLOR : DEBRIS_COLOR, 0.9 * mark.strength);
                const size = foam ? 2 : 1 + Math.round(hash01(mark.cellX, mark.cellY, 531 + bit) * 2);
                graphics.fillRect(
                    x + Math.floor(hash01(mark.cellX, mark.cellY, 511 + bit) * (TERRAIN_CELL - size)),
                    y + Math.floor(hash01(mark.cellX, mark.cellY, 521 + bit) * (TERRAIN_CELL - size)),
                    size,
                    size,
                );
            }
        }
    }

    public destroy(): void {
        this.graphics.destroy();
        this.tellHighest(undefined);
    }
}
