import type * as Phaser from "phaser";
import { floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import { railingDepthY, railingShapes } from "../MapEditor/MapLayer/FloorRailings";
import type { RailingEdge } from "../MapEditor/MapLayer/FloorRailings";

const GLASS = { color: 0x90d6f1, alpha: 0.35 };
const RAIL = { color: 0x2f3a48, alpha: 0.95 };

/**
 * The railings of the raised floors, drawn from their edges: nothing is placed on the map for them. One drawing per
 * floor and per line of the screen they are sorted at, so that a railing passes in front of whoever stands behind it
 * and behind whoever stands in front.
 */
export class FloorRailingsView {
    private drawings: { floor: string; graphics: Phaser.GameObjects.Graphics }[] = [];

    constructor(private readonly scene: Phaser.Scene) {}

    /**
     * Draws the railings again, in place of the ones drawn before. `floorOf` names the floor each one belongs to
     * (the storey of one building): they show through with it.
     */
    public draw(edges: readonly RailingEdge[], floorOf: (edge: RailingEdge) => string): void {
        this.clear();
        const groups = new Map<string, { floor: string; level: number; depthY: number; edges: RailingEdge[] }>();
        for (const edge of edges) {
            const depthY = railingDepthY(edge);
            const floor = floorOf(edge);
            const key = `${floor}|${depthY}`;
            let group = groups.get(key);
            if (!group) {
                group = { floor, level: edge.level, depthY, edges: [] };
                groups.set(key, group);
            }
            group.edges.push(edge);
        }
        for (const group of groups.values()) {
            const graphics = this.scene.add.graphics().setDepth(floorDepth(group.level, group.depthY));
            for (const edge of group.edges) {
                for (const shape of railingShapes(edge)) {
                    const style = shape.part === "glass" ? GLASS : RAIL;
                    graphics.fillStyle(style.color, style.alpha);
                    graphics.fillRect(shape.x, shape.y, shape.width, shape.height);
                }
            }
            this.drawings.push({ floor: group.floor, graphics });
        }
    }

    /** The railings of a floor show through with it. */
    public setAlpha(floor: string, alpha: number): void {
        for (const drawing of this.drawings) {
            if (drawing.floor === floor) drawing.graphics.setAlpha(alpha);
        }
    }

    public clear(): void {
        for (const drawing of this.drawings) drawing.graphics.destroy();
        this.drawings = [];
    }

    public destroy(): void {
        this.clear();
    }
}
