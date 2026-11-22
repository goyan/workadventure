import type { Point } from "../Lamps/RgbLampGeometry";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { boundedTo } from "../Night/SkyLight";
import type { Range } from "../Night/SkyLight";
import type { ShadowPicture } from "./SkyShadowPicture";

export type { Point };

const DEG = Math.PI / 180;

/** The longest shadow the sky casts by default, in map pixels: 4 tiles, whatever the height and however low the light. */
export const SHADOW_MAX_LENGTH = 4 * MAP_LAYER_TILE_SIZE;
/** The crown of a tree throws a disc this many points round. */
const CROWN_POINTS = 16;
/** A low light stretches the shadow of a crown along its way, up to this much. */
const CROWN_MAX_STRETCH = 2;

/** Where the light of the sky comes from, in degrees: azimuth from the north, clockwise, and elevation. */
export interface ShadowLight {
    azimuth: number;
    elevation: number;
    /** The shortest and the longest shadow, in map pixels (SkyLight.shadowLength); 0 to SHADOW_MAX_LENGTH without. */
    shadowLength?: Range;
}

/**
 * What stands up and throws a shadow on the ground: its footprint (map pixels, on the ground, where the collision of a
 * wall or an object is) and how high it rises above it (map pixels: 32 a tile).
 */
export interface ShadowBox {
    x: number;
    y: number;
    width: number;
    height: number;
    rise: number;
}

/** A tree: the foot of its trunk, the radius of its crown and the height of the centre of its crown (map pixels). */
export interface ShadowTree {
    x: number;
    y: number;
    crownRadius: number;
    crownHeight: number;
    trunkWidth: number;
    /** The id of the object of the map, for a tree that sways in the wind. */
    id?: string;
    /** How far its top stands to the right, bent by the wind (map pixels): its shadow bends with it. */
    bend?: number;
}

/** Something whose shadow is its own picture laid on the ground: its foot (bottom middle) and its size as shown. */
export interface ShadowPictureCaster {
    x: number;
    y: number;
    width: number;
    height: number;
    picture: ShadowPicture;
    /** The id of the object of the map, for a tree that sways in the wind. */
    id?: string;
}

/**
 * A raised slab, or slabs of one floor joined: a plate over its footprint on the ground (map pixels), its top `rise`
 * above the ground and `thickness` thick. The light passes under it: its shadow leaves its footprint.
 */
export interface ShadowPlate extends ShadowBox {
    thickness: number;
}

/**
 * A stair or a ramp of the raised floors: a slope from its edge at its foot (`base` above the ground: the floor it
 * starts from) to its edge at its top (`top`), both given on the ground (map pixels). A full stair is solid under its
 * steps: its `footprint` stands on the floor it starts from.
 */
export interface ShadowSlope {
    low: readonly [Point, Point];
    base: number;
    high: readonly [Point, Point];
    top: number;
    footprint?: { x: number; y: number; width: number; height: number };
}

export interface ShadowCasters {
    boxes: readonly ShadowBox[];
    trees: readonly ShadowTree[];
    /** The slabs of the raised floors (the deck of a bridge, a terrace, a storey). */
    plates?: readonly ShadowPlate[];
    /** The stairs and the ramps of the raised floors. */
    slopes?: readonly ShadowSlope[];
    /** The low things of the nature catalogue (rocks, grass, flowers, stumps): a small crown without a trunk. */
    details?: readonly ShadowTree[];
    /** The trees set to a realistic shadow: not polygons, their picture laid away from the light (fallenShadowPose). */
    pictures?: readonly ShadowPictureCaster[];
}

/**
 * The way the shadows go on the map (north up, y down), as a unit vector: away from the light, as the shadows of the
 * clouds do (cloudShadowOffset).
 */
export function shadowDirection(azimuth: number): Point {
    return { x: -Math.sin(azimuth * DEG), y: Math.cos(azimuth * DEG) };
}

/**
 * Where the shadow of a point `height` map pixels above the ground falls, from the foot of that point: away from the
 * light, `height / tan(elevation)` long, kept within the length limits of the light (a minimum above the maximum gives
 * the maximum). Undefined with the light at or under the horizon.
 */
export function shadowOffset(height: number, light: ShadowLight): Point | undefined {
    if (light.elevation <= 0) return undefined;
    const limits = light.shadowLength ?? { min: 0, max: SHADOW_MAX_LENGTH };
    const length = boundedTo(height / Math.tan(light.elevation * DEG), limits);
    const direction = shadowDirection(light.azimuth);
    return { x: direction.x * length, y: direction.y * length };
}

/** The convex hull of points (monotone chain), counter-clockwise on the screen, without its collinear points. */
function convexHull(points: readonly Point[]): Point[] {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;
    const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: Point[] = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
        lower.push(point);
    }
    const upper: Point[] = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The shadow of a box: its footprint swept along the light to where its top falls. */
function boxShadow(box: ShadowBox, offset: Point): Point[] {
    const corners = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width, y: box.y + box.height },
    ];
    return convexHull([...corners, ...corners.map((corner) => ({ x: corner.x + offset.x, y: corner.y + offset.y }))]);
}

/**
 * Where the shadow of a point `height` above the ground falls from its foot, as shadowOffset; a point on the ground
 * (0 or less) throws it at its foot, whatever the shortest shadow of the light.
 */
function liftedOffset(height: number, light: ShadowLight): Point | undefined {
    return height <= 0 ? { x: 0, y: 0 } : shadowOffset(height, light);
}

const moved = (points: readonly Point[], offset: Point): Point[] =>
    points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));

const cornersOf = (box: { x: number; y: number; width: number; height: number }): Point[] => [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
];

/** The shadow of a plate: its footprint swept along the light from where its underside falls to where its top falls. */
function plateShadow(plate: ShadowPlate, light: ShadowLight): Point[] | undefined {
    const top = liftedOffset(plate.rise, light);
    const under = liftedOffset(plate.rise - plate.thickness, light);
    if (!top || !under) return undefined;
    const corners = cornersOf(plate);
    return convexHull([...moved(corners, under), ...moved(corners, top)]);
}

/**
 * The shadow of a slope: from where its edge at its foot falls to where its edge at its top falls; a full stair's
 * covers its footprint too.
 */
function slopeShadow(slope: ShadowSlope, light: ShadowLight): Point[] | undefined {
    const low = liftedOffset(slope.base, light);
    const high = liftedOffset(slope.top, light);
    if (!low || !high) return undefined;
    const points = [...moved(slope.low, low), ...moved(slope.high, high)];
    if (slope.footprint) points.push(...moved(cornersOf(slope.footprint), low));
    return convexHull(points);
}

/**
 * The shadow of a tree: its trunk, a band from its foot to where the centre of its crown falls, and its crown, a disc
 * around that point stretched along the light (a sphere seen slanting), twice as long at most.
 */
function treeShadow(tree: ShadowTree, light: ShadowLight): Point[][] {
    const offset = shadowOffset(tree.crownHeight, light);
    if (!offset) return [];
    const direction = shadowDirection(light.azimuth);
    const across = { x: -direction.y, y: direction.x };
    const stretch = Math.min(CROWN_MAX_STRETCH, 1 / Math.sin(light.elevation * DEG));
    // A top bent to the right by the wind throws its shadow as far to the right.
    const centre = { x: tree.x + offset.x + (tree.bend ?? 0), y: tree.y + offset.y };
    const crown: Point[] = [];
    for (let step = 0; step < CROWN_POINTS; step++) {
        const angle = (step / CROWN_POINTS) * 2 * Math.PI;
        const along = Math.cos(angle) * tree.crownRadius * stretch;
        const side = Math.sin(angle) * tree.crownRadius;
        crown.push({
            x: centre.x + direction.x * along + across.x * side,
            y: centre.y + direction.y * along + across.y * side,
        });
    }
    const half = tree.trunkWidth / 2;
    const trunk = [
        { x: tree.x + across.x * half, y: tree.y + across.y * half },
        { x: centre.x + across.x * half, y: centre.y + across.y * half },
        { x: centre.x - across.x * half, y: centre.y - across.y * half },
        { x: tree.x - across.x * half, y: tree.y - across.y * half },
    ];
    if (tree.trunkWidth > 0) return [trunk, crown];
    // Without a trunk (a rock, a tuft of grass): one shape from under it to where its top falls, never a disc left
    // alone further away. Under it: a flat round base, half a radius above its foot.
    const base: Point[] = [];
    for (let step = 0; step < CROWN_POINTS; step++) {
        const angle = (step / CROWN_POINTS) * 2 * Math.PI;
        base.push({
            x: tree.x + Math.cos(angle) * tree.crownRadius,
            y: tree.y - tree.crownRadius / 2 + (Math.sin(angle) * tree.crownRadius) / 2,
        });
    }
    return [convexHull([...base, ...crown])];
}

/**
 * The shadows the sky casts on the ground, as polygons in map pixels, to be filled all with the same colour (they may
 * overlap). None with the light at or under the horizon. The shadows of the raised floors fall on the ground under
 * them: drawn under the floors (SkyShadowLayer), never on their own top.
 */
export function shadowPolygons(casters: ShadowCasters, light: ShadowLight): Point[][] {
    if (light.elevation <= 0) return [];
    const polygons: Point[][] = [];
    for (const box of casters.boxes) {
        const offset = shadowOffset(box.rise, light);
        if (offset) polygons.push(boxShadow(box, offset));
    }
    for (const tree of casters.trees) polygons.push(...treeShadow(tree, light));
    for (const detail of casters.details ?? []) polygons.push(...treeShadow(detail, light));
    for (const plate of casters.plates ?? []) {
        const shadow = plateShadow(plate, light);
        if (shadow) polygons.push(shadow);
    }
    for (const slope of casters.slopes ?? []) {
        const shadow = slopeShadow(slope, light);
        if (shadow) polygons.push(shadow);
    }
    return polygons;
}

/**
 * The boxes with the pieces of one wall joined: boxes of the same rise side by side on one line (same top and height,
 * touching left to right; or same left and width, touching top to bottom) make one. Fewer polygons, and no seam
 * between two pieces.
 */
export function mergeShadowBoxes(boxes: readonly ShadowBox[]): ShadowBox[] {
    const byRow = new Map<string, ShadowBox[]>();
    for (const box of boxes) {
        const key = `${box.y},${box.height},${box.rise}`;
        const row = byRow.get(key);
        if (row) row.push(box);
        else byRow.set(key, [box]);
    }
    const rows: ShadowBox[] = [];
    for (const row of byRow.values()) {
        row.sort((a, b) => a.x - b.x);
        let current: ShadowBox | undefined;
        for (const box of row) {
            if (current && box.x <= current.x + current.width) {
                current.width = Math.max(current.width, box.x + box.width - current.x);
            } else {
                current = { ...box };
                rows.push(current);
            }
        }
    }
    const byColumn = new Map<string, ShadowBox[]>();
    for (const box of rows) {
        const key = `${box.x},${box.width},${box.rise}`;
        const column = byColumn.get(key);
        if (column) column.push(box);
        else byColumn.set(key, [box]);
    }
    const merged: ShadowBox[] = [];
    for (const column of byColumn.values()) {
        column.sort((a, b) => a.y - b.y);
        let current: ShadowBox | undefined;
        for (const box of column) {
            if (current && box.y <= current.y + current.height) {
                current.height = Math.max(current.height, box.y + box.height - current.y);
            } else {
                current = { ...box };
                merged.push(current);
            }
        }
    }
    return merged;
}
