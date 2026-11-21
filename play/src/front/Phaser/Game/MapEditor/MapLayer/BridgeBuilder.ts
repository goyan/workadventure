import type { FloorModel } from "./FloorModel";
import { applySlabs, canPlaceStair, placeStair } from "./FloorOperations";
import { SLAB_WOOD_FAMILY, stairRun } from "./MapLayerFloors";
import type { SlabFamily, StairDirection, StairShape, StairWidth, TilePoint } from "./MapLayerFloors";
import type { MapBounds } from "./MapLayerOperations";

/**
 * A bridge laid in one gesture: from a tile of the ground to another one, a way up at each end and a deck between
 * them. It is made of the ordinary pieces of the raised floors (slabs, ramps or stairs), which can be edited one by
 * one afterwards.
 */

/** Of wood: sleepers and ramps of planks. Of concrete: slabs of grey stone and full stairs. */
export const BRIDGE_STYLES = ["wood", "concrete"] as const;
export type BridgeStyle = (typeof BRIDGE_STYLES)[number];

/**
 * Low: the low floor (LOW_FLOOR_ELEVATION), one step above the water. High: the top of walls of 2 tiles
 * (floorElevation(2)), a room fits under it.
 */
export const BRIDGE_HEIGHTS = [20, 52] as const;
export type BridgeHeight = (typeof BRIDGE_HEIGHTS)[number];

export const BRIDGE_MAX_WIDTH = 6;

export interface BridgeSpec {
    /** The tiles of the ground at the foot of each end: where one steps on the bridge. */
    from: TilePoint;
    to: TilePoint;
    /** In tiles, across the bridge: 1 to BRIDGE_MAX_WIDTH. */
    width: number;
    style: BridgeStyle;
    height: BridgeHeight;
}

export interface BridgePlan {
    /** The altitude of the deck. */
    level: BridgeHeight;
    family: SlabFamily;
    /** The ways up, side by side at each end: a ramp or a stair is 1 or 2 tiles wide. */
    ways: { shape: StairShape; foot: TilePoint }[];
    /** The deck: two opposite corners, in tiles of the ground. */
    deck: { a: TilePoint; b: TilePoint };
}

/** Why a bridge is not laid: no room for a deck between its two ways up, or something in the way. */
export type BridgeRefusal = "tooShort" | "blocked";

function way(direction: StairDirection, width: StairWidth, spec: BridgeSpec): StairShape {
    return spec.style === "wood"
        ? { direction, width, rise: spec.height, open: true, ramp: true }
        : { direction, width, rise: spec.height, open: false };
}

/** The widths of the ways up that fill the width of a bridge: as many of 2 tiles as fit, then one of 1. */
function wayWidths(width: number): StairWidth[] {
    const widths: StairWidth[] = [];
    for (let left = width; left > 0; left -= 2) widths.push(left >= 2 ? 2 : 1);
    return widths;
}

/**
 * What a bridge is made of. It is straight, east-west or north-south: along the longer side of the gesture, on the row
 * (or column) of its start; its width is centred on it. Refused when its two ways up leave no tile for a deck.
 */
export function planBridge(spec: BridgeSpec): BridgePlan | "tooShort" {
    const width = Math.min(BRIDGE_MAX_WIDTH, Math.max(1, Math.round(spec.width)));
    const family: SlabFamily = spec.style === "wood" ? SLAB_WOOD_FAMILY : "pierre-grise";
    const horizontal = Math.abs(spec.to.x - spec.from.x) >= Math.abs(spec.to.y - spec.from.y);
    const ways: BridgePlan["ways"] = [];
    if (horizontal) {
        const west = Math.min(spec.from.x, spec.to.x);
        const east = Math.max(spec.from.x, spec.to.x);
        const top = spec.from.y - Math.floor((width - 1) / 2);
        const run = stairRun("e", spec.height);
        if (east - run < west + run) return "tooShort";
        let row = top;
        for (const across of wayWidths(width)) {
            ways.push({ shape: way("e", across, spec), foot: { x: west, y: row } });
            ways.push({ shape: way("o", across, spec), foot: { x: east, y: row } });
            row += across;
        }
        return {
            level: spec.height,
            family,
            ways,
            deck: { a: { x: west + run, y: top }, b: { x: east - run, y: top + width - 1 } },
        };
    }
    const north = Math.min(spec.from.y, spec.to.y);
    const south = Math.max(spec.from.y, spec.to.y);
    const left = spec.from.x - Math.floor((width - 1) / 2);
    // Going up towards the south, a way is one tile longer (see stairRun).
    const fromNorth = stairRun("s", spec.height);
    const fromSouth = stairRun("n", spec.height);
    if (south - fromSouth < north + fromNorth) return "tooShort";
    let column = left;
    for (const across of wayWidths(width)) {
        ways.push({ shape: way("s", across, spec), foot: { x: column, y: north } });
        ways.push({ shape: way("n", across, spec), foot: { x: column, y: south } });
        column += across;
    }
    return {
        level: spec.height,
        family,
        ways,
        deck: { a: { x: left, y: north + fromNorth }, b: { x: left + width - 1, y: south - fromSouth } },
    };
}

/** Whether a planned bridge fits: inside the map, its ways up over no stair that starts from the ground. */
export function bridgeFits(model: FloorModel, plan: BridgePlan, bounds: MapBounds): boolean {
    const { a, b } = plan.deck;
    if (a.x < 0 || a.y < 0 || b.x >= bounds.columns || b.y >= bounds.rows) return false;
    return plan.ways.every(({ shape, foot }) => canPlaceStair(model, shape, foot, 0, bounds));
}

/** Lays a bridge whole, or nothing: its ways up from the ground, then its deck. */
export function layBridge(model: FloorModel, spec: BridgeSpec, bounds: MapBounds): BridgeRefusal | undefined {
    const plan = planBridge(spec);
    if (plan === "tooShort") return "tooShort";
    if (!bridgeFits(model, plan, bounds)) return "blocked";
    for (const { shape, foot } of plan.ways) placeStair(model, shape, foot, 0, bounds);
    applySlabs(model, plan.level, plan.deck.a, plan.deck.b, plan.family, bounds);
    return undefined;
}
