import { isTreePrefab } from "@workadventure/map-editor";
import { BREEZE_KMH, keepsLeavesInAutumn } from "../Nature/TreeLeafFall";

/**
 * Where the leaves of autumn lie on the ground: under the trees that lose them, thickest at the foot, thinning out
 * with the distance, and carried downwind. Nothing far from every tree: an open lawn, a beach or the sea stays bare.
 * Pure: the same trees, wind and date give the same leaves on every computer.
 */

/** A tree that drops its leaves: the middle of the bottom of its image (its foot), and the width of its image. */
export interface LeafTree {
    x: number;
    y: number;
    width: number;
}

/** The wind as the leaves on the ground follow it: rounded, so that the real wind does not move them every minute. */
export interface LeafWind {
    /** Where the wind goes, as a unit vector of the map (y down). */
    toX: number;
    toY: number;
    /** 0 (calm) to 4 (storm). */
    level: number;
}

/** What the leaves on the ground are made of. */
export interface LeafSources {
    trees: readonly LeafTree[];
    wind: LeafWind;
    /** How far into autumn it is, 0 to 1. */
    progress: number;
}

/** The density is read at the middle of squares of this size: at most one leaf each. */
export const LEAF_DENSITY_CELL_PX = 16;
/** A walker kicks leaves up from this density on. */
export const LEAF_KICK_MIN_DENSITY = 0.1;
/** An object gets a pile of leaves at its foot from this density on. */
export const LEAF_PILE_MIN_DENSITY = 0.15;

/** 16 directions of the wind. */
const WIND_SECTORS = 16;
/** The wind (km/h) from which each level starts: 1 a breeze, 4 a storm. */
const WIND_LEVELS_KMH = [5, 15, 30, 50] as const;
/** How far from its foot a tree drops leaves in a calm, at the end of autumn (half that at its start). */
const REACH_PX = 72;
/** A wide tree drops them over three quarters of its width at least. */
const REACH_PER_WIDTH = 0.75;
/** Each level of wind stretches the leaves this much further downwind (a storm: four times as far)... */
const DOWNWIND_PER_LEVEL = 0.75;
/** ...and brings them this much closer upwind. */
const UPWIND_PER_LEVEL = 0.12;
/** The thickest the leaves lie, at the foot of a tree at the end of autumn: the share of the cells holding a leaf. */
const PEAK_DENSITY = 0.9;
/** At the start of autumn a fourth of that already lies there. */
const EARLY_SHARE = 0.25;
const DEG = Math.PI / 180;

/** The wind of the map, rounded to 16 directions and 5 strengths; without a real wind, the breeze from the north-west. */
export function quantizeWind(speedKmh: number | undefined, from: number | undefined): LeafWind {
    const speed = speedKmh !== undefined && Number.isFinite(speedKmh) ? speedKmh : BREEZE_KMH;
    const level = WIND_LEVELS_KMH.filter((threshold) => speed >= threshold).length;
    const degrees = from !== undefined && Number.isFinite(from) ? from : 315;
    const sector = ((Math.round(degrees / (360 / WIND_SECTORS)) % WIND_SECTORS) + WIND_SECTORS) % WIND_SECTORS;
    const angle = sector * (360 / WIND_SECTORS) * DEG;
    // Where the wind goes, as the leaves falling from the trees: away from where it comes from.
    return { toX: -Math.sin(angle), toY: Math.cos(angle), level };
}

/** Changes when the rounded wind does. */
export function leafWindKey(wind: LeafWind): string {
    return `${Math.round(Math.atan2(wind.toY, wind.toX) / DEG)}:${wind.level}`;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

interface Spread {
    peak: number;
    downwind: number;
    upwind: number;
    side: number;
}

function spreadOf(tree: LeafTree, wind: LeafWind, progress: number): Spread {
    const season = clamp01(progress);
    const reach = Math.max(REACH_PX, tree.width * REACH_PER_WIDTH) * (0.5 + 0.5 * season);
    return {
        peak: PEAK_DENSITY * (EARLY_SHARE + (1 - EARLY_SHARE) * season),
        downwind: reach * (1 + DOWNWIND_PER_LEVEL * wind.level),
        upwind: reach * (1 - UPWIND_PER_LEVEL * wind.level),
        side: reach,
    };
}

/** What one tree drops at a point: an oval around its foot, longer downwind, thinning out to its edge. */
function treeDensity(dx: number, dy: number, spread: Spread, wind: LeafWind): number {
    const along = dx * wind.toX + dy * wind.toY;
    const across = dy * wind.toX - dx * wind.toY;
    const length = along >= 0 ? spread.downwind : spread.upwind;
    const distance = Math.hypot(along / length, across / spread.side);
    if (distance >= 1) return 0;
    return spread.peak * (1 - distance);
}

/** The share (0 to 1) of the ground covered with leaves at a point of the map: the trees add up, never over 1. */
export function leafDensityAt(
    x: number,
    y: number,
    trees: readonly LeafTree[],
    wind: LeafWind,
    progress: number,
): number {
    let bare = 1;
    for (const tree of trees) {
        const density = treeDensity(x - tree.x, y - tree.y, spreadOf(tree, wind, progress), wind);
        if (density > 0) bare *= 1 - density;
    }
    return 1 - bare;
}

/** The density at the middle of each cell of 16 px an area touches, row by row. */
export interface LeafDensityField {
    /** Column and row of the first cell, in cells of the map. */
    column: number;
    row: number;
    columns: number;
    rows: number;
    values: Float32Array;
}

/**
 * The density over a whole area at once: each tree only visits the cells it reaches, so a view holding hundreds of
 * trees costs what their leaves cover, not trees × cells.
 */
export function leafDensityField(
    area: { x: number; y: number; width: number; height: number },
    trees: readonly LeafTree[],
    wind: LeafWind,
    progress: number,
): LeafDensityField {
    const size = LEAF_DENSITY_CELL_PX;
    const column = Math.floor(area.x / size);
    const row = Math.floor(area.y / size);
    const columns = Math.max(0, Math.floor((area.x + area.width - 1) / size) - column + 1);
    const rows = Math.max(0, Math.floor((area.y + area.height - 1) / size) - row + 1);
    // What is left bare, cell by cell; turned into the density at the end.
    const values = new Float32Array(columns * rows).fill(1);
    for (const tree of trees) {
        const spread = spreadOf(tree, wind, progress);
        const reach = Math.max(spread.downwind, spread.side);
        const firstColumn = Math.max(column, Math.floor((tree.x - reach) / size));
        const lastColumn = Math.min(column + columns - 1, Math.floor((tree.x + reach) / size));
        const firstRow = Math.max(row, Math.floor((tree.y - reach) / size));
        const lastRow = Math.min(row + rows - 1, Math.floor((tree.y + reach) / size));
        for (let cellRow = firstRow; cellRow <= lastRow; cellRow++) {
            const dy = cellRow * size + size / 2 - tree.y;
            for (let cellColumn = firstColumn; cellColumn <= lastColumn; cellColumn++) {
                const density = treeDensity(cellColumn * size + size / 2 - tree.x, dy, spread, wind);
                if (density > 0) values[(cellRow - row) * columns + (cellColumn - column)] *= 1 - density;
            }
        }
    }
    for (let index = 0; index < values.length; index++) values[index] = 1 - values[index];
    return { column, row, columns, rows, values };
}

/** A placed object, as reading its tree needs it (an `Entity` fits). */
export interface LeafTreeObject {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    /** Hidden while its image loads. */
    visible: boolean;
    getPrefab(): { id: string; seasonal?: unknown };
}

/**
 * The trees of the nature catalogue (the ones that sway) that lose their leaves, standing outdoors: not the evergreens
 * nor the palms.
 */
export function leafTreesOf(
    objects: Iterable<LeafTreeObject>,
    isOutdoor: (x: number, y: number) => boolean,
): LeafTree[] {
    const trees: LeafTree[] = [];
    for (const object of objects) {
        if (!object.visible) continue;
        const prefab = object.getPrefab();
        if (!isTreePrefab(prefab.id) || keepsLeavesInAutumn(prefab.seasonal)) continue;
        const x = object.x + object.displayWidth / 2;
        const y = object.y + object.displayHeight - 1;
        if (!isOutdoor(x, y)) continue;
        trees.push({ x, y, width: object.displayWidth });
    }
    return trees;
}
