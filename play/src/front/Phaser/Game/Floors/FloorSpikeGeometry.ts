/**
 * THROWAWAY SPIKE (not to be committed): one raised platform and three stairs, to prove the "position = screen
 * position, altitude z apart" model of the floors study. Pure geometry: no Phaser here.
 *
 * Everything is told on the ground (where the thing stands) and drawn `z` pixels further north.
 */
export const SPIKE_TILE = 32;
/** Top of a wall of height 2: `32 * 2 - 12`. */
export const SPIKE_Z = 52;
/** Length of a stair on the ground: more than the rise, or a stair going south would not move on the screen. */
export const SPIKE_RUN = 96;

export interface Pt {
    x: number;
    y: number;
}
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Direction the stair goes up towards. `ground` is its footprint on the ground. */
export interface SpikeStair {
    dir: "n" | "s" | "e";
    ground: Box;
    /** A wall stands at the foot of the stair: one steps on and off it by its sides only. */
    closedFoot?: boolean;
}
export interface SpikeLayout {
    /** Footprint of the platform on the ground; it is drawn `z` higher. */
    platform: Box;
    z: number;
    stairs: SpikeStair[];
}
export interface SpikeState {
    /** Where the avatar stands: the ground, the platform, or the stair of this index. */
    on: "ground" | "platform" | number;
    z: number;
    /** On a stair going east or west: where the avatar is across the stair, on the ground. */
    lane?: number;
}

export function spikeLayout(originCellX: number, originCellY: number): SpikeLayout {
    const t = SPIKE_TILE;
    const platform = { x: (originCellX + 2) * t, y: (originCellY - 6) * t, width: 6 * t, height: 4 * t };
    return {
        platform,
        z: SPIKE_Z,
        stairs: [
            // Arrives on the south edge of the platform.
            {
                dir: "n",
                ground: { x: (originCellX + 3) * t, y: platform.y + platform.height, width: t, height: SPIKE_RUN },
            },
            // Arrives on its north edge.
            { dir: "s", ground: { x: (originCellX + 6) * t, y: platform.y - SPIKE_RUN, width: t, height: SPIKE_RUN } },
            // Arrives on its west edge.
            { dir: "e", ground: { x: platform.x - SPIKE_RUN, y: (originCellY - 4) * t, width: SPIKE_RUN, height: t } },
        ],
    };
}

/**
 * The guinea-pig room of the local team map (walls of height 2, cells 126..131 x 70..75): a mezzanine over its north
 * half, a stair going north along the east wall and a stair going east along the row 71.
 */
export function spikeRoomLayout(): SpikeLayout {
    const t = SPIKE_TILE;
    const platform = { x: 128 * t, y: 70 * t, width: 4 * t, height: 3 * t };
    return {
        platform,
        z: SPIKE_Z,
        stairs: [
            { dir: "n", ground: { x: 131 * t, y: 73 * t, width: t, height: 3 * t } },
            { dir: "e", ground: { x: 126 * t, y: 71 * t, width: 2 * t, height: t }, closedFoot: true },
        ],
    };
}

/** The platform as it is drawn. */
export function platformScreenBox(layout: SpikeLayout): Box {
    return { ...layout.platform, y: layout.platform.y - layout.z };
}

/** What a stair covers on the screen, for the stairs going north or south (a stair going east is a slanted band). */
export function stairScreenBox(stair: SpikeStair, z: number): Box {
    const g = stair.ground;
    if (stair.dir === "n") return { x: g.x, y: g.y - z, width: g.width, height: g.height + z };
    if (stair.dir === "s") return { x: g.x, y: g.y, width: g.width, height: g.height - z };
    return g;
}

function inside(p: Pt, box: Box): boolean {
    return p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Keeps a point out of a box, sliding along its sides. */
function keepOut(prev: Pt, p: Pt, box: Box): Pt {
    if (!inside(p, box)) return p;
    if (!inside({ x: p.x, y: prev.y }, box)) return { x: p.x, y: prev.y };
    if (!inside({ x: prev.x, y: p.y }, box)) return { x: prev.x, y: p.y };
    return prev;
}

const SIDE = 6;
/** Part of a stair, from its foot, where one can step on it from the ground. */
const LOW_END = 0.3;
/** How far from a wall at the foot of a stair the avatar stays: the reach of the wall and half its body. */
const FOOT_WALL = 18;
/** A move longer than this in one frame is a teleport: the avatar is read again as standing on the ground. */
const TELEPORT_PX = 48;

/**
 * One frame: `prev` is the point of the avatar after the last call, `p` where the keys took it since. Returns where it
 * may be and what it stands on.
 */
export function spikeStep(layout: SpikeLayout, state: SpikeState, prev: Pt, p: Pt): { state: SpikeState; p: Pt } {
    const z = layout.z;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > TELEPORT_PX) {
        return { state: { on: "ground", z: 0 }, p };
    }
    let next: SpikeState = state;
    let point = p;

    if (state.on === "ground") {
        for (const [index, stair] of layout.stairs.entries()) {
            const g = stair.ground;
            const box = stairScreenBox(stair, z);
            if (!inside(point, box)) continue;
            // One steps on a stair by its low end: from the front, or from a side on its first steps.
            const progress =
                stair.dir === "n"
                    ? (g.y + g.height - point.y) / box.height
                    : stair.dir === "s"
                      ? (point.y - g.y) / box.height
                      : (point.x - g.x) / g.width;
            // (An avatar brought inside the stair, by a teleport, stands on it.)
            const entering = inside(prev, box) || progress < LOW_END;
            if (entering) {
                next = { on: index, z: 0, lane: stair.dir === "e" ? point.y : undefined };
                break;
            }
            point = keepOut(prev, point, box);
        }
    } else if (state.on === "platform") {
        const screen = platformScreenBox(layout);
        for (const [index, stair] of layout.stairs.entries()) {
            const g = stair.ground;
            const alongX = point.x > g.x && point.x < g.x + g.width;
            const laneOfPoint = point.y + z;
            const leaving =
                (stair.dir === "n" && point.y > screen.y + screen.height && alongX) ||
                (stair.dir === "s" && point.y < screen.y && alongX) ||
                (stair.dir === "e" && point.x < screen.x && laneOfPoint > g.y && laneOfPoint < g.y + g.height);
            if (leaving) {
                next = { on: index, z, lane: stair.dir === "e" ? laneOfPoint : undefined };
                break;
            }
        }
        if (next.on === "platform") {
            // The railing, open where a stair arrives.
            let minX = screen.x + SIDE;
            let minY = screen.y + SIDE;
            let maxY = screen.y + screen.height - 2;
            for (const stair of layout.stairs) {
                const g = stair.ground;
                const alongX = point.x > g.x && point.x < g.x + g.width;
                const lane = point.y + z;
                if (stair.dir === "n" && alongX) maxY = Infinity;
                if (stair.dir === "s" && alongX) minY = -Infinity;
                if (stair.dir === "e" && lane > g.y && lane < g.y + g.height) minX = -Infinity;
            }
            point = {
                x: clamp(point.x, minX, screen.x + screen.width - SIDE),
                y: clamp(point.y, minY, maxY),
            };
        }
    }

    if (typeof next.on === "number") {
        const stair = layout.stairs[next.on];
        const g = stair.ground;
        let progress: number;
        // On its first steps, one can step off a stair by its sides.
        let steppedOff = false;
        if (stair.dir === "e") {
            const moved = state.on === next.on ? point.y - prev.y : 0;
            const across = (next.lane ?? point.y) + moved;
            if (stair.closedFoot) point = { x: Math.max(point.x, g.x + FOOT_WALL), y: point.y };
            progress = (point.x - g.x) / g.width;
            if (progress < LOW_END && (across < g.y || across > g.y + g.height)) {
                steppedOff = true;
                point = { x: point.x, y: across };
            } else {
                const lane = progress < LOW_END ? across : clamp(across, g.y + SIDE, g.y + g.height - 2);
                const altitude = clamp(progress, 0, 1) * z;
                point = { x: point.x, y: lane - altitude };
                next = { on: next.on, z: altitude, lane };
            }
        } else {
            const box = stairScreenBox(stair, z);
            progress = stair.dir === "n" ? (g.y + g.height - point.y) / box.height : (point.y - g.y) / box.height;
            if (progress < LOW_END) {
                steppedOff = point.x < g.x || point.x > g.x + g.width;
            } else {
                point = { x: clamp(point.x, g.x + SIDE, g.x + g.width - SIDE), y: point.y };
            }
            next = { on: next.on, z: clamp(progress, 0, 1) * z };
        }
        if (steppedOff) next = { on: "ground", z: 0 };
        else if (progress <= 0) next = { on: "ground", z: 0 };
        else if (progress >= 1) next = { on: "platform", z };
    }
    return { state: next, p: point };
}

/** Whether the platform hides the avatar (it is lower than it and under its image), or the avatar climbs to it. */
export function platformHidesAvatar(layout: SpikeLayout, state: SpikeState, p: Pt): boolean {
    if (state.on === "platform") return false;
    if (typeof state.on === "number") return true;
    const screen = platformScreenBox(layout);
    // The avatar is about 36 px high above its feet, 24 px wide.
    return (
        p.x + 12 > screen.x &&
        p.x - 12 < screen.x + screen.width &&
        p.y > screen.y &&
        p.y - 36 < screen.y + screen.height + 8
    );
}
