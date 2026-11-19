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
/** How much the height of a flame breathes, slow then quick: a flicker, never a flash. */
const FLICKER: readonly { share: number; hertz: number; shift: number }[] = [
    { share: 0.11, hertz: 0.9, shift: 1 },
    { share: 0.06, hertz: 2.1, shift: 7 },
];
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
 * The flame of a tile on fire at a time of the game: as tall as its fire is strong, laid by the wind, breathing in
 * its own time. For who asked for less motion it stands still.
 */
export function flameOf(input: FlameInput): Flame {
    const intensity = unit(input.intensity);
    let breath = 1;
    let sway = 0;
    if (!input.reducedMotion) {
        for (const wave of FLICKER) {
            breath += wave.share * Math.sin(2 * Math.PI * (wave.hertz * input.seconds + wave.shift * input.seed));
        }
        sway = 3 * Math.sin(2 * Math.PI * (0.7 * input.seconds + 3 * input.seed));
    }
    const height = (FLAME_MIN_HEIGHT_PX + (FLAME_MAX_HEIGHT_PX - FLAME_MIN_HEIGHT_PX) * intensity) * breath;
    const to = windTo(input.windFrom);
    const lean = Math.min(FLAME_MAX_LEAN, speedOf(input.windSpeed) / FLAME_LEAN_WIND_KMH);
    return {
        height,
        width: FLAME_MIN_WIDTH_PX + (FLAME_MAX_WIDTH_PX - FLAME_MIN_WIDTH_PX) * intensity,
        tip: {
            x: to.x * lean * height + sway,
            // Laid down the screen it would hide behind its own foot: it keeps some height.
            y: Math.min(FLAME_MAX_LEAN_DOWN * height, to.y * lean * height),
        },
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

/** Embers over a tile on fire: a few sparks rising and carried downwind, fading. None for a weak fire nor less motion. */
export function embersOf(input: FlameInput): { x: number; y: number; alpha: number }[] {
    if (input.reducedMotion || input.intensity < 0.3) return [];
    const to = windTo(input.windFrom);
    const carried = Math.min(1, speedOf(input.windSpeed) / 60);
    const embers: { x: number; y: number; alpha: number }[] = [];
    for (let ember = 0; ember < 3; ember++) {
        const phase = (input.seconds * 0.45 + input.seed + ember / 3) % 1;
        const rise = phase * (60 + 70 * unit(input.intensity));
        embers.push({
            x: to.x * carried * rise * 0.8 + 5 * Math.sin(2 * Math.PI * (phase * 2 + ember / 3)),
            y: Math.min(0, -rise + to.y * carried * rise * 0.4),
            alpha: 1 - phase,
        });
    }
    return embers;
}

/** Smoke over a strong fire: puffs that rise, widen, thin out and drift downwind. One still puff for less motion. */
export function smokeOf(input: FlameInput): { x: number; y: number; radius: number; alpha: number }[] {
    if (input.intensity < 0.4) return [];
    const intensity = unit(input.intensity);
    if (input.reducedMotion) return [{ x: 0, y: -(FLAME_MAX_HEIGHT_PX + 20), radius: 14, alpha: 0.2 * intensity }];
    const to = windTo(input.windFrom);
    const carried = Math.min(1.5, speedOf(input.windSpeed) / 40);
    const puffs: { x: number; y: number; radius: number; alpha: number }[] = [];
    for (let puff = 0; puff < 2; puff++) {
        const phase = (input.seconds * 0.18 + input.seed * 1.7 + puff / 2) % 1;
        const rise = 50 + phase * 110;
        puffs.push({
            x: to.x * carried * phase * 90,
            y: -rise + to.y * carried * phase * 30,
            radius: 8 + phase * 16,
            alpha: 0.3 * (1 - phase) * intensity,
        });
    }
    return puffs;
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
