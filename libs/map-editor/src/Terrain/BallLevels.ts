import { BALL_LEVEL_REACH_CELLS, BALL_LEVEL_SLACK_PX } from "../Catastrophe/Ball";
import { TERRAIN_CELL } from "../types";
import type { TerrainData } from "../types";
import { heightAt } from "./TerrainGrid";
import type { WaterView } from "./WaterView";

/**
 * The level each ball of a room is held at, and where it was when that was decided: a ball keeps its level while it
 * is held still, whatever the wave it makes; once it moved, it takes the level of the water it came onto when that is
 * not the one it had (BALL_LEVEL_SLACK_PX). See WaterSimulation.ballLevelAt.
 */
export class BallLevels {
    private readonly levels = new Map<number, { level: number; x: number; y: number }>();

    /**
     * The altitude of the centre of the ball `id` held at a point of the map (pixels): the level of the water it
     * stands in there (read over the water around the ball, not under it: WaterView.restLevelAt), or the ground of
     * the relief where there is no water.
     */
    public levelAt(
        id: number,
        x: number,
        y: number,
        water: Pick<WaterView, "restLevelAt"> | undefined,
        terrain: () => TerrainData | undefined,
    ): number {
        const known = this.levels.get(id);
        if (known && known.x === x && known.y === y) return known.level;
        const cellX = Math.floor(x / TERRAIN_CELL);
        const cellY = Math.floor(y / TERRAIN_CELL);
        const rest =
            Number.isFinite(x) && Number.isFinite(y)
                ? water?.restLevelAt(cellX, cellY, BALL_LEVEL_REACH_CELLS)
                : undefined;
        // Off the grid of the water there is only ground: that of the relief.
        const there = rest ?? (Number.isFinite(x) && Number.isFinite(y) ? heightAt(terrain(), cellX, cellY) : 0);
        const level = known && Math.abs(there - known.level) <= BALL_LEVEL_SLACK_PX ? known.level : there;
        this.levels.set(id, { level, x, y });
        return level;
    }

    /** The balls that still stand: the level of one that is gone is forgotten. */
    public keep(ids: readonly number[]): void {
        for (const id of this.levels.keys()) {
            if (!ids.includes(id)) this.levels.delete(id);
        }
    }

    public clear(): void {
        if (this.levels.size > 0) this.levels.clear();
    }
}
