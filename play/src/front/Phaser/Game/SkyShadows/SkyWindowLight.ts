import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { doorHeight, type DoorRef, type MapLayerModel } from "../MapEditor/MapLayer/MapLayerModel";
import { SHADOW_MAX_LENGTH, shadowDirection, shadowOffset } from "./SkyShadowGeometry";
import type { Point, ShadowLight } from "./SkyShadowGeometry";

/** The glass of a window starts this high above the floor and stops this far under the top of its opening (px). */
const WINDOW_SILL = 8;
const GLASS_TOP_MARGIN = 6;
/** A light that runs almost along the wall (less than this share of its way across it) does not come in. */
const GRAZING = 0.05;
/** Probes, in map pixels, just past each side of the row a wall is drawn on. */
const PROBE = 4;

/** A pane between the outdoors and a room: on the foot line of its wall, from `x` over `width` (map pixels). */
export interface WindowOpening {
    x: number;
    width: number;
    footY: number;
    /** Bottom and top of the glass above the floor, in map pixels. */
    sill: number;
    top: number;
    /** The room the light comes into (OutdoorGrid.roomAt), and on which side of the wall it lies. */
    room: number;
    inside: "north" | "south";
    /** False for an open door (see Pane); glass when absent. */
    glass?: boolean;
}

interface Pane {
    x: number;
    y: number;
    width: number;
    sill: number;
    height: number;
    /** False for an open door: nothing stands in the way of the light, which loses nothing there. */
    glass: boolean;
}

/** Whether a door of the map layer is open now (never, when the state of the doors is not known). */
export type IsDoorOpen = (door: DoorRef) => boolean;

/**
 * What lets the light of the sky through the horizontal walls of the map layer: its windows, its glazed doors, and
 * its doors that are open now, glazed or not.
 */
function panesOf(model: MapLayerModel, isDoorOpen: IsDoorOpen): Pane[] {
    const size = MAP_LAYER_TILE_SIZE;
    const panes: Pane[] = [];
    for (const window of model.getWindows()) {
        const height = model.getWindowHeight(window.x, window.y) ?? 1;
        panes.push({ x: window.x * size, y: window.y, width: size, sill: WINDOW_SILL, height, glass: true });
    }
    for (const door of model.getDoors()) {
        // A horizontal door stands on the segments x - 1 and x (doorEdges): two tiles wide, its glass to the floor.
        if (door.orientation !== "h") continue;
        const open = isDoorOpen(door);
        if (!open && door.glazed !== true) continue;
        panes.push({
            x: (door.x - 1) * size,
            y: door.y,
            width: 2 * size,
            sill: 0,
            height: doorHeight(door),
            glass: !open,
        });
    }
    return panes;
}

/**
 * The windows and the glazed doors of the map layer between the outdoors and a room: the sun or the moon comes in
 * through them. A horizontal wall of the line y is drawn on the row y, its foot on the bottom of that row: its north
 * side is looked at just above the row, its south side just under it.
 */
export function windowOpenings(
    model: MapLayerModel,
    roomAt: (x: number, y: number) => number | undefined,
    isOutdoorAt: (x: number, y: number) => boolean,
    isDoorOpen: IsDoorOpen = () => false,
): WindowOpening[] {
    const size = MAP_LAYER_TILE_SIZE;
    const panes = panesOf(model, isDoorOpen);
    const openings: WindowOpening[] = [];
    for (const pane of panes) {
        const centre = pane.x + pane.width / 2;
        const north = pane.y * size - PROBE;
        const south = (pane.y + 1) * size + PROBE;
        const northRoom = roomAt(centre, north);
        const southRoom = roomAt(centre, south);
        let room: number | undefined;
        let inside: "north" | "south" | undefined;
        if (northRoom !== undefined && southRoom === undefined && isOutdoorAt(centre, south)) {
            room = northRoom;
            inside = "north";
        } else if (southRoom !== undefined && northRoom === undefined && isOutdoorAt(centre, north)) {
            room = southRoom;
            inside = "south";
        }
        if (room === undefined || inside === undefined) continue;
        openings.push({
            x: pane.x,
            width: pane.width,
            footY: (pane.y + 1) * size,
            sill: pane.sill,
            top: pane.height * size - GLASS_TOP_MARGIN,
            room,
            inside,
            glass: pane.glass,
        });
    }
    return openings;
}

/**
 * Where the light of the sky that comes in through a window lies on the floor of the room: between where the rays
 * through the bottom and through the top of the glass meet the floor, slanted with the light, as far as the longest
 * shadow of the light. Undefined when the window does not face the light, or the light is under the horizon.
 */
export function windowLightPatch(opening: WindowOpening, light: ShadowLight): Point[] | undefined {
    const direction = shadowDirection(light.azimuth);
    const comesIn = opening.inside === "north" ? direction.y < -GRAZING : direction.y > GRAZING;
    if (!comesIn) return undefined;
    // The longest shadow set for the light bounds the patch; its shortest shadow does not move the pane.
    const reach = { ...light, shadowLength: { min: 0, max: light.shadowLength?.max ?? SHADOW_MAX_LENGTH } };
    const near = shadowOffset(opening.sill, reach);
    const far = shadowOffset(opening.top, reach);
    if (!near || !far) return undefined;
    const left = opening.x;
    const right = opening.x + opening.width;
    const foot = opening.footY;
    return [
        { x: left + near.x, y: foot + near.y },
        { x: right + near.x, y: foot + near.y },
        { x: right + far.x, y: foot + far.y },
        { x: left + far.x, y: foot + far.y },
    ];
}

/** A pane between two rooms: the light that came into one of them may go on into the other through it. */
export interface InteriorOpening {
    x: number;
    width: number;
    footY: number;
    sill: number;
    top: number;
    /** The rooms on each side of its wall (OutdoorGrid.roomAt). */
    north: number;
    south: number;
    /** False for an open door: the light loses nothing there. */
    glass?: boolean;
}

/** The windows and the glazed doors of the map layer between two rooms. */
export function interiorOpenings(
    model: MapLayerModel,
    roomAt: (x: number, y: number) => number | undefined,
    isDoorOpen: IsDoorOpen = () => false,
): InteriorOpening[] {
    const size = MAP_LAYER_TILE_SIZE;
    const openings: InteriorOpening[] = [];
    for (const pane of panesOf(model, isDoorOpen)) {
        const centre = pane.x + pane.width / 2;
        const north = roomAt(centre, pane.y * size - PROBE);
        const south = roomAt(centre, (pane.y + 1) * size + PROBE);
        if (north === undefined || south === undefined || north === south) continue;
        openings.push({
            x: pane.x,
            width: pane.width,
            footY: (pane.y + 1) * size,
            sill: pane.sill,
            top: pane.height * size - GLASS_TOP_MARGIN,
            north,
            south,
            glass: pane.glass,
        });
    }
    return openings;
}

/** What is left of the light after a pane it goes through. */
export const GLASS_KEPT_LIGHT = 0.85;
/** The light of the sky goes through this many panes in a row at most, the one it comes in through included. */
export const MAX_PANES_CROSSED = 3;
/** A patch smaller than this (square map pixels) is not worth drawing. */
const MIN_PATCH_AREA = 4;

/** The part of a convex shape that lies in another convex one (Sutherland-Hodgman); empty when they do not meet. */
function convexIntersection(subject: readonly Point[], clip: readonly Point[]): Point[] {
    let doubled = 0;
    for (let index = 0; index < clip.length; index++) {
        const from = clip[index];
        const to = clip[(index + 1) % clip.length];
        doubled += from.x * to.y - to.x * from.y;
    }
    // The side of each edge of the clip that is inside it depends on the way round it is drawn.
    const turn = doubled >= 0 ? 1 : -1;
    let points = [...subject];
    for (let index = 0; index < clip.length && points.length > 0; index++) {
        const a = clip[index];
        const b = clip[(index + 1) % clip.length];
        const side = (point: Point): number => turn * ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
        const kept: Point[] = [];
        for (let at = 0; at < points.length; at++) {
            const from = points[at];
            const to = points[(at + 1) % points.length];
            const fromIn = side(from);
            const toIn = side(to);
            if (fromIn >= 0) kept.push(from);
            if (fromIn >= 0 !== toIn >= 0) {
                const ratio = fromIn / (fromIn - toIn);
                kept.push({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
            }
        }
        points = kept;
    }
    return points;
}

function areaOf(polygon: readonly Point[]): number {
    let doubled = 0;
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        doubled += from.x * to.y - to.x * from.y;
    }
    return Math.abs(doubled) / 2;
}

/** A patch of the light of the sky on the floor of a room, and how much of the light is left there (1: all of it). */
export interface ThroughPatch {
    polygon: Point[];
    room: number;
    strength: number;
}

/**
 * A light that comes this close to the foot of an inner wall reaches its glass: the walls are drawn standing up over
 * the last row of the floor before them, and their glass rises above the floor.
 */
const PANE_REACH_PX = MAP_LAYER_TILE_SIZE;
/** A width of glass narrower than this (map pixels) relays nothing. */
const MIN_RELAY_WIDTH = 2;

/**
 * The stretch a convex patch covers along the horizontal line `y`: from its left to its right there. When the patch
 * stops short of the line by less than `tolerance`, the stretch of its edge nearest to the line; undefined further.
 */
function spanAt(polygon: readonly Point[], y: number, tolerance: number): { from: number; to: number } | undefined {
    const ys = polygon.map((point) => point.y);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    if (y < top - tolerance || y > bottom + tolerance) return undefined;
    const line = Math.min(bottom, Math.max(top, y));
    const xs: number[] = [];
    for (let index = 0; index < polygon.length; index++) {
        const a = polygon[index];
        const b = polygon[(index + 1) % polygon.length];
        if (a.y === b.y) {
            if (Math.abs(a.y - line) < 1e-6) xs.push(a.x, b.x);
        } else if (line >= Math.min(a.y, b.y) && line <= Math.max(a.y, b.y)) {
            xs.push(a.x + ((line - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
    }
    return xs.length === 0 ? undefined : { from: Math.min(...xs), to: Math.max(...xs) };
}

/**
 * The light of the sky on the floors of the rooms: what comes in through each pane that faces it, and what goes on
 * through the panes between two rooms. Two ways on, for the same inner pane:
 *
 * - the exact one: the rays of the sky are parallel, so a point of the next room is lit when it lies both in the patch
 *   of the pane the light came in through (not cut to its room) and in the patch the inner pane would throw if it
 *   gave on the outdoors. It only happens with tall glass or a very low light: the heights of the map are small
 *   against its distances;
 * - the relay, which is what the eye expects: a light that crosses the room up to the inner wall lights the glass it
 *   reaches, and that glass throws its own patch into the next room, over the width the light covers.
 *
 * The exact patch is kept when there is one; the relay otherwise. Each pane crossed takes a little of the light.
 * Nothing between the two panes is looked at: the first room is taken to be clear on the way.
 */
export function lightThroughPanes(
    openings: readonly WindowOpening[],
    interior: readonly InteriorOpening[],
    light: ShadowLight,
    maxPanes = MAX_PANES_CROSSED,
): ThroughPatch[] {
    const patches: ThroughPatch[] = [];
    const follow = (patch: ThroughPatch, inside: "north" | "south", panes: number): void => {
        patches.push(patch);
        if (panes >= maxPanes) return;
        for (const pane of interior) {
            // The light goes on the way it came in: through the panes whose near side is this room.
            const next = inside === "north" ? pane.north : pane.south;
            const near = inside === "north" ? pane.south : pane.north;
            if (near !== patch.room) continue;
            // Glass takes a little of the light; an open door none.
            const strength = patch.strength * (pane.glass === false ? 1 : GLASS_KEPT_LIGHT);
            const beyond = windowLightPatch({ ...pane, room: next, inside }, light);
            if (!beyond) continue;
            const exact = convexIntersection(patch.polygon, beyond);
            if (exact.length >= 3 && areaOf(exact) >= MIN_PATCH_AREA) {
                follow({ polygon: exact, room: next, strength }, inside, panes + 1);
                continue;
            }
            // The side of the wall the light comes to: its foot from the south, the top of its row from the north.
            const wallLine = inside === "north" ? pane.footY : pane.footY - MAP_LAYER_TILE_SIZE;
            const span = spanAt(patch.polygon, wallLine, PANE_REACH_PX);
            if (!span) continue;
            const from = Math.max(pane.x, span.from);
            const to = Math.min(pane.x + pane.width, span.to);
            if (to - from < MIN_RELAY_WIDTH) continue;
            const relayed = windowLightPatch({ ...pane, x: from, width: to - from, room: next, inside }, light);
            if (relayed) follow({ polygon: relayed, room: next, strength }, inside, panes + 1);
        }
    };
    for (const opening of openings) {
        const polygon = windowLightPatch(opening, light);
        if (polygon) follow({ polygon, room: opening.room, strength: 1 }, opening.inside, 1);
    }
    return patches;
}
