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
export const MAP_LAYER_COLLECTIONS: readonly string[] = [MAP_LAYER_FLOOR_COLLECTION, MAP_LAYER_WALL_COLLECTION];

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
export const FACADE_FACE_HEIGHT = 20;
export const FACADE_HEIGHT = WALL_THICKNESS + FACADE_FACE_HEIGHT;
/** A vertical wall piece spans the grid row between the joints drawn on its two vertices. */
export const VERTICAL_WALL_HEIGHT = MAP_LAYER_TILE_SIZE - WALL_THICKNESS;
/** A horizontal wall that stops on a vertex extends its face by this much to close the corner. */
export const FACADE_END_EXTENSION = WALL_HALF;

/** Which sides of a horizontal wall stop on a vertex ("mid" continues on both sides, "single" stops on both). */
export type FacadeEnds = "mid" | "left" | "right" | "single";

/** Sides of a vertex where a wall arrives, in this order. */
export const JOINT_ARMS = ["N", "E", "S", "W"] as const;
export type JointArm = (typeof JOINT_ARMS)[number];

const VERTICAL_WALL_PREFIX = "mur-vertical-";
const WALL_END_PREFIX = "bout-";
const JOINT_PREFIX = "raccord-";

export function mapLayerPrefabId(collectionName: string, name: string): string {
    return `${collectionName}:${name}:Default:Down`;
}

export function floorPrefabName(family: FloorFamily, variant: FloorVariant): string {
    return `sol-${family}-${variant}`;
}

export function facadePrefabName(tint: WallTint, ends: FacadeEnds): string {
    return `facade-${tint}-${ends}`;
}

/** Arms are given in N, E, S, W order, for example "NE" for a corner or "NESW" for a cross. */
export function jointPrefabName(arms: readonly JointArm[]): string {
    return `${JOINT_PREFIX}${JOINT_ARMS.filter((arm) => arms.includes(arm)).join("")}`;
}

export function verticalWallPrefabName(tint: WallTint): string {
    return `${VERTICAL_WALL_PREFIX}${tint}`;
}

/** The south face at the free bottom end of a vertical wall, like the face of a horizontal wall. */
export function wallEndPrefabName(tint: WallTint): string {
    return `${WALL_END_PREFIX}${tint}`;
}

export type MapLayerPiece =
    | { kind: "floor"; family: FloorFamily; variant: FloorVariant }
    | { kind: "facade"; tint: WallTint; ends: FacadeEnds }
    | { kind: "vertical"; tint: WallTint }
    | { kind: "end"; tint: WallTint }
    | { kind: "joint"; arms: JointArm[] };

const FLOOR_NAME = new RegExp(`^sol-(${MAP_LAYER_FLOOR_FAMILIES.join("|")})-(uni|ombre)$`);
const FACADE_NAME = new RegExp(`^facade-(${MAP_LAYER_WALL_TINTS.join("|")})-(mid|left|right|single)$`);
const VERTICAL_NAME = new RegExp(`^mur-vertical-(${MAP_LAYER_WALL_TINTS.join("|")})$`);
const END_NAME = new RegExp(`^bout-(${MAP_LAYER_WALL_TINTS.join("|")})$`);
const JOINT_NAME = /^raccord-(N?E?S?W?)$/;

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
            return { kind: "vertical", tint: vertical[1] as WallTint };
        }
        const end = END_NAME.exec(name);
        if (end) {
            return { kind: "end", tint: end[1] as WallTint };
        }
        const match = FACADE_NAME.exec(name);
        if (match) {
            return { kind: "facade", tint: match[1] as WallTint, ends: match[2] as FacadeEnds };
        }
        const joint = JOINT_NAME.exec(name);
        if (joint && joint[1].length > 0) {
            return { kind: "joint", arms: joint[1].split("") as JointArm[] };
        }
        return undefined;
    }
    return undefined;
}

export function isMapLayerPrefab(collectionName: string, prefabId: string): boolean {
    return parseMapLayerPrefab(collectionName, prefabId) !== undefined;
}

/** Size in pixels of the sprite of each piece, used to create entities without loading their image first. */
export function mapLayerPieceSize(piece: MapLayerPiece): { width: number; height: number } {
    switch (piece.kind) {
        case "vertical":
            return { width: WALL_THICKNESS, height: VERTICAL_WALL_HEIGHT };
        case "joint":
            return { width: WALL_THICKNESS, height: WALL_THICKNESS };
        case "end":
            return { width: WALL_THICKNESS, height: FACADE_FACE_HEIGHT };
        case "facade":
            return {
                width: MAP_LAYER_TILE_SIZE + facadeLeftExtension(piece.ends) + facadeRightExtension(piece.ends),
                height: FACADE_HEIGHT,
            };
        case "floor":
            return { width: MAP_LAYER_TILE_SIZE, height: MAP_LAYER_TILE_SIZE };
    }
}

export function facadeLeftExtension(ends: FacadeEnds): number {
    return ends === "left" || ends === "single" ? FACADE_END_EXTENSION : 0;
}

export function facadeRightExtension(ends: FacadeEnds): number {
    return ends === "right" || ends === "single" ? FACADE_END_EXTENSION : 0;
}
