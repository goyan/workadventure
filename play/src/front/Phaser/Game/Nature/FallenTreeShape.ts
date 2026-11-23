import { treePixelPart } from "./SnowyTreeTexture";

/**
 * How much shorter a length along the ground looks up or down the screen than across it: the game is seen from above
 * at an angle (3/4), so a tree lying towards the player or away from them is seen foreshortened, one lying across the
 * screen at its length. The same for the image, its shadow and its leaves (lyingVector).
 */
export const LYING_DEPTH = 0.7;
/** A crown pressed on the ground spreads a little wider than it stood. */
const CROWN_SPREAD = 1.15;
/** How high the side of the half crown lying on the ground shows, against its width: flattened. */
const CROWN_THICKNESS = 0.08;
/**
 * The plate of roots and earth the tree tore up as it fell: against the width of its crown, and of its trunk. Uprooted,
 * not snapped: the gusts that lay a tree down (TREE_FALL_GUST_KMH, 130 km/h) uproot it in the Enhanced Fujita scale
 * (117 to 151 km/h), its trunk snapping only at 167 to 172 km/h (Texas Tech, 2006, appendix A, DI 27 and 28).
 */
const ROOT_PLATE_TRUNKS = 1.15;
/** The trunk goes on under its crown this far (pixels): no gap between them. */
const TRUNK_UNDER_CROWN = 6;
/** At least this much of the trunk shows (screen pixels) between the plate of roots and the crown. */
const TRUNK_SHOWN_PX = 9;
/** Rows of the root flare skipped above the foot when looking for where the crown starts. */
const ROOT_FLARE_ROWS = 4;

/** The way a tree falls, as a unit vector on the map (y down): north up, east right. */
export function fallVector(toward: number): { x: number; y: number } {
    const angle = ((Number.isFinite(toward) ? toward : 0) * Math.PI) / 180;
    return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/**
 * What a length along the ground the way `toward` is drawn as on the screen, per pixel of that length: its full length
 * across the screen, LYING_DEPTH of it up or down the screen.
 */
export function lyingVector(toward: number): { x: number; y: number } {
    const way = fallVector(toward);
    return { x: way.x, y: way.y * LYING_DEPTH };
}

/** The leaves of one row of the crown of a tree (pixels of its image), from its left to its right. */
export interface CrownRow {
    left: number;
    right: number;
}

/** A tree as its image shows it (pixels of the image): its foot, its trunk, its crown row by row. */
export interface TreeBody {
    footX: number;
    footY: number;
    trunkWidth: number;
    /** The highest row of the bare trunk, under the crown. */
    trunkTop: number;
    crownTop: number;
    crownBottom: number;
    crownLeft: number;
    crownRight: number;
    /** The crown row by row from crownTop to crownBottom (undefined where a row is empty). */
    crownRows: (CrownRow | undefined)[];
}

/**
 * Reads a tree in its image (`pixels` RGBA, `width` × `height`). Its foot is the lowest row of its wood, at the middle
 * of the trunk just above (not the bottom of the image, where the shadow painted under it lies); its bare trunk goes up
 * from there as long as a row is not much wider than the trunk; above it, its crown, whatever its colour (an autumn
 * crown is as brown as wood). The shadow painted on the ground is no part of it. An image with no wood: its foot at the
 * bottom middle, all of it crown.
 */
export function treeBodyOf(pixels: ArrayLike<number>, width: number, height: number): TreeBody {
    const solid: (CrownRow | undefined)[] = [];
    const wood: number[][] = [];
    let footRow = -1;
    for (let row = 0; row < height; row++) {
        let left = width;
        let right = -1;
        const woodColumns: number[] = [];
        for (let column = 0; column < width; column++) {
            const at = (row * width + column) * 4;
            const part = treePixelPart([pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]], row / height);
            if (part === "clear" || part === "shadow") continue;
            left = Math.min(left, column);
            right = Math.max(right, column);
            if (part === "wood") woodColumns.push(column);
        }
        solid.push(right >= 0 ? { left, right } : undefined);
        wood.push(woodColumns);
        if (woodColumns.length > 0) footRow = row;
    }
    let footX = width / 2;
    let footY = height;
    let trunkWidth = width / 8;
    let trunkTop = height;
    if (footRow >= 0) {
        // The foot and the trunk from the few rows above the lowest wood: the roots spread at the very bottom.
        const near = wood.slice(Math.max(0, footRow - 8), Math.max(0, footRow - 1)).filter((columns) => columns.length);
        const bottom = near.length ? near : [wood[footRow]];
        const all = bottom.flat();
        footX = all.reduce((sum, column) => sum + column, 0) / all.length + 0.5;
        footY = footRow + 1;
        trunkWidth = Math.max(2, bottom.reduce((sum, columns) => sum + columns.length, 0) / bottom.length);
        trunkTop = Math.max(0, footRow - ROOT_FLARE_ROWS);
        for (let row = trunkTop; row >= 0; row--) {
            const extent = solid[row];
            if (extent && extent.right - extent.left + 1 > trunkWidth * 2.5 + 2) break;
            trunkTop = row;
        }
    }
    let crownTop = -1;
    let crownBottom = -1;
    let crownLeft = width;
    let crownRight = -1;
    for (let row = 0; row < Math.min(trunkTop, height); row++) {
        const extent = solid[row];
        if (!extent) continue;
        if (crownTop < 0) crownTop = row;
        crownBottom = row;
        crownLeft = Math.min(crownLeft, extent.left);
        crownRight = Math.max(crownRight, extent.right);
    }
    if (crownTop < 0) {
        crownTop = 0;
        crownBottom = Math.max(0, Math.min(trunkTop, height) - 1);
        crownLeft = 0;
        crownRight = width - 1;
    }
    return {
        footX,
        footY,
        trunkWidth,
        trunkTop,
        crownTop,
        crownBottom,
        crownLeft,
        crownRight,
        crownRows: solid.slice(crownTop, crownBottom + 1),
    };
}

/** A point on the screen, pixels from the foot of the tree. */
export interface Point {
    x: number;
    y: number;
}

/** A tree lying on the ground as it is drawn, in screen pixels from its foot. */
export interface LyingLayout {
    /** The tip of the tree on the ground: where its top lies. */
    tip: Point;
    /** Its trunk from its foot to under its crown. */
    trunkEnd: Point;
    trunkWidth: number;
    /**
     * The outline of its crown on the ground: the half of its own outline turned to the sky, laid the way it fell, a
     * little wider (lyingLayout).
     */
    outline: Point[];
    /** The middle of its crown on the ground. */
    centre: Point;
    /** How high the side of the crown shows above the ground. */
    thickness: number;
    /** The plate of roots standing up at the foot: its centre and its half-sizes on the screen. */
    plate: { x: number; y: number; width: number; height: number };
    /** The hole it left, on the ground at its foot, on the side away from the tree. */
    pit: { x: number; y: number; width: number; height: number };
    /** True when the tree lies up the screen: its crown is drawn first, then its trunk and its roots over it. */
    crownFirst: boolean;
}

/** How a tree (`body`, its image) lies the way `toward` (degrees, 0 north): one geometry for all that draws it. */
export function lyingLayout(body: TreeBody, toward: number): LyingLayout {
    const way = fallVector(toward);
    const along = lyingVector(toward);
    // Across the tree on the ground, on the screen: shortened as any length up or down the screen.
    const across = { x: -way.y, y: way.x * LYING_DEPTH };
    const at = (length: number, side: number): Point => ({
        x: along.x * length + across.x * side,
        y: along.y * length + across.y * side,
    });
    // Only the half of the crown turned to the sky shows, the other half pressed into the ground: cut along the trunk.
    // Across the screen (east, west), that is the half above the trunk, a half tree; up or down the screen, the half
    // turned to the sky spans the whole width (seen from above), only flattened.
    const sky = across.y <= 0 ? 1 : -1;
    const near = 1 - Math.abs(way.x);
    const crownWidth = Math.max(1, body.crownRight - body.crownLeft + 1);
    const thickness = Math.max(2, crownWidth * CROWN_THICKNESS);
    const plateSize = body.trunkWidth * ROOT_PLATE_TRUNKS;
    // Seen face on when the tree lies up or down the screen, edge on when it lies across it.
    const facing = Math.abs(way.y);
    const plateWidth = plateSize * (0.4 + 0.6 * facing);
    const plateHeight = plateSize * (0.8 + 0.2 * facing);
    // A bit of the trunk always shows between the plate (in front of it, a tree lying up the screen) or the raised
    // side of the crown (a tree lying down the screen) and the crown: the crown lies that much farther if need be.
    const speed = Math.max(1e-6, Math.hypot(along.x, along.y));
    const covered =
        TRUNK_SHOWN_PX + (way.y < 0 ? 2 * plateHeight * -way.y : thickness * way.y) + plateWidth * Math.abs(way.x);
    const bare = Math.max(0, body.footY - body.crownBottom);
    const farther = Math.max(0, covered / speed - bare);
    const height = Math.max(1, body.footY - body.crownTop) + farther;
    const left: Point[] = [];
    const right: Point[] = [];
    let middle = { x: 0, y: 0, count: 0 };
    body.crownRows.forEach((row, index) => {
        if (!row) return;
        const length = body.footY - (body.crownTop + index) - 0.5 + farther;
        const centre = (row.left + row.right + 1) / 2 - body.footX;
        const half = ((row.right - row.left + 1) / 2) * CROWN_SPREAD;
        left.push(at(length, centre + sky * half));
        right.push(at(length, centre - sky * half * near));
        const point = at(length, centre);
        middle = { x: middle.x + point.x, y: middle.y + point.y, count: middle.count + 1 };
    });
    return {
        tip: at(height, 0),
        trunkEnd: at(bare + farther + TRUNK_UNDER_CROWN, 0),
        trunkWidth: body.trunkWidth,
        outline: [...left, ...right.reverse()],
        centre: middle.count ? { x: middle.x / middle.count, y: middle.y / middle.count } : at(height / 2, 0),
        thickness,
        plate: { x: -along.x * 2, y: -plateHeight * 0.5 - along.y * 2, width: plateWidth, height: plateHeight },
        // The hole on the side away from the tree, a little aside: it shows next to the plate.
        pit: {
            x: -along.x * plateSize * 1.2 + across.x * plateSize * 0.5,
            y: -along.y * plateSize * 1.2 + across.y * plateSize * 0.5,
            width: plateSize * 1.1,
            height: plateSize * 0.5,
        },
        crownFirst: way.y < -1e-6,
    };
}
