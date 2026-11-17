import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import { stairEnds } from "../MapEditor/MapLayer/FloorPath";
import type { FloorWalkState } from "../MapEditor/MapLayer/FloorWalk";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import type { TilePoint } from "../MapEditor/MapLayer/MapLayerFloors";

/** How close, in tiles, the avatar is to an end of a stair for the label of its other end to show. */
export const STAIR_LABEL_REACH = 2;

export interface StairLabel {
    stair: number;
    /** The end of the stair the label stands at: the other end from the avatar. */
    at: "foot" | "top";
    text: string;
}

/** The tiles where the walk enters or leaves a stair at one end, across its width. */
function endTiles(stair: PlacedStair, end: TilePoint): TilePoint[] {
    const box = stair.ground;
    const first = { x: box.x / MAP_LAYER_TILE_SIZE, y: box.y / MAP_LAYER_TILE_SIZE };
    const across = stair.shape.width;
    const vertical = stair.shape.direction === "n" || stair.shape.direction === "s";
    return Array.from({ length: across }, (_, lane) =>
        vertical ? { x: first.x + lane, y: end.y } : { x: end.x, y: first.y + lane },
    );
}

function near(tile: TilePoint, tiles: readonly TilePoint[]): boolean {
    return tiles.some((end) => Math.max(Math.abs(end.x - tile.x), Math.abs(end.y - tile.y)) <= STAIR_LABEL_REACH);
}

/**
 * The labels to show for the stairs near the avatar: standing on a floor, at most STAIR_LABEL_REACH tiles from an end of
 * a stair that leaves it, the name of the floor at the other end with an arrow ("Niveau 2 ↑", "Sol ↓"). None on a stair.
 */
export function stairLabels(
    stairs: readonly PlacedStair[],
    avatarTile: TilePoint,
    state: FloorWalkState,
    levelName: (elevation: number) => string,
): StairLabel[] {
    if (state.stair !== undefined) return [];
    const labels: StairLabel[] = [];
    stairs.forEach((stair, index) => {
        const ends = stairEnds(stair);
        if (stair.base === state.elevation && near(avatarTile, endTiles(stair, ends.bottom))) {
            labels.push({ stair: index, at: "top", text: `${levelName(stair.top)} ↑` });
        } else if (stair.top === state.elevation && near(avatarTile, endTiles(stair, ends.top))) {
            labels.push({ stair: index, at: "foot", text: `${levelName(stair.base)} ↓` });
        }
    });
    return labels;
}
