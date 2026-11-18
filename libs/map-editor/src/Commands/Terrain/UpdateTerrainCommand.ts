import type { ModifyTerrainMessage } from "@workadventure/messages";
import { MAX_STROKE_CELLS } from "../../Terrain/TerrainBrush";
import { cellKey, heightAt, withHeights } from "../../Terrain/TerrainGrid";
import { DEFAULT_MAX_DEPTH_TILES, MAX_DEPTH_TILES } from "../../types";
import type { WAMFileFormat } from "../../types";
import { Command } from "../Command";

/** The most cells one command may change: what one stroke of the brush changes at most. */
export const MAX_TERRAIN_COMMAND_CELLS = MAX_STROKE_CELLS;
/** No map is this many cells wide: a cell beyond it is refused, so a relief cannot be scattered without bound. */
const FARTHEST_CELL = 1_000_000;

/**
 * Sets the height of cells of the relief, and the maximum depth of the map when it is given. Heights and depth are
 * kept within their bounds; a command with too many cells or a cell far outside any map is refused whole.
 */
export class UpdateTerrainCommand extends Command {
    private before: ModifyTerrainMessage | undefined;

    constructor(
        protected wam: WAMFileFormat,
        protected modifyTerrainMessage: ModifyTerrainMessage,
        id?: string,
    ) {
        super(id);
    }

    public execute(): Promise<void> {
        const { cells, maxDepthTiles } = this.modifyTerrainMessage;
        if (cells.length > MAX_TERRAIN_COMMAND_CELLS) {
            return Promise.reject(new Error(`Too many cells in one relief command: ${cells.length}`));
        }
        const reachable = (value: number): boolean => Number.isInteger(value) && Math.abs(value) <= FARTHEST_CELL;
        if (cells.some((cell) => !reachable(cell.x) || !reachable(cell.y))) {
            return Promise.reject(new Error("A cell of the relief command is outside any map"));
        }
        const terrain = this.wam.terrain;
        this.before = {
            cells: cells.map((cell) => ({ x: cell.x, y: cell.y, height: heightAt(terrain, cell.x, cell.y) })),
            // A map that never set its maximum depth has the default one: undoing goes back to it.
            maxDepthTiles:
                maxDepthTiles === undefined ? undefined : (terrain?.maxDepthTiles ?? DEFAULT_MAX_DEPTH_TILES),
        };
        const next = withHeights(terrain, new Map(cells.map((cell) => [cellKey(cell.x, cell.y), cell.height])));
        if (maxDepthTiles !== undefined && Number.isFinite(maxDepthTiles)) {
            next.maxDepthTiles = Math.min(MAX_DEPTH_TILES, Math.max(1, Math.round(maxDepthTiles)));
        }
        this.wam.terrain = next;
        return Promise.resolve();
    }

    /** What this command changed, as it was before: sent as a command, it undoes this one. Known once executed. */
    public previous(): ModifyTerrainMessage {
        return this.before ?? { cells: [], maxDepthTiles: undefined };
    }
}
