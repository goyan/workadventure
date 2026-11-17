import type * as Phaser from "phaser";
import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import { FLOOR_PREVIEW_DEPTH, floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import { stairScreenBox } from "../MapEditor/MapLayer/MapLayerFloors";
import type { StairLabel } from "./StairHints";

/** One cycle of the chevrons along a stair, and how many steps it is drawn in (the scene is redrawn at each step). */
const CHEVRON_CYCLE_MS = 1400;
const CHEVRON_STEPS = 14;
const CHEVRONS = 3;
const CHEVRON_ALPHA = 0.75;
const CHEVRON_HALF = 4;

/**
 * Draws over each stair three white chevrons that move the way it goes up (still when motion is reduced), and the label
 * of the floor at its other end when the avatar is near (StairHints).
 */
export class StairHintsView {
    private readonly chevrons: Phaser.GameObjects.Graphics[] = [];
    private readonly labels = new Map<string, Phaser.GameObjects.Text>();
    private elapsed = 0;
    private shownStep = -1;
    private signature = "";

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly reducedMotion: boolean,
    ) {}

    /**
     * `veil`: depth of the veil over the floors under the avatar; the chevrons of a stair coming from under it are drawn
     * over it. `hidden`: the map editor is open, nothing is drawn.
     */
    public update(
        stairs: readonly PlacedStair[],
        labels: readonly StairLabel[],
        veil: number | undefined,
        lowestCurrent: number,
        hidden: boolean,
        delta: number,
        /** Whether a stair shows: one standing on a floor hidden above the avatar has no chevron. */
        shown: (stair: PlacedStair) => boolean = () => true,
    ): void {
        this.elapsed = (this.elapsed + delta) % CHEVRON_CYCLE_MS;
        const step = this.reducedMotion ? 0 : Math.floor((this.elapsed / CHEVRON_CYCLE_MS) * CHEVRON_STEPS);
        const visible = hidden ? [] : stairs.filter(shown);
        const signature = `${veil}|${lowestCurrent}|${visible.map((s) => `${s.foot.x},${s.foot.y},${s.base}`).join(";")}`;
        // Without a chevron to move, nothing is redrawn at each step.
        if ((step !== this.shownStep && visible.length > 0) || signature !== this.signature) {
            this.shownStep = step;
            this.signature = signature;
            this.drawChevrons(visible, veil, lowestCurrent, step / CHEVRON_STEPS);
        }
        this.drawLabels(hidden ? [] : labels, stairs);
    }

    public destroy(): void {
        for (const graphics of this.chevrons) graphics.destroy();
        for (const text of this.labels.values()) text.destroy();
        this.chevrons.length = 0;
        this.labels.clear();
    }

    private drawChevrons(
        stairs: readonly PlacedStair[],
        veil: number | undefined,
        lowestCurrent: number,
        phase: number,
    ): void {
        while (this.chevrons.length < stairs.length) this.chevrons.push(this.scene.add.graphics());
        while (this.chevrons.length > stairs.length) this.chevrons.pop()?.destroy();
        stairs.forEach((stair, index) => {
            const graphics = this.chevrons[index];
            graphics.clear();
            const own = floorDepth(stair.base, stair.ground.y + stair.ground.height) + 0.01;
            graphics.setDepth(veil !== undefined && stair.base < lowestCurrent ? Math.max(own, veil + 1.5) : own);
            const box = stairScreenBox(stair.shape, stair.foot);
            const top = box.y - stair.base;
            graphics.fillStyle(0xffffff, CHEVRON_ALPHA);
            for (let i = 0; i < CHEVRONS; i++) {
                // Along the stair from its foot (0) to its top (1), the way it goes up.
                const along = ((i + phase) / CHEVRONS) * 0.8 + 0.1;
                const centre = { x: box.x + box.width / 2, y: top + box.height / 2 };
                switch (stair.shape.direction) {
                    case "n": {
                        const y = top + box.height * (1 - along);
                        this.chevron(graphics, centre.x, y, 0, -1);
                        break;
                    }
                    case "s": {
                        const y = top + box.height * along;
                        this.chevron(graphics, centre.x, y, 0, 1);
                        break;
                    }
                    case "e":
                        this.chevron(graphics, box.x + box.width * along, centre.y, 1, 0);
                        break;
                    case "o":
                        this.chevron(graphics, box.x + box.width * (1 - along), centre.y, -1, 0);
                        break;
                }
            }
        });
        this.scene.markDirty();
    }

    /** A small arrow head at (x, y) pointing along (dx, dy). */
    private chevron(graphics: Phaser.GameObjects.Graphics, x: number, y: number, dx: number, dy: number): void {
        const h = CHEVRON_HALF;
        const tip = { x: x + dx * h, y: y + dy * h };
        const left = { x: x - dx * h + dy * h, y: y - dy * h - dx * h };
        const right = { x: x - dx * h - dy * h, y: y - dy * h + dx * h };
        graphics.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    }

    private drawLabels(labels: readonly StairLabel[], stairs: readonly PlacedStair[]): void {
        const wanted = new Set<string>();
        for (const label of labels) {
            const stair = stairs[label.stair];
            if (!stair) continue;
            const key = `${label.stair}:${label.at}:${label.text}`;
            wanted.add(key);
            if (this.labels.has(key)) continue;
            const box = stairScreenBox(stair.shape, stair.foot);
            const top = box.y - stair.base;
            const goingUp = label.at === "top";
            const point = labelPoint(stair, box, top, goingUp);
            const text = this.scene.add
                .text(point.x, point.y, label.text, {
                    fontSize: "10px",
                    color: "#ffffff",
                    backgroundColor: "#1b1d24",
                    padding: { x: 4, y: 2 },
                })
                .setOrigin(0.5, 1)
                .setResolution(2)
                .setDepth(FLOOR_PREVIEW_DEPTH - 1);
            this.labels.set(key, text);
            this.scene.markDirty();
        }
        for (const [key, text] of this.labels) {
            if (wanted.has(key)) continue;
            text.destroy();
            this.labels.delete(key);
            this.scene.markDirty();
        }
    }
}

/** Where the label stands on the screen: just above the end of the stair it names. */
function labelPoint(
    stair: PlacedStair,
    box: { x: number; width: number; height: number },
    top: number,
    atTop: boolean,
): { x: number; y: number } {
    const middleX = box.x + box.width / 2;
    switch (stair.shape.direction) {
        case "n":
            return { x: middleX, y: atTop ? top - 2 : top + box.height - 2 };
        case "s":
            return { x: middleX, y: atTop ? top + box.height - 2 : top - 2 };
        case "e":
            return { x: atTop ? box.x + box.width : box.x, y: atTop ? top - 2 : top + stair.shape.rise - 2 };
        case "o":
            return { x: atTop ? box.x : box.x + box.width, y: atTop ? top - 2 : top + stair.shape.rise - 2 };
    }
}
