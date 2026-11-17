import type * as Phaser from "phaser";
import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import { FLOOR_PREVIEW_DEPTH } from "../MapEditor/MapLayer/FloorDepth";
import { stairScreenBox } from "../MapEditor/MapLayer/MapLayerFloors";
import type { StairLabel } from "./StairHints";

/**
 * Draws the label of the floor at the other end of a stair when the avatar is near one of its ends (StairHints).
 */
export class StairHintsView {
    private readonly labels = new Map<string, Phaser.GameObjects.Text>();

    constructor(private readonly scene: Phaser.Scene & { markDirty(): void }) {}

    public update(stairs: readonly PlacedStair[], labels: readonly StairLabel[]): void {
        this.drawLabels(labels, stairs);
    }

    public destroy(): void {
        for (const text of this.labels.values()) text.destroy();
        this.labels.clear();
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
