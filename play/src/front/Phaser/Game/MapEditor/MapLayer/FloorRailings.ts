import { TileBarriers } from "../../../../Utils/TileBarriers";
import type { FloorModel } from "./FloorModel";
import { FACADE_FACE_HEIGHT, MAP_LAYER_TILE_SIZE, wallRise } from "./MapLayerCatalog";
import type { WallHeight } from "./MapLayerCatalog";
import { stairEnds } from "./FloorPath";
import type { TilePoint } from "./MapLayerFloors";

/** A side of a tile: north, east, south or west ("o", as for the stairs). */
export type RailingSide = "n" | "e" | "s" | "o";

/** A side of a slab that gives on the void: a railing stands along it. */
export interface RailingEdge {
    /** Altitude of the floor the slab belongs to. */
    level: number;
    /** The tile the slab covers, on the ground. */
    x: number;
    y: number;
    side: RailingSide;
}

const SIDES: { side: RailingSide; dx: number; dy: number }[] = [
    { side: "n", dx: 0, dy: -1 },
    { side: "e", dx: 1, dy: 0 },
    { side: "s", dx: 0, dy: 1 },
    { side: "o", dx: -1, dy: 0 },
];

const keyOf = (level: number, x: number, y: number, side: RailingSide): string => `${level}:${x}:${y}:${side}`;

/**
 * Where the raised floors of a map have a railing: every side of a slab that has no slab of the same floor next to
 * it, but the ones a stair goes through (where it arrives on the floor, and where it leaves it) and the ones a wall
 * closes (`closed`: a wall of that floor, or a wall from under it that is at least as high). It is where the walk
 * stops the avatar (see `floorStep`): a railing is drawn where one cannot pass, and only there.
 */
export function floorRailings(
    model: FloorModel,
    closed: (level: number, from: TilePoint, to: TilePoint) => boolean = () => false,
): RailingEdge[] {
    // The sides a stair goes through, on the floor it starts from and on the one it goes up to.
    const open = new Set<string>();
    for (const stair of model.getStairs()) {
        const { direction, width } = stair.shape;
        const ends = stairEnds(stair);
        const upright = direction === "n" || direction === "s";
        // Seen from the tile at the head of the stair, the stair is on the side it came from.
        const headSide: RailingSide = direction === "n" ? "s" : direction === "s" ? "n" : direction === "e" ? "o" : "e";
        for (let lane = 0; lane < width; lane++) {
            const dx = upright ? lane : 0;
            const dy = upright ? 0 : lane;
            open.add(keyOf(stair.top, ends.top.x + dx, ends.top.y + dy, headSide));
            open.add(keyOf(stair.base, ends.bottom.x + dx, ends.bottom.y + dy, direction));
        }
    }

    const edges: RailingEdge[] = [];
    for (const slab of model.getSlabs()) {
        for (const { side, dx, dy } of SIDES) {
            const next = { x: slab.x + dx, y: slab.y + dy };
            if (model.hasSlab(slab.elevation, next.x, next.y)) continue;
            if (open.has(keyOf(slab.elevation, slab.x, slab.y, side))) continue;
            if (closed(slab.elevation, { x: slab.x, y: slab.y }, next)) continue;
            edges.push({ level: slab.elevation, x: slab.x, y: slab.y, side });
        }
    }
    return edges;
}

/** How high a railing stands above its floor, in pixels. */
export const RAILING_HEIGHT = 12;

/** A rectangle to fill for a railing, in map pixels, where it is drawn (its altitude further north). */
export interface RailingShape {
    x: number;
    y: number;
    width: number;
    height: number;
    part: "glass" | "rail";
}

/**
 * What a railing looks like: a pane of glass under a dark handrail, with a dark foot. Along a north or south side it
 * faces the player; along an east or west side it is seen from its end, a thin dark line with a sliver of glass.
 */
export function railingShapes(edge: RailingEdge): RailingShape[] {
    const left = edge.x * MAP_LAYER_TILE_SIZE;
    const top = edge.y * MAP_LAYER_TILE_SIZE - edge.level;
    const size = MAP_LAYER_TILE_SIZE;
    if (edge.side === "n" || edge.side === "s") {
        const foot = edge.side === "n" ? top : top + size;
        return [
            { x: left, y: foot - RAILING_HEIGHT, width: size, height: RAILING_HEIGHT, part: "glass" },
            { x: left, y: foot - RAILING_HEIGHT - 1, width: size, height: 2, part: "rail" },
            { x: left, y: foot - 1, width: size, height: 1, part: "rail" },
        ];
    }
    const x = edge.side === "o" ? left : left + size - 2;
    return [
        { x: edge.side === "o" ? x + 2 : x - 1, y: top - RAILING_HEIGHT, width: 1, height: size, part: "glass" },
        { x, y: top - RAILING_HEIGHT, width: 2, height: size + RAILING_HEIGHT, part: "rail" },
    ];
}

/**
 * Where a railing is sorted among what stands on its floor, as a point of the screen (see `floorDepth`): a railing
 * along the north side of a tile is behind whoever stands on the tile, the three others are in front.
 */
export function railingDepthY(edge: RailingEdge): number {
    const top = edge.y * MAP_LAYER_TILE_SIZE - edge.level;
    return edge.side === "n" ? top - 0.5 : top + MAP_LAYER_TILE_SIZE + 0.5;
}

/** A wall as the railings read it: where it stands, how high, and the floor it stands on. */
export interface RailingWall {
    orientation: "h" | "v";
    x: number;
    y: number;
    height: WallHeight;
    /** Altitude of the floor the wall stands on (0: the ground). */
    base: number;
}

/**
 * The sides of a floor a wall closes, so that no railing is drawn along it: a wall standing on that floor, or a wall
 * from a lower floor that rises above it (a mezzanine against the high wall of its room). A wall whose top is level
 * with the floor does not close it: the floor ends there like a terrace, with a railing.
 */
export function railingClosers(
    walls: Iterable<RailingWall>,
): (level: number, from: TilePoint, to: TilePoint) => boolean {
    const byLevel = new Map<number, TileBarriers>();
    const all = [...walls];
    return (level, from, to) => {
        let barriers = byLevel.get(level);
        if (!barriers) {
            barriers = new TileBarriers();
            for (const wall of all) {
                const top = wall.base + FACADE_FACE_HEIGHT + wallRise(wall.height);
                if (wall.base !== level && !(wall.base < level && top > level)) continue;
                // As the walls of the map layer stop the avatars (see wallBarriers).
                if (wall.orientation === "h") barriers.addSouthBorder(wall.x, wall.y);
                else barriers.addWestBorder(wall.x, wall.y + 1);
            }
            byLevel.set(level, barriers);
        }
        return barriers.blocksMove(from, to);
    };
}
