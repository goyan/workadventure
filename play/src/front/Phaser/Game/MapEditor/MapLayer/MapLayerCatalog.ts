/**
 * Vocabulary of the "map layer": floors and walls of a room, as opposed to the objects of the Entity editor.
 *
 * Floors and walls are stored as ordinary WAM entities (no change to the WAM schema or to map-storage). Their
 * meaning is carried by the prefab identifier, which is a contract with the private catalogs published by the
 * infrastructure repository: never rename an identifier once a catalog has been published.
 */

export const MAP_LAYER_TILE_SIZE = 32;

/**
 * Depth of the floors: just above the ground tiles of the map (depth 0), under everything that is sorted by its y
 * (objects, walls, characters, companions), whatever the row they stand on.
 */
export const MAP_LAYER_FLOOR_DEPTH = 0.5;

export const MAP_LAYER_FLOOR_COLLECTION = "Carte Sols";
export const MAP_LAYER_WALL_COLLECTION = "Carte Murs";
export const MAP_LAYER_DOOR_COLLECTION = "Carte Portes";
/** Windows: a facade whose face has a see-through glass, on one segment of a horizontal wall. */
export const MAP_LAYER_WINDOW_COLLECTION = "Carte Fenêtres";
/**
 * Collection of the raised floors (slabs and stairs, see MapLayerFloors): drawn by the "Map" tool like the floors and
 * the walls.
 */
export const MAP_LAYER_FLOOR_SLAB_COLLECTION = "Carte Paliers";

/** Collections whose pieces are walls for the light, the outdoors and the pathfinder: a window is a wall with a glass. */
export const MAP_LAYER_WALL_LIKE_COLLECTIONS: readonly string[] = [
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
];
/**
 * The walls, doors and windows standing on a raised floor are the same pieces in collections of their own, named with
 * this suffix (`Carte Murs Paliers`...): everything that reads the walls of the ground (the light, the outdoors, the
 * paths, the doors) does not see them, without having to know about the floors. See MapLayerLevels.
 */
export const MAP_LAYER_UPPER_SUFFIX = " Paliers";
export const MAP_LAYER_UPPER_COLLECTIONS: readonly string[] = MAP_LAYER_WALL_LIKE_COLLECTIONS.map(
    (name) => name + MAP_LAYER_UPPER_SUFFIX,
);
/**
 * Whether a collection is one of the raised floors: their slabs and stairs, or the walls standing on them. Their
 * pieces are drawn north of where they stand: what looks at the place of an object on the ground leaves them out.
 */
export function isRaisedFloorCollection(collectionName: string): boolean {
    return collectionName === MAP_LAYER_FLOOR_SLAB_COLLECTION || MAP_LAYER_UPPER_COLLECTIONS.includes(collectionName);
}

export const MAP_LAYER_COLLECTIONS: readonly string[] = [
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
    MAP_LAYER_FLOOR_SLAB_COLLECTION,
    ...MAP_LAYER_UPPER_COLLECTIONS,
];

export const MAP_LAYER_FLOOR_FAMILIES = [
    "carrelage-gris",
    "parquet-clair",
    "moquette-grise",
    "moquette-olive",
    "pierre-grise",
    "pierre-olive",
    "moquette-mauve",
    "pierre-mauve",
] as const;
export type FloorFamily = (typeof MAP_LAYER_FLOOR_FAMILIES)[number];

export const MAP_LAYER_WALL_TINTS = ["blanc", "lavande", "gris", "brique"] as const;
export type WallTint = (typeof MAP_LAYER_WALL_TINTS)[number];

/**
 * A floor family is one seamless tile. A cell that comes right after a horizontal wall (the wall stands on the
 * previous tile row) uses the "ombre" variant, shaded at the top, under the wall (the catalogs draw the first rows of the sprite darker).
 */
export type FloorVariant = "uni" | "ombre";

/**
 * Geometry of the walls, in pixels. Walls are seen from the south, like the Room Builder pack draws them:
 * - every wall has a top surface (the "cap"), a band WALL_THICKNESS thick. A horizontal wall of the grid line y stands
 *   entirely on the tile row y, its cap on the top of the row; the caps of the vertical walls and the joints follow it;
 * - a horizontal wall also shows its south face under the cap, FACADE_FACE_HEIGHT high;
 * - a vertical wall only shows its top, a strip.
 * The caps of all walls form one network: the joint pieces drawn on each vertex close its corners.
 */
export const WALL_THICKNESS = 12;
export const WALL_HALF = WALL_THICKNESS / 2;
/**
 * How far the collision of a wall reaches on each side of its line, as the catalogs declare it (18 px for a vertical
 * wall, a bit more than its 12 px to keep the head of the avatar clear of it).
 */
export const WALL_COLLISION_HALF = 9;
/** Height of the collision of a horizontal wall, at the bottom of its facade (its foot), as the catalogs declare it. */
export const WALL_FOOTPRINT = 6;
export const FACADE_FACE_HEIGHT = 20;
export const FACADE_HEIGHT = WALL_THICKNESS + FACADE_FACE_HEIGHT;
/** A vertical wall piece spans the grid row between the joints drawn on its two vertices. */
export const VERTICAL_WALL_HEIGHT = MAP_LAYER_TILE_SIZE - WALL_THICKNESS;
/** A horizontal wall that stops on a vertex extends its face by this much to close the corner. */
export const FACADE_END_EXTENSION = WALL_HALF;

/**
 * Height of a wall, in tiles. A wall of height N is the wall of height 1 raised by `wallRise(N)`: its cap is drawn that
 * much higher and its face is that much longer, its foot (and so its collision) stays where it is. The height is told by
 * the name of the pieces (`-h2`, `-h3`, `-h4`); the pieces of height 1 keep their names without a suffix.
 */
export const MAP_LAYER_WALL_HEIGHTS = [1, 2, 3, 4] as const;
export type WallHeight = (typeof MAP_LAYER_WALL_HEIGHTS)[number];

/** How much higher the cap of a wall of this height is drawn than the cap of a wall of height 1. */
export function wallRise(height: WallHeight): number {
    return MAP_LAYER_TILE_SIZE * (height - 1);
}

/** Height of the south face of a horizontal wall of this height. */
export function facadeFaceHeight(height: WallHeight): number {
    return FACADE_FACE_HEIGHT + wallRise(height);
}

function heightSuffix(height: WallHeight): string {
    return height === 1 ? "" : `-h${height}`;
}

/** Which sides of a horizontal wall stop on a vertex ("mid" continues on both sides, "single" stops on both). */
export type FacadeEnds = "mid" | "left" | "right" | "single";

/** Sides of a vertex where a wall arrives, in this order. */
export const JOINT_ARMS = ["N", "E", "S", "W"] as const;
export type JointArm = (typeof JOINT_ARMS)[number];

/**
 * Doors replace two consecutive wall segments, centered on the vertex between them, and are drawn in two pieces:
 * - horizontal door (seen from the south, like a facade): the "g" piece (32 x 32, a facade row: cap and face, left
 *   leaf) on the first segment and the "d" piece (its mirror) on the second one;
 * - vertical door (seen from above): the "haut" and "bas" pieces, 64 x 32, centered on the line of the wall, the leaf
 *   swinging to the west; "haut" starts under the joint of the first vertex, "bas" is its vertical mirror under it.
 * The prefab with no frame number is the closed door, the one that is stored in the map. Frames 0 (open) to the one
 * before the last are only used by the animation, that plays them from the open door to the closed one, and back.
 * Two sets of frames exist, because the door is pushed away from the character: `-<n>` swings it towards the north
 * (horizontal door) or the west (vertical door), `-b<n>` towards the south or the east.
 */
export const DOOR_FRAME_COUNT = 8;
export const DOOR_CLOSED_FRAME = DOOR_FRAME_COUNT - 1;
/**
 * The frames of the horizontal doors keep this many rows of margin above (and under) the 32 rows of the door, so that a
 * leaf swinging up or down stays whole: the animation aligns the row after the margin on the top of the door.
 */
export const DOOR_FRAME_MARGIN = 14;
export const DOOR_VERTICAL_WIDTH = 2 * MAP_LAYER_TILE_SIZE;
export const DOOR_SIDES = { h: ["g", "d"], v: ["haut", "bas"] } as const;
export type DoorSide = "g" | "d" | "haut" | "bas";

const VERTICAL_WALL_PREFIX = "mur-vertical-";
const WALL_END_PREFIX = "bout-";
const JOINT_PREFIX = "raccord-";
const LINTEL_PREFIX = "linteau-";

export function mapLayerPrefabId(collectionName: string, name: string): string {
    return `${collectionName}:${name}:Default:Down`;
}

export function floorPrefabName(family: FloorFamily, variant: FloorVariant): string {
    return `sol-${family}-${variant}`;
}

export function facadePrefabName(tint: WallTint, ends: FacadeEnds, height: WallHeight = 1): string {
    return `facade-${tint}-${ends}${heightSuffix(height)}`;
}

/** Arms are given in N, E, S, W order, for example "NE" for a corner or "NESW" for a cross. */
export function jointPrefabName(arms: readonly JointArm[], height: WallHeight = 1): string {
    return `${JOINT_PREFIX}${JOINT_ARMS.filter((arm) => arms.includes(arm)).join("")}${heightSuffix(height)}`;
}

export function verticalWallPrefabName(tint: WallTint, height: WallHeight = 1): string {
    return `${VERTICAL_WALL_PREFIX}${tint}${heightSuffix(height)}`;
}

/** The south face at the free bottom end of a vertical wall, like the face of a horizontal wall. */
export function wallEndPrefabName(tint: WallTint, height: WallHeight = 1): string {
    return `${WALL_END_PREFIX}${tint}${heightSuffix(height)}`;
}

/** A window replaces the facade of one segment of a horizontal wall, with the same ends. */
export function windowPrefabName(tint: WallTint, ends: FacadeEnds, height: WallHeight = 1): string {
    return `fenetre-${tint}-${ends}${heightSuffix(height)}`;
}

/**
 * The full wall above a door or a window lower than its wall: the cap of the wall of height `wall` and the part of its
 * face above the opening of height `opening`. It covers the cap of the door or the window under it.
 */
export function lintelPrefabName(tint: WallTint, ends: FacadeEnds, wall: WallHeight, opening: WallHeight): string {
    if (wall <= opening) {
        throw new Error(`A lintel needs a wall higher than its opening (wall ${wall}, opening ${opening})`);
    }
    return `${LINTEL_PREFIX}${tint}-${ends}-h${wall}-o${opening}`;
}

/**
 * Name of a piece of a door; without `frame`, the closed door. A glazed door (horizontal only) has `-vitree` after its
 * side; then comes the suffix of the height, then the one of the frame (`porte-h-gris-g-vitree-h2-b3`).
 * A horizontal door has its own height; a vertical door has the height of its wall (it is raised with its cap, to stay
 * seen from above).
 */
export function doorPrefabName(
    orientation: "h" | "v",
    tint: WallTint,
    side: DoorSide,
    frame?: number,
    pushedTowardsViewer = false,
    height: WallHeight = 1,
    glazed = false,
): string {
    const glazing = glazed && orientation === "h" ? "-vitree" : "";
    const base = `porte-${orientation}-${tint}-${side}${glazing}${heightSuffix(height)}`;
    if (frame === undefined || frame === DOOR_CLOSED_FRAME) {
        return base;
    }
    return `${base}-${pushedTowardsViewer ? "b" : ""}${frame}`;
}

/**
 * What a placed prefab means. `height` is the height of the wall the piece belongs to (a door or a window: its own
 * height, at most the one of its wall); a lintel also tells the height of the opening under it.
 */
export type MapLayerPiece =
    | { kind: "floor"; family: FloorFamily; variant: FloorVariant }
    | { kind: "facade"; tint: WallTint; ends: FacadeEnds; height: WallHeight }
    | { kind: "window"; tint: WallTint; ends: FacadeEnds; height: WallHeight }
    | { kind: "vertical"; tint: WallTint; height: WallHeight }
    | { kind: "end"; tint: WallTint; height: WallHeight }
    | { kind: "joint"; arms: JointArm[]; height: WallHeight }
    | { kind: "lintel"; tint: WallTint; ends: FacadeEnds; height: WallHeight; opening: WallHeight }
    | {
          kind: "door";
          orientation: "h" | "v";
          tint: WallTint;
          side: DoorSide;
          frame: number;
          reverse: boolean;
          height: WallHeight;
          glazed: boolean;
      };

const TINTS = MAP_LAYER_WALL_TINTS.join("|");
/** The optional height suffix: `-h1` is not a name, a wall of height 1 has no suffix. */
const HEIGHT = "(?:-h([2-4]))?";
const FLOOR_NAME = new RegExp(`^sol-(${MAP_LAYER_FLOOR_FAMILIES.join("|")})-(uni|ombre)$`);
const FACADE_NAME = new RegExp(`^facade-(${TINTS})-(mid|left|right|single)${HEIGHT}$`);
const WINDOW_NAME = new RegExp(`^fenetre-(${TINTS})-(mid|left|right|single)${HEIGHT}$`);
const VERTICAL_NAME = new RegExp(`^mur-vertical-(${TINTS})${HEIGHT}$`);
const END_NAME = new RegExp(`^bout-(${TINTS})${HEIGHT}$`);
const LINTEL_NAME = new RegExp(`^linteau-(${TINTS})-(mid|left|right|single)-h([2-4])-o([1-3])$`);
const DOOR_NAME = new RegExp(`^porte-(h|v)-(${TINTS})-(g|d|haut|bas)(-vitree)?${HEIGHT}(?:-(b)?(\\d))?$`);
const JOINT_NAME = new RegExp(`^raccord-(N?E?S?W?)${HEIGHT}$`);

/** The height told by the suffix of a name (the regular expressions only let 2 to 4 through). */
function readHeight(suffix: string | undefined): WallHeight {
    return MAP_LAYER_WALL_HEIGHTS.find((height) => String(height) === suffix) ?? 1;
}

/** Reads the meaning of a placed prefab. Returns undefined for anything that is not part of the map layer. */
export function parseMapLayerPrefab(collectionName: string, prefabId: string): MapLayerPiece | undefined {
    const prefix = `${collectionName}:`;
    const suffix = ":Default:Down";
    if (!prefabId.startsWith(prefix) || !prefabId.endsWith(suffix)) {
        return undefined;
    }
    const name = prefabId.slice(prefix.length, prefabId.length - suffix.length);

    if (collectionName === MAP_LAYER_FLOOR_COLLECTION) {
        const match = FLOOR_NAME.exec(name);
        return match
            ? { kind: "floor", family: match[1] as FloorFamily, variant: match[2] as FloorVariant }
            : undefined;
    }
    if (collectionName === MAP_LAYER_WALL_COLLECTION) {
        const vertical = VERTICAL_NAME.exec(name);
        if (vertical) {
            return { kind: "vertical", tint: vertical[1] as WallTint, height: readHeight(vertical[2]) };
        }
        const end = END_NAME.exec(name);
        if (end) {
            return { kind: "end", tint: end[1] as WallTint, height: readHeight(end[2]) };
        }
        const match = FACADE_NAME.exec(name);
        if (match) {
            return {
                kind: "facade",
                tint: match[1] as WallTint,
                ends: match[2] as FacadeEnds,
                height: readHeight(match[3]),
            };
        }
        const joint = JOINT_NAME.exec(name);
        if (joint && joint[1].length > 0) {
            return { kind: "joint", arms: joint[1].split("") as JointArm[], height: readHeight(joint[2]) };
        }
        const lintel = LINTEL_NAME.exec(name);
        if (lintel) {
            const height = readHeight(lintel[3]);
            const opening = readHeight(lintel[4]);
            return opening < height
                ? { kind: "lintel", tint: lintel[1] as WallTint, ends: lintel[2] as FacadeEnds, height, opening }
                : undefined;
        }
        return undefined;
    }
    if (collectionName === MAP_LAYER_WINDOW_COLLECTION) {
        const match = WINDOW_NAME.exec(name);
        return match
            ? { kind: "window", tint: match[1] as WallTint, ends: match[2] as FacadeEnds, height: readHeight(match[3]) }
            : undefined;
    }
    if (collectionName === MAP_LAYER_DOOR_COLLECTION) {
        const door = DOOR_NAME.exec(name);
        if (!door) {
            return undefined;
        }
        const frame = door[7] === undefined ? DOOR_CLOSED_FRAME : Number(door[7]);
        if (door[7] !== undefined && frame >= DOOR_CLOSED_FRAME) {
            return undefined;
        }
        const orientation = door[1] as "h" | "v";
        const glazed = door[4] !== undefined;
        // Seen from above, a vertical door is a line: it has no glazed variant.
        if (glazed && orientation === "v") {
            return undefined;
        }
        const side = door[3] as DoorSide;
        if ((DOOR_SIDES[orientation] as readonly string[]).includes(side) === false) {
            return undefined;
        }
        return {
            kind: "door",
            orientation,
            tint: door[2] as WallTint,
            side,
            frame,
            reverse: door[6] === "b",
            height: readHeight(door[5]),
            glazed,
        };
    }
    return undefined;
}

/**
 * Whether a placed prefab belongs to the "Map" tool: a floor, a wall, a door, a window, or a piece of the raised
 * floors. The other tools leave those alone.
 */
export function isMapLayerPrefab(collectionName: string, prefabId: string): boolean {
    return (
        collectionName === MAP_LAYER_FLOOR_SLAB_COLLECTION ||
        MAP_LAYER_UPPER_COLLECTIONS.includes(collectionName) ||
        parseMapLayerPrefab(collectionName, prefabId) !== undefined
    );
}

/**
 * The piece of height 1 a piece stands in for on the ground (its foot does not move with the height): a high wall,
 * door or window is its piece of height 1, `wallRise(height)` lower; a lintel stands where the facade of height 1
 * under its wall would. The other pieces are their own.
 */
export function groundPieceOf(piece: MapLayerPiece): MapLayerPiece {
    if (piece.kind === "floor") return piece;
    if (piece.kind === "lintel") return { kind: "facade", tint: piece.tint, ends: piece.ends, height: 1 };
    return { ...piece, height: 1 };
}

/**
 * Bottom, on the ground, of a piece whose sprite has its top at `y`: the bottom of the piece of height 1 it stands in for
 * (`groundPieceOf`). For a piece of height 1 it is the bottom of its sprite; the raised pieces of a high wall (joints,
 * vertical strips, lintels) have theirs lower than their sprite.
 */
export function mapLayerGroundBottom(piece: MapLayerPiece, y: number): number {
    const ground = mapLayerGroundRect(piece, 0, y);
    return ground.y + ground.height;
}

/**
 * Rectangle on the ground of a piece whose sprite has its top-left corner at (x, y): the one of the piece of height 1
 * it stands in for (`groundPieceOf`), `wallRise(height)` lower than the sprite.
 */
export function mapLayerGroundRect(
    piece: MapLayerPiece,
    x: number,
    y: number,
): { x: number; y: number; width: number; height: number } {
    const rise = piece.kind === "floor" ? 0 : wallRise(piece.height);
    return { x, y: y + rise, ...mapLayerPieceSize(groundPieceOf(piece)) };
}

/** Size in pixels of the sprite of each piece, used to create entities without loading their image first. */
export function mapLayerPieceSize(piece: MapLayerPiece): { width: number; height: number } {
    switch (piece.kind) {
        case "vertical":
            return { width: WALL_THICKNESS, height: VERTICAL_WALL_HEIGHT };
        case "joint":
            return { width: WALL_THICKNESS, height: WALL_THICKNESS };
        case "end":
            return { width: WALL_THICKNESS, height: facadeFaceHeight(piece.height) };
        case "facade":
        case "window":
            return {
                width: MAP_LAYER_TILE_SIZE + facadeLeftExtension(piece.ends) + facadeRightExtension(piece.ends),
                height: FACADE_HEIGHT + wallRise(piece.height),
            };
        case "lintel":
            return {
                width: MAP_LAYER_TILE_SIZE + facadeLeftExtension(piece.ends) + facadeRightExtension(piece.ends),
                height: lintelHeight(piece.height, piece.opening),
            };
        case "floor":
            return { width: MAP_LAYER_TILE_SIZE, height: MAP_LAYER_TILE_SIZE };
        case "door":
            return {
                width: piece.orientation === "h" ? MAP_LAYER_TILE_SIZE : DOOR_VERTICAL_WIDTH,
                height: MAP_LAYER_TILE_SIZE + (piece.orientation === "h" ? wallRise(piece.height) : 0),
            };
    }
}

/** Height of a lintel: the cap and the part of the face of the wall that is above the opening. */
export function lintelHeight(wall: WallHeight, opening: WallHeight): number {
    return WALL_THICKNESS + MAP_LAYER_TILE_SIZE * (wall - opening);
}

export function facadeLeftExtension(ends: FacadeEnds): number {
    return ends === "left" || ends === "single" ? FACADE_END_EXTENSION : 0;
}

export function facadeRightExtension(ends: FacadeEnds): number {
    return ends === "right" || ends === "single" ? FACADE_END_EXTENSION : 0;
}
