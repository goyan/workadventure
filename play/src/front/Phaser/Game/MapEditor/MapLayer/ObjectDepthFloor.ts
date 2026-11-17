import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";

export interface DepthBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WallDepthBox extends DepthBox {
    depth: number;
    /**
     * Bottom of the piece on the ground, when its image is drawn above it: the cap of a high wall (a joint, a vertical
     * strip, a lintel) is raised over the tiles north of the wall, yet the wall stands where its foot is.
     */
    footY?: number;
}

function footRow(box: DepthBox & { footY?: number }): number {
    return Math.floor(((box.footY ?? box.y + box.height) - 1) / MAP_LAYER_TILE_SIZE);
}

function overlaps(a: DepthBox, b: DepthBox): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Walls carry a positive depth offset so that they hide what stands behind them. An object that is sorted on its top
 * row (negative depth offset) would then also go behind a wall that crosses it, even when it stands on the tile in
 * front of that wall. An object whose foot is on a tile south of a wall it overlaps must stay in front of that wall;
 * an object standing on the wall tile or north of it keeps its natural depth, so that the wall is drawn over it.
 */
export function applyWallDepthFloor(naturalDepth: number, object: DepthBox, walls: Iterable<WallDepthBox>): number {
    const objectFootRow = footRow(object);
    let depth = naturalDepth;
    for (const wall of walls) {
        if (footRow(wall) < objectFootRow && overlaps(object, wall)) {
            depth = Math.max(depth, wall.depth + 0.5);
        }
    }
    return depth;
}

/** The south face of a wall piece, where something can hang: its image without its cap, with the depth of the piece. */
export interface WallFaceBox extends DepthBox {
    depth: number;
}

function contains(box: DepthBox, x: number, y: number): boolean {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/**
 * An object above the ground whose whole image lies on the south faces of walls hangs on them (a painting, a clock, a
 * shelf up a high wall): it is drawn over those walls. The caller only asks for objects given a level above the
 * ground and without a slab under them: on the ground, the same image stands behind the wall, hidden by it. Sorted by its foot, north of the foot of the wall, it would be hidden behind
 * them, where nobody places anything on purpose. An object that shows over the cap of the wall, or beside it, stands
 * behind the wall and keeps its depth.
 */
export function applyHungOnWallDepth(depth: number, object: DepthBox, faces: readonly WallFaceBox[]): number {
    const corners = [
        { x: object.x, y: object.y },
        { x: object.x + object.width, y: object.y },
        { x: object.x, y: object.y + object.height },
        { x: object.x + object.width, y: object.y + object.height },
    ];
    let hung = depth;
    for (const corner of corners) {
        const under = faces.filter((face) => contains(face, corner.x, corner.y));
        if (under.length === 0) return depth;
        hung = Math.max(hung, ...under.map((face) => face.depth + 0.5));
    }
    return hung;
}

export interface SupportDepthBox extends DepthBox {
    /** Depth actually applied to the support, possibly raised above its natural depth by a wall. */
    depth: number;
    /** Depth the support has from its own position and depth offset alone. */
    naturalDepth: number;
    /** Collision grid of the support, one cell per tile from its top-left corner (1 = solid). */
    collisionGrid?: number[][];
}

/**
 * An object whose foot stands on another object (a plant on a big table, books on a shelf) sits on it: it must be
 * drawn over it. Two cases tell that the object stands on it:
 * - its foot is on a solid cell of the support's collision grid, even when the support is sorted on a lower foot;
 * - its foot is inside the support's image and is naturally in front of the support. The support may have been raised
 *   above that natural depth (a shelf against a wall), which would otherwise hide the object behind it.
 */
export function applySupportDepthFloor(
    naturalDepth: number,
    object: DepthBox,
    supports: Iterable<SupportDepthBox>,
): number {
    const footX = object.x + object.width / 2;
    const footY = object.y + object.height - 1;
    let depth = naturalDepth;
    for (const support of supports) {
        const column = Math.floor((footX - support.x) / MAP_LAYER_TILE_SIZE);
        const row = Math.floor((footY - support.y) / MAP_LAYER_TILE_SIZE);
        const onSolidCell = support.collisionGrid?.[row]?.[column] === 1;
        const insideImage =
            footX >= support.x &&
            footX < support.x + support.width &&
            footY >= support.y &&
            footY < support.y + support.height;
        if (onSolidCell || (insideImage && naturalDepth > support.naturalDepth)) {
            depth = Math.max(depth, support.depth + 0.5);
        }
    }
    return depth;
}

export interface DepthStepRange {
    /** How many distinct stacking levels lie below the object among the images it overlaps. */
    down: number;
    /** How many distinct stacking levels lie above the object among the images it overlaps. */
    up: number;
}

function sortedLevels(baseDepth: number, overlappingDepths: Iterable<number>): { below: number[]; above: number[] } {
    const levels = [...new Set(overlappingDepths)];
    return {
        below: levels.filter((level) => level < baseDepth).sort((a, b) => b - a),
        above: levels.filter((level) => level > baseDepth).sort((a, b) => a - b),
    };
}

export function getDepthStepRange(baseDepth: number, overlappingDepths: Iterable<number>): DepthStepRange {
    const { below, above } = sortedLevels(baseDepth, overlappingDepths);
    return { down: below.length, up: above.length };
}

/**
 * Manual stacking: each step crosses one more of the depths of the images the object overlaps, so that a step of +1
 * draws it over the next image above it, +2 over the second one, and so on. A step beyond the last image stays on top
 * of it (or under it, for a negative step).
 */
export function applyDepthStep(baseDepth: number, step: number, overlappingDepths: Iterable<number>): number {
    if (step === 0) {
        return baseDepth;
    }
    const { below, above } = sortedLevels(baseDepth, overlappingDepths);
    if (step > 0) {
        const crossed = above[Math.min(step, above.length) - 1];
        return crossed === undefined ? baseDepth : crossed + 0.5;
    }
    const crossed = below[Math.min(-step, below.length) - 1];
    return crossed === undefined ? baseDepth : crossed - 0.5;
}
