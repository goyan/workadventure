/** The flame of a tile on fire is this tall, in map pixels, from a fire just lit to one at its height (two tiles). */
export const FLAME_MIN_HEIGHT_PX = 18;
export const FLAME_MAX_HEIGHT_PX = 64;
/** And this wide at its foot: wider than a tile, so the flames of neighbouring tiles join into one front. */
const FLAME_MIN_WIDTH_PX = 26;
const FLAME_MAX_WIDTH_PX = 44;
/** The wind that lays a flame as far as it leans (km/h), and how far: this share of its height, sideways and down. */
const FLAME_LEAN_WIND_KMH = 80;
const FLAME_MAX_LEAN = 0.75;
const FLAME_MAX_LEAN_DOWN = 0.6;
/** How much the height of a flame breathes over its loop, slow then quick: a flicker, never a flash. */
const FLICKER: readonly { share: number; turns: number; shift: number }[] = [
    { share: 0.11, turns: 1, shift: 0 },
    { share: 0.06, turns: 2, shift: 0.3 },
];
/** The loop of a flame: this many drawn frames, shown at this pace; each tile runs it in its own time. */
export const FLAME_FRAMES = 14;
export const FLAME_FRAMES_PER_SECOND = 12;
/** A drawn frame: this wide and tall (map pixels), the foot of the flame at the middle of its bottom. */
export const FLAME_FRAME_WIDTH_PX = 72;
export const FLAME_FRAME_HEIGHT_PX = 150;
/** How many levels the outline of a flame has between its foot and its tip. */
const OUTLINE_LEVELS = 6;

export interface FlameInput {
    /** The fire of the tile, from 0 to 1. */
    intensity: number;
    /** Where the wind comes from (degrees, 0 north, 90 east) and its speed (km/h). */
    windFrom?: number;
    windSpeed?: number;
    /** The time of the game, in seconds. */
    seconds: number;
    /** The own time of the tile, from 0 to 1 (see tileSeed): its flames do not move with its neighbours'. */
    seed: number;
    reducedMotion: boolean;
}

/** A flame: how tall and how wide at its foot, and where its tip stands off the upright (map pixels). */
export interface Flame {
    height: number;
    width: number;
    tip: { x: number; y: number };
}

const unit = (value: number): number => Math.min(1, Math.max(0, value));

/** Where the wind goes on the map, as a unit vector: a wind from the north blows down the map. */
function windTo(windFrom: number | undefined): { x: number; y: number } {
    const from = ((windFrom !== undefined && Number.isFinite(windFrom) ? windFrom : 0) * Math.PI) / 180;
    return { x: -Math.sin(from), y: Math.cos(from) };
}

function speedOf(windSpeed: number | undefined): number {
    return windSpeed !== undefined && Number.isFinite(windSpeed) ? Math.max(0, windSpeed) : 0;
}

/**
 * The flame of a tile on fire: as tall as its fire is strong, laid by the wind. Its breathing is in the drawn frames
 * (see drawnFlame).
 */
export function flameOf(input: FlameInput): Flame {
    const intensity = unit(input.intensity);
    const height = FLAME_MIN_HEIGHT_PX + (FLAME_MAX_HEIGHT_PX - FLAME_MIN_HEIGHT_PX) * intensity;
    const to = windTo(input.windFrom);
    const lean = Math.min(FLAME_MAX_LEAN, speedOf(input.windSpeed) / FLAME_LEAN_WIND_KMH);
    return {
        height,
        width: FLAME_MIN_WIDTH_PX + (FLAME_MAX_WIDTH_PX - FLAME_MIN_WIDTH_PX) * intensity,
        tip: {
            x: to.x * lean * height + 0,
            // Laid down the screen it would hide behind its own foot: it keeps some height.
            y: Math.min(FLAME_MAX_LEAN_DOWN * height, to.y * lean * height),
        },
    };
}

/**
 * A frame of the loop of a flame, drawn once and shown on every tile on fire: an upright flame at its height that
 * breathes and sways, back where it began after the last frame.
 */
export function drawnFlame(frame: number): Flame {
    const turn = (2 * Math.PI * frame) / FLAME_FRAMES;
    let breath = 1;
    for (const wave of FLICKER) breath += wave.share * Math.sin(wave.turns * turn + 2 * Math.PI * wave.shift);
    return {
        height: FLAME_MAX_HEIGHT_PX * breath,
        width: FLAME_MAX_WIDTH_PX,
        tip: { x: 3 * Math.sin(turn + 1), y: 0 },
    };
}

/** The embers drawn in a frame of the loop, around the foot of the flame: sparks that rise and fade, then again. */
export function drawnEmbers(frame: number): { x: number; y: number; alpha: number }[] {
    const embers: { x: number; y: number; alpha: number }[] = [];
    for (let ember = 0; ember < 3; ember++) {
        const phase = (frame / FLAME_FRAMES + ember / 3) % 1;
        embers.push({
            x: 6 * Math.sin(2 * Math.PI * (phase * 2 + ember / 3)),
            y: -(FLAME_MAX_HEIGHT_PX * 0.6 + phase * (FLAME_FRAME_HEIGHT_PX - FLAME_MAX_HEIGHT_PX * 0.6 - 4)),
            alpha: 1 - phase,
        });
    }
    return embers;
}

/** How a drawn frame is laid on a tile on fire: which frame, how wide and tall, and turned how far (radians). */
/** A loop of drawn frames: how many, and at which pace. The frame after the last is the flame that stands still. */
export interface FlameLoop {
    frames: number;
    framesPerSecond: number;
}
/** The loop of the quick flames. */
export const QUICK_FLAME_LOOP: FlameLoop = { frames: FLAME_FRAMES, framesPerSecond: FLAME_FRAMES_PER_SECOND };

export interface FlamePose {
    frame: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

/**
 * The frame of a tile on fire at a time of the game and how to lay it: as tall as its fire is strong, turned the way
 * the wind lays it, in its own time and at its own pace. For who asked for less motion, the frame after the loop:
 * a flame that stands still, without embers.
 */
export function flamePose(input: FlameInput, loop: FlameLoop = QUICK_FLAME_LOOP): FlamePose {
    const flame = flameOf(input);
    const rise = flame.height - flame.tip.y;
    const pace = 0.8 + 0.4 * ((input.seed * 7) % 1);
    const frame = input.reducedMotion
        ? loop.frames
        : Math.floor(input.seconds * loop.framesPerSecond * pace + input.seed * loop.frames) % loop.frames;
    return {
        frame,
        scaleX: flame.width / FLAME_MAX_WIDTH_PX,
        scaleY: Math.hypot(flame.tip.x, rise) / FLAME_MAX_HEIGHT_PX,
        rotation: Math.atan2(flame.tip.x, rise) || 0,
    };
}

/**
 * The outline of a flame, or of one of its inner tongues (`scale` under 1: smaller, from the same foot), around the
 * middle of its foot: wide at the foot, pointed at the tip, bent towards the tip. Up is negative.
 */
export function flameOutline(flame: Flame, scale: number): { x: number; y: number }[] {
    const height = flame.height * scale;
    const half = (flame.width * scale) / 2;
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let level = 0; level <= OUTLINE_LEVELS; level++) {
        const share = level / OUTLINE_LEVELS;
        // A belly a little above the foot, then a taper to the point.
        const width = half * (1 - share) ** 0.8 * (1 + 0.6 * share);
        const middle = flame.tip.x * scale * share * share;
        const y = -(height * share) + flame.tip.y * scale * share * share;
        left.push({ x: middle - width, y });
        if (level < OUTLINE_LEVELS) right.unshift({ x: middle + width, y });
    }
    return [...left, ...right];
}

/** What burns: the grass gives a pale grey smoke, a tree a thick black one. */
export type SmokeKind = "grass" | "tree";
/** The smoke of each: how many puffs, how opaque the thickest, how wide they start and end, how high they rise. */
const SMOKE: Record<SmokeKind, { alpha: number; from: number; to: number; rise: number }> = {
    grass: { alpha: 0.6, from: 14, to: 46, rise: 190 },
    tree: { alpha: 0.82, from: 18, to: 58, rise: 230 },
};
const SMOKE_PUFFS = 3;
/** A fire smokes from this strong on. */
const SMOKE_FROM_INTENSITY = 0.25;

/**
 * Smoke over a fire: puffs that rise high, widen, thin out and drift downwind; a fire is seen from far by its smoke.
 * Thicker and wider over a tree than over the grass. One still puff for less motion.
 */
export function smokeOf(
    input: FlameInput,
    kind: SmokeKind = "grass",
): { x: number; y: number; radius: number; alpha: number }[] {
    if (input.intensity < SMOKE_FROM_INTENSITY) return [];
    const intensity = unit(input.intensity);
    const smoke = SMOKE[kind];
    // Even a low fire smokes well: half of its smoke at least.
    const thick = smoke.alpha * (0.5 + 0.5 * intensity);
    if (input.reducedMotion) {
        return [{ x: 0, y: -(FLAME_MAX_HEIGHT_PX + 30), radius: (smoke.from + smoke.to) / 2, alpha: thick * 0.6 }];
    }
    const to = windTo(input.windFrom);
    const carried = Math.min(1.5, speedOf(input.windSpeed) / 40);
    const puffs: { x: number; y: number; radius: number; alpha: number }[] = [];
    for (let puff = 0; puff < SMOKE_PUFFS; puff++) {
        const phase = (input.seconds * 0.14 + input.seed * 1.7 + puff / SMOKE_PUFFS) % 1;
        const rise = 44 + phase * smoke.rise;
        puffs.push({
            x: to.x * carried * phase * 150 + Math.sin(phase * 5 + input.seed * 9) * 6,
            y: -rise + to.y * carried * phase * 50,
            radius: smoke.from + phase * (smoke.to - smoke.from),
            // Thin as it leaves the flames (they stay clear), thick above them, then thinning out.
            alpha: thick * Math.min(1, phase * 4) * (1 - phase) ** 0.9 * 1.25,
        });
    }
    return puffs;
}

/** In the heart of a fire a flame is this many times as big as the flame of a tile burning alone. */
const FLAME_MASS_MAX = 2.5;

/**
 * How many times bigger the flame of a tile is drawn when `burning` tiles burn around it, itself counted (two tiles
 * each way: 25 at most): the flames of neighbouring tiles join into one big fire, tall in its heart and lower on its
 * edges, instead of standing side by side like candles.
 */
export function flameMass(burning: number): number {
    if (!Number.isFinite(burning) || burning <= 1) return 1;
    const full = (2 * GLOW_NEIGHBOUR_REACH + 1) ** 2;
    const share = Math.min(1, (burning - 1) / (full - 1));
    return 1 + (FLAME_MASS_MAX - 1) * share ** 0.6;
}

/**
 * The share of its smoke a tile on fire keeps when `burning` tiles burn around it, itself counted: the puffs of
 * neighbours add up, and a front would be a grey wall. A third at least: a big fire still smokes a lot.
 */
export function smokeShare(burning: number): number {
    if (!Number.isFinite(burning) || burning <= 4) return 1;
    return Math.max(1 / 3, 2 / Math.sqrt(burning));
}

/**
 * How many times bigger the smoke is drawn when the map is seen from high (`screenScale`: screen pixels a map pixel):
 * as it is from 1.5 on, then bigger as the map shrinks, three times at most. Seen from high the flames are a few
 * pixels: the smoke is what shows where it burns.
 */
export function smokeFarScale(screenScale: number): number {
    if (!Number.isFinite(screenScale) || screenScale <= 0) return 1;
    return Math.min(3, Math.max(1, 1.5 / screenScale));
}

/** The own time of a tile, from 0 to 1, always the same for a tile: its flames breathe apart from its neighbours'. */
export function tileSeed(tileX: number, tileY: number): number {
    let hash = (Math.imul(tileX, 0x9e3779b1) ^ Math.imul(tileY, 0x85ebca6b)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0;
    return (hash >>> 8) / 0x1000000;
}

/** Flames grow this much at most when they are thinned. */
export const FLAME_MAX_SPREAD_SCALE = 3;

/**
 * The tiles to draw flames on when too many burn in the view: a share of them all over it, always the same ones,
 * and how much bigger to draw them so that the fire looks as full.
 */
export function spreadTiles<T extends { x: number; y: number }>(
    tiles: readonly T[],
    max: number,
): { tiles: T[]; scale: number } {
    if (tiles.length <= max) return { tiles: [...tiles], scale: 1 };
    const share = max / tiles.length;
    const kept = tiles.filter((tile) => tileSeed(tile.x, tile.y) < share);
    if (kept.length === 0) return { tiles: [], scale: 1 };
    return { tiles: kept, scale: Math.min(FLAME_MAX_SPREAD_SCALE, Math.sqrt(tiles.length / kept.length)) };
}

/** Tiles on fire around a flame, itself counted, up to which it keeps its whole glow. */
export const GLOW_FULL_NEIGHBOURS = 3;
/** From this many tiles on fire around a tile, its glow gives way faster still: a thick fire. */
const GLOW_DENSE_FROM = 9;
/** The glow of a flame is shared with the tiles on fire this far around it (a square of 5 tiles). */
export const GLOW_NEIGHBOUR_REACH = 2;

/**
 * How much of its glow a flame keeps among `burning` tiles on fire around it, itself counted. The glows add up: on a
 * thick front, each at its full would whiten the fire into one flat band, the flames lost in it. A flame alone keeps
 * it all; in a thick fire each gives its share, and the front glows about as much as a few flames together.
 */
export function glowShare(burning: number): number {
    const tiles = Math.max(1, burning);
    // Past a small fire the flames are drawn bigger and cover one another (see flameMass): their glows give way
    // faster, or the heart of the fire is one white patch.
    return Math.min(1, GLOW_FULL_NEIGHBOURS / tiles) * Math.min(1, GLOW_DENSE_FROM / tiles);
}
