import { MAP_LAYER_TILE_SIZE } from "./MapLayerCatalog";
import type { FloorModel, PlacedStair } from "./FloorModel";
import type { PixelBox } from "./MapLayerFloors";

/**
 * Where an avatar stands among the floors: its altitude, and the stair it is on (index in the stairs of the model),
 * if any. `lane` is, on a stair going east or west, where it is across the stair, on the ground.
 */
export interface FloorWalkState {
    elevation: number;
    stair?: number;
    lane?: number;
}

/** A side of a stair a wall may close: its foot, or one of its two long sides (the north or west one is `min`). */
export type StairSide = "foot" | "min" | "max";

interface Pt {
    x: number;
    y: number;
}

/** Margin kept from the long sides of a stair, above its first steps. */
const SIDE = 6;
/** Part of a stair, from its foot, where one can step on and off it by its sides. */
const LOW_END = 0.5;
/** How far from a wall closing a side of a stair the avatar stays: the reach of the wall and half its body. */
const FOOT_WALL = 18;
/** A move longer than this in one frame is a teleport: the avatar is read again as standing on the ground. */
const TELEPORT_PX = 48;
/** A point on the edge of a tile belongs to the tiles of both sides. */
const EDGE = 0.01;

function inside(p: Pt, box: PixelBox): boolean {
    return p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Keeps a point out of a box, sliding along its sides. */
function keepOut(prev: Pt, p: Pt, box: PixelBox): Pt {
    if (!inside(p, box)) return p;
    if (!inside({ x: p.x, y: prev.y }, box)) return { x: p.x, y: prev.y };
    if (!inside({ x: prev.x, y: p.y }, box)) return { x: prev.x, y: p.y };
    return prev;
}

function isHorizontal(stair: PlacedStair): boolean {
    return stair.shape.direction === "e" || stair.shape.direction === "o";
}

/** Whether a point of the ground is over the stair, below its top edge; the edges of its width count. */
function overStair(stair: PlacedStair, ground: Pt): boolean {
    const g = stair.ground;
    const progress = progressOnGround(stair, ground);
    const within = isHorizontal(stair)
        ? ground.y >= g.y && ground.y <= g.y + g.height
        : ground.x >= g.x && ground.x <= g.x + g.width;
    return within && progress > 0 && progress < 1;
}

/** How far up the stair a point of the ground is: 0 at its foot, 1 at its top (not bounded). */
function progressOnGround(stair: PlacedStair, ground: Pt): number {
    const g = stair.ground;
    switch (stair.shape.direction) {
        case "n":
            return (g.y + g.height - ground.y) / g.height;
        case "s":
            return (ground.y - g.y) / g.height;
        case "e":
            return (ground.x - g.x) / g.width;
        case "o":
            return (g.x + g.width - ground.x) / g.width;
    }
}

/**
 * The same for a point of the screen (seen from the floor the stair starts from): going north the stair is longer on
 * the screen than on the ground by its rise, going south shorter.
 */
function progressOnScreen(stair: PlacedStair, screen: Pt): number {
    const g = stair.ground;
    const rise = stair.top - stair.base;
    switch (stair.shape.direction) {
        case "n":
            return (g.y + g.height - screen.y) / (g.height + rise);
        case "s":
            return (screen.y - g.y) / (g.height - rise);
        default:
            return progressOnGround(stair, screen);
    }
}

/**
 * What the stair fills for an avatar of the floor it starts from, on the screen of that floor: all it shows of a stair
 * going north or south, its footprint for a stair going east or west.
 */
function obstacleBox(stair: PlacedStair): PixelBox {
    const g = stair.ground;
    const rise = stair.top - stair.base;
    if (stair.shape.direction === "n") return { x: g.x, y: g.y - rise, width: g.width, height: g.height + rise };
    if (stair.shape.direction === "s") return { x: g.x, y: g.y, width: g.width, height: g.height - rise };
    return g;
}

/** Whether an avatar at this point of the screen, at this altitude, stands over a slab (the ground carries anyone). */
function standsOnFloor(model: FloorModel, elevation: number, screen: Pt): boolean {
    if (elevation === 0) return true;
    const size = MAP_LAYER_TILE_SIZE;
    const groundY = screen.y + elevation;
    for (const dx of [-EDGE, EDGE]) {
        for (const dy of [-EDGE, EDGE]) {
            if (model.hasSlab(elevation, Math.floor((screen.x + dx) / size), Math.floor((groundY + dy) / size))) {
                return true;
            }
        }
    }
    return false;
}

/**
 * One frame of an avatar among the floors. `prev` is the point between its feet, on the screen, after the last call;
 * `p` where the keys took it since. Returns where it may be and what it stands on: it goes up and down the stairs,
 * stays over the slabs of its floor (their edge is a railing), and cannot walk through the side of a stair.
 *
 * `closed` tells the sides of a stair a wall stands along: the avatar stays off them.
 */
export function floorStep(
    model: FloorModel,
    state: FloorWalkState,
    prev: Pt,
    p: Pt,
    closed?: (stairIndex: number, side: StairSide) => boolean,
): { state: FloorWalkState; p: Pt } {
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > TELEPORT_PX) {
        return { state: { elevation: 0 }, p };
    }
    const stairs = model.getStairs();
    let next = state;
    let point = p;

    if (state.stair === undefined) {
        const level = state.elevation;
        // Seen from this floor: a point of the screen is over the point of the ground `level` further south.
        const ground = { x: point.x, y: point.y + level };
        const prevGround = { x: prev.x, y: prev.y + level };
        for (const [index, stair] of stairs.entries()) {
            if (stair.base === level) {
                // The stair stands on this floor: one steps on it by its first steps, and it blocks elsewhere.
                const box = obstacleBox(stair);
                if (!inside(ground, box)) continue;
                if (inside(prevGround, box) || progressOnScreen(stair, ground) < LOW_END) {
                    next = { elevation: level, stair: index, lane: isHorizontal(stair) ? ground.y : undefined };
                    break;
                }
                const kept = keepOut(prevGround, ground, box);
                point = { x: kept.x, y: kept.y - level };
            } else if (stair.top === level) {
                // The stair arrives on this floor: one steps on it over its top edge.
                if (overStair(stair, ground) && progressOnGround(stair, prevGround) >= 1) {
                    next = { elevation: level, stair: index, lane: isHorizontal(stair) ? ground.y : undefined };
                    break;
                }
            }
        }
        if (next.stair === undefined && !standsOnFloor(model, level, prev)) {
            // The slab the avatar stood on is gone (the map editor removed it): it is on the ground.
            return { state: { elevation: 0 }, p: point };
        }
        if (next.stair === undefined && !standsOnFloor(model, level, point)) {
            // The railing: slide along the edge of the floor.
            if (standsOnFloor(model, level, { x: point.x, y: prev.y })) point = { x: point.x, y: prev.y };
            else if (standsOnFloor(model, level, { x: prev.x, y: point.y })) point = { x: prev.x, y: point.y };
            else point = prev;
        }
    }

    if (next.stair === undefined) {
        return { state: next, p: point };
    }

    const index = next.stair;
    const stair = stairs[index];
    if (!stair) {
        // The stair was removed under the avatar.
        return { state: { elevation: 0 }, p: point };
    }
    const g = stair.ground;
    const rise = stair.top - stair.base;
    const direction = stair.shape.direction;
    // Seen from the floor the stair starts from.
    let screen = { x: point.x, y: point.y + stair.base };
    const prevScreen = { x: prev.x, y: prev.y + stair.base };
    let progress: number;
    let lane: number | undefined;
    let steppedOff = false;

    if (isHorizontal(stair)) {
        if (closed?.(index, "foot")) {
            screen =
                direction === "e"
                    ? { x: Math.max(screen.x, g.x + FOOT_WALL), y: screen.y }
                    : { x: Math.min(screen.x, g.x + g.width - FOOT_WALL), y: screen.y };
        }
        // Where the avatar is across the stair, on the ground: it moves by what the keys moved it on the screen.
        const moved = state.stair === index ? screen.y - prevScreen.y : 0;
        const across = (next.lane ?? screen.y) + moved;
        const minOpen = !closed?.(index, "min");
        const maxOpen = !closed?.(index, "max");
        const min = minOpen ? g.y : g.y + FOOT_WALL;
        const max = maxOpen ? g.y + g.height : g.y + g.height - FOOT_WALL;
        progress = progressOnGround(stair, screen);
        if (progress < LOW_END && ((across < g.y && minOpen) || (across > g.y + g.height && maxOpen))) {
            steppedOff = true;
            screen = { x: screen.x, y: across };
        } else {
            lane = progress < LOW_END ? clamp(across, min, max) : clamp(across, g.y + SIDE, g.y + g.height - 2);
            screen = { x: screen.x, y: lane - clamp(progress, 0, 1) * rise };
        }
    } else {
        if (closed?.(index, "min")) screen = { x: Math.max(screen.x, g.x + FOOT_WALL), y: screen.y };
        if (closed?.(index, "max")) screen = { x: Math.min(screen.x, g.x + g.width - FOOT_WALL), y: screen.y };
        if (closed?.(index, "foot")) {
            screen =
                direction === "n"
                    ? { x: screen.x, y: Math.min(screen.y, g.y + g.height - FOOT_WALL) }
                    : { x: screen.x, y: Math.max(screen.y, g.y + FOOT_WALL) };
        }
        progress = progressOnScreen(stair, screen);
        if (progress < LOW_END) {
            steppedOff = screen.x < g.x || screen.x > g.x + g.width;
        } else {
            screen = { x: clamp(screen.x, g.x + SIDE, g.x + g.width - SIDE), y: screen.y };
        }
    }
    point = { x: screen.x, y: screen.y - stair.base };

    // Off the stair by its foot, its first steps or its top: only onto a floor that carries the avatar.
    const arrival = steppedOff || progress <= 0 ? stair.base : progress >= 1 ? stair.top : undefined;
    if (arrival === undefined) {
        return { state: { elevation: stair.base + clamp(progress, 0, 1) * rise, stair: index, lane }, p: point };
    }
    if (standsOnFloor(model, arrival, point)) {
        return { state: { elevation: arrival }, p: point };
    }
    return { state, p: prev };
}
