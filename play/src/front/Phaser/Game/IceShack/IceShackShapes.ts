import {
    ICE_SHACK_DRILL_MS,
    ICE_SHACK_HOLE_DX,
    ICE_SHACK_RAISE_MS,
    ICE_SHACK_READY_MS,
} from "@workadventure/map-editor";

/**
 * The ice fishing shack drawn in pixel art, in code like the other things of the map that are not images: rectangles
 * of map pixels around the centre of its hole (x east, y south), in three layers sorted with the avatars by their
 * feet: the ground (its floor, its hole, the cracks of the ice), the back (its walls, its roof, its stove, its stool),
 * the front (the posts of its open front, its door swung open). The front wall and the front of the roof are left
 * out, as in a doll's house: the angler is seen in it. Pure: drawn by IceShackView, and by the previews outside the
 * game.
 */

export interface PixelRect {
    x: number;
    y: number;
    w: number;
    h: number;
    color: number;
    alpha?: number;
}

export interface ShackLayers {
    ground: PixelRect[];
    back: PixelRect[];
    front: PixelRect[];
}

/** The floor of the shack around its hole: as the rules read the ice under it (Life/IceShack). */
export const FLOOR = { left: -40, right: 24, top: -20, bottom: 12 } as const;
/** How tall its walls are (px). */
const WALL_PX = 28;
/** The ridge of the roof over its back wall (px). */
const ROOF_PX = 14;
/** Where the smoke leaves its stove pipe. */
export const PIPE_TOP = { x: -32, y: FLOOR.top - WALL_PX - ROOF_PX - 9 } as const;
/** The hole: an ellipse this wide and tall once drilled (px, half sizes). */
const HOLE_RX = 7;
const HOLE_RY = 5;

const PALETTE = {
    plankLight: 0x9a6a3c,
    plank: 0x7d5230,
    plankDark: 0x5a3a22,
    beam: 0x4a2e1a,
    roof: 0x8e3b2e,
    roofDark: 0x6a2a21,
    roofEdge: 0x4d1d17,
    snow: 0xf2f6fa,
    stove: 0x2a2a2e,
    stoveEdge: 0x45454c,
    metal: 0x8f959c,
    water: 0x173a5c,
    waterDeep: 0x0e2840,
    slush: 0xcfe3ef,
    chip: 0xeaf4fa,
    crack: 0xffffff,
    crackShade: 0x3f6f8f,
    glow: 0xffb347,
    glowHot: 0xffe08a,
    windowDay: 0x9ec6dc,
    windowNight: 0xffc864,
    stool: 0x6b4426,
} as const;

/** The parts of the life of a shack, from the time since it was started (ms). */
export type ShackPhase = "drilling" | "raising" | "standing";

export function shackPhase(ageMs: number): { phase: ShackPhase; progress: number } {
    if (ageMs < ICE_SHACK_DRILL_MS) return { phase: "drilling", progress: Math.max(0, ageMs) / ICE_SHACK_DRILL_MS };
    if (ageMs < ICE_SHACK_READY_MS) {
        return { phase: "raising", progress: (ageMs - ICE_SHACK_DRILL_MS) / ICE_SHACK_RAISE_MS };
    }
    return { phase: "standing", progress: 1 };
}

export interface ShackLook {
    /** From 0 (nothing up yet) to 1 (up): the shack goes up, or folds down as it is taken away. */
    raised: number;
    /** From 0 to 1: the hole being drilled. */
    drilled: number;
    /** Somebody sits in it: the stove and the lantern are lit (they glow at night), the pipe smokes. */
    occupied: boolean;
    /** The ice cracks under it: from 0 (first cracks) to 1 (about to give way); undefined when it bears it. */
    cracking?: number;
    /** The auger turns in the hole: its time (ms), undefined once the hole is drilled. */
    augerMs?: number;
}

const rect = (x: number, y: number, w: number, h: number, color: number, alpha?: number): PixelRect => ({
    x,
    y,
    w,
    h,
    color,
    ...(alpha === undefined ? {} : { alpha }),
});

/** An ellipse filled row by row, centred on (cx, cy). */
function ellipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha?: number): PixelRect[] {
    const rows: PixelRect[] = [];
    if (rx <= 0 || ry <= 0) return rows;
    for (let dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
        const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
        if (half <= 0) continue;
        rows.push(rect(cx - half, cy + dy, half * 2, 1, color, alpha));
    }
    return rows;
}

/** A pseudo-random number in [0, 1) of an integer: the same chips and cracks at every image. */
function hash(n: number): number {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

/** The hole in the ice, its slush and the chips of ice thrown around it as it is drilled. */
function hole(drilled: number): PixelRect[] {
    const rects: PixelRect[] = [];
    const share = Math.max(0, Math.min(1, drilled));
    // The chips lie around it from the first turn of the auger.
    const chips = Math.round(14 * Math.min(1, share * 2));
    for (let index = 0; index < chips; index++) {
        const angle = hash(index) * Math.PI * 2;
        const reach = HOLE_RX + 2 + hash(index + 50) * 5;
        rects.push(
            rect(
                Math.round(Math.cos(angle) * reach),
                Math.round(Math.sin(angle) * reach * 0.7),
                1 + Math.round(hash(index + 90)),
                1,
                PALETTE.chip,
            ),
        );
    }
    if (share <= 0) return rects;
    const rx = Math.max(1, Math.round(HOLE_RX * share));
    const ry = Math.max(1, Math.round(HOLE_RY * share));
    rects.push(...ellipse(0, 0, rx + 2, ry + 1, PALETTE.slush));
    rects.push(...ellipse(0, 0, rx, ry, PALETTE.water));
    rects.push(...ellipse(0, 1, Math.max(1, rx - 2), Math.max(1, ry - 2), PALETTE.waterDeep));
    return rects;
}

/** The cracks of an ice too thin for the shack, around its floor: more and longer as it is about to give way. */
function cracks(share: number): PixelRect[] {
    const rects: PixelRect[] = [];
    const count = 5 + Math.round(7 * share);
    for (let index = 0; index < count; index++) {
        // From the edges of the floor (its front, its sides; its back is under its wall) out on the ice.
        const side = index % 3;
        const along = hash(index + 7);
        let x =
            side === 0
                ? FLOOR.left + Math.round(along * (FLOOR.right - FLOOR.left))
                : side === 1
                  ? FLOOR.left - 1
                  : FLOOR.right + 7;
        let y = side === 0 ? FLOOR.bottom + 1 : FLOOR.top + Math.round(along * (FLOOR.bottom - FLOOR.top));
        const out = side === 0 ? { x: 0, y: 1 } : { x: side === 1 ? -1 : 1, y: 0 };
        const length = 8 + Math.round((10 + 14 * share) * hash(index + 21));
        for (let step = 0; step < length; step++) {
            rects.push(rect(x, y, 1, 1, PALETTE.crack, 0.9));
            rects.push(rect(x + 1, y, 1, 1, PALETTE.crackShade, 0.9));
            const wobble = hash(index * 31 + step) < 0.5 ? -1 : 1;
            if (out.y !== 0) {
                y += out.y;
                if (step % 2 === 0) x += wobble;
            } else {
                x += out.x;
                if (step % 2 === 0) y += wobble;
            }
        }
    }
    return rects;
}

/**
 * The parts of the back that go up from the floor as the shack is raised: squeezed towards the floor line under it
 * while `raised` is under 1.
 */
function raise(rects: PixelRect[], base: number, raised: number): PixelRect[] {
    if (raised >= 1) return rects;
    const share = Math.max(0, raised);
    return rects
        .map((piece) => {
            const top = base + (piece.y - base) * share;
            const bottom = base + (piece.y + piece.h - base) * share;
            const y = Math.round(Math.min(top, bottom));
            const h = Math.max(0, Math.round(Math.abs(bottom - top)));
            return { ...piece, y, h };
        })
        .filter((piece) => piece.h > 0);
}

/** The ice fishing shack seen as it is now. */
export function shackLayers(look: ShackLook): ShackLayers {
    const ground: PixelRect[] = [];
    const back: PixelRect[] = [];
    const front: PixelRect[] = [];
    const width = FLOOR.right - FLOOR.left;
    const wallTop = FLOOR.top - WALL_PX;
    const roofTop = wallTop - ROOF_PX;
    const lit = look.occupied;

    // The floor of planks, laid once the shack goes up; the hole is drilled through the ice before.
    if (look.raised > 0) {
        ground.push(rect(FLOOR.left, FLOOR.top, width, FLOOR.bottom - FLOOR.top, PALETTE.plank));
        for (let y = FLOOR.top + 3; y < FLOOR.bottom; y += 5) {
            ground.push(rect(FLOOR.left, y, width, 1, PALETTE.plankDark));
        }
        ground.push(rect(FLOOR.left, FLOOR.bottom - 1, width, 1, PALETTE.beam));
    }
    ground.push(...hole(look.drilled));
    if (look.cracking !== undefined) ground.push(...cracks(look.cracking));

    // The auger in the hole: its shaft, its crank turning.
    if (look.augerMs !== undefined) {
        const turn = Math.floor(look.augerMs / 120) % 4;
        ground.push(rect(-1, -24, 2, 24, PALETTE.metal));
        const crank = [-6, -2, 4, -2][turn];
        ground.push(rect(Math.min(0, crank), -25, Math.abs(crank) + 1, 2, PALETTE.beam));
        ground.push(rect(crank, -27, 2, 4, PALETTE.beam));
    }

    if (look.raised > 0) {
        const wall: PixelRect[] = [];
        // The back wall, vertical planks.
        wall.push(rect(FLOOR.left, wallTop, width, WALL_PX, PALETTE.plank));
        for (let x = FLOOR.left; x < FLOOR.right; x += 6) {
            wall.push(rect(x, wallTop, 1, WALL_PX, PALETTE.plankDark));
            wall.push(rect(x + 1, wallTop, 1, WALL_PX, PALETTE.plankLight));
        }
        wall.push(rect(FLOOR.left, FLOOR.top - 2, width, 2, PALETTE.beam));
        // Its window, lit from inside at night.
        wall.push(rect(-2, wallTop + 6, 12, 9, PALETTE.beam));
        wall.push(rect(-1, wallTop + 7, 10, 7, lit ? PALETTE.windowNight : PALETTE.windowDay));
        wall.push(rect(4, wallTop + 7, 1, 7, PALETTE.beam));
        // The roof over it, its shingles, the snow on its ridge.
        wall.push(rect(FLOOR.left - 4, roofTop, width + 8, ROOF_PX, PALETTE.roof));
        for (let y = roofTop + 3; y < wallTop; y += 4) {
            wall.push(rect(FLOOR.left - 4, y, width + 8, 1, PALETTE.roofDark));
        }
        wall.push(rect(FLOOR.left - 4, wallTop - 1, width + 8, 2, PALETTE.roofEdge));
        wall.push(rect(FLOOR.left - 2, roofTop - 2, width + 4, 2, PALETTE.snow));
        // The side walls, seen along their top.
        wall.push(rect(FLOOR.left, wallTop, 3, FLOOR.bottom - wallTop, PALETTE.plankDark));
        wall.push(rect(FLOOR.right - 3, wallTop, 3, FLOOR.bottom - wallTop, PALETTE.plankDark));
        // The stove in the back corner and its pipe through the roof.
        wall.push(rect(-37, FLOOR.top - 12, 10, 12, PALETTE.stove));
        wall.push(rect(-37, FLOOR.top - 12, 10, 1, PALETTE.stoveEdge));
        wall.push(rect(-35, FLOOR.top - 7, 6, 4, look.occupied ? PALETTE.glow : PALETTE.stoveEdge));
        if (look.occupied) wall.push(rect(-34, FLOOR.top - 6, 4, 2, PALETTE.glowHot));
        wall.push(rect(PIPE_TOP.x - 1, PIPE_TOP.y, 3, FLOOR.top - 12 - PIPE_TOP.y, PALETTE.stoveEdge));
        wall.push(rect(PIPE_TOP.x - 2, PIPE_TOP.y - 1, 5, 2, PALETTE.stove));
        // The lantern on the back wall.
        wall.push(rect(14, wallTop + 4, 1, 4, PALETTE.beam));
        wall.push(rect(12, wallTop + 8, 5, 6, PALETTE.beam));
        wall.push(rect(13, wallTop + 9, 3, 4, lit ? PALETTE.glowHot : PALETTE.metal));
        // The stool in front of the hole.
        const stool = -ICE_SHACK_HOLE_DX;
        wall.push(rect(stool - 4, -3, 8, 2, PALETTE.stool));
        wall.push(rect(stool - 3, -1, 1, 4, PALETTE.beam));
        wall.push(rect(stool + 2, -1, 1, 4, PALETTE.beam));
        back.push(...raise(wall, FLOOR.top, look.raised));

        const opening: PixelRect[] = [];
        // The posts of the open front and the beam over it.
        opening.push(rect(FLOOR.left, FLOOR.bottom - WALL_PX - 2, 3, WALL_PX + 2, PALETTE.beam));
        opening.push(rect(FLOOR.right - 3, FLOOR.bottom - WALL_PX - 2, 3, WALL_PX + 2, PALETTE.beam));
        opening.push(rect(FLOOR.left, FLOOR.bottom - 2, width, 2, PALETTE.beam));
        // The door swung open on the right, its handle.
        opening.push(rect(FLOOR.right, FLOOR.bottom - WALL_PX + 2, 6, WALL_PX - 2, PALETTE.plank));
        opening.push(rect(FLOOR.right + 2, FLOOR.bottom - WALL_PX + 2, 1, WALL_PX - 2, PALETTE.plankDark));
        opening.push(rect(FLOOR.right + 4, FLOOR.bottom - 14, 1, 2, PALETTE.metal));
        front.push(...raise(opening, FLOOR.bottom, look.raised));
    }
    return { ground, back, front };
}

/** Where the glow of a lit shack is, around its hole: its lantern and its window (map pixels from the hole). */
export const GLOW = { x: -8, y: FLOOR.top - 6, radius: 44 } as const;

/** A puff of smoke of the stove pipe. */
export interface SmokePuff {
    x: number;
    y: number;
    radius: number;
    alpha: number;
}

/** A puff leaves the pipe this often (ms) and lives this long. */
const PUFF_EVERY_MS = 500;
const PUFF_LIFE_MS = 4500;
/** How fast the warm smoke rises over the pipe (px/s), drawn up the screen. */
const SMOKE_RISE_PX_S = 7;

/**
 * The smoke of the stove pipe at `timeMs`, from the top of the pipe: each puff rises and swells as it fades, carried
 * by the wind near the ground (`wind`, map pixels a second, see groundWind), like the snow and the rain. Still for
 * who asked for less motion: one faint puff over the pipe.
 */
export function smokePuffs(timeMs: number, wind: { x: number; y: number }, reducedMotion: boolean): SmokePuff[] {
    if (reducedMotion) return [{ x: PIPE_TOP.x, y: PIPE_TOP.y - 4, radius: 3, alpha: 0.35 }];
    const puffs: SmokePuff[] = [];
    const newest = Math.floor(timeMs / PUFF_EVERY_MS);
    for (let index = newest; index > newest - PUFF_LIFE_MS / PUFF_EVERY_MS; index--) {
        const age = (timeMs - index * PUFF_EVERY_MS) / 1000;
        const life = age / (PUFF_LIFE_MS / 1000);
        if (life < 0 || life >= 1) continue;
        // A little sway of its own, so that the puffs do not go in a line on a still air.
        const sway = Math.sin(index * 1.7 + age * 1.3) * 1.5;
        puffs.push({
            x: PIPE_TOP.x + wind.x * age + sway,
            y: PIPE_TOP.y - 2 - SMOKE_RISE_PX_S * age + wind.y * age,
            radius: 1.5 + 3.5 * life,
            alpha: 0.55 * (1 - life),
        });
    }
    return puffs;
}

/** A puff drawn as pixel rows, grey. */
export function puffPixels(puff: SmokePuff): PixelRect[] {
    const radius = Math.max(1, Math.round(puff.radius));
    return ellipse(Math.round(puff.x), Math.round(puff.y), radius, radius, 0xaab0b8, puff.alpha);
}
