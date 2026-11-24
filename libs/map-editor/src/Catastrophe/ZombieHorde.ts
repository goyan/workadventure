import { TERRAIN_CELL, TILE_PX } from "../types";
import { TILE_AREA_M2 } from "../Terrain/Scale";

/**
 * A horde of zombies crosses the map the way a player chose: it comes in by the edge it comes from, a broad column a
 * few tens of metres wide, walks across as a crowd (ZombieCrowd), and goes out by the other side. Where it walks it
 * tramples the grass and pulls the trees down; the avatars are not touched, it walks through them.
 *
 * What the room is told is a few figures (the seed, the way it goes, when it began, how many they are, how long it
 * lasts) and, once, the water the server saw on the map when it began (zombieTerrainOf): every browser and the thread
 * of the ground step the same crowd from them, the same zombies at the same step. No position is ever sent.
 */

/** Map pixels in a metre: a tile is about 1.1 m wide (Terrain/Scale). */
export const ZOMBIE_PX_PER_METRE = TILE_PX / Math.sqrt(TILE_AREA_M2);

/** How many zombies a player may send, and how many by default: a horde, not a handful. */
export const ZOMBIE_MIN_COUNT = 100;
export const ZOMBIE_MAX_COUNT = 4000;
export const ZOMBIE_DEFAULT_COUNT = 2000;
/** How long the horde takes to cross the map, minutes: its head comes in, its tail goes out. */
export const ZOMBIE_MIN_MINUTES = 1;
export const ZOMBIE_MAX_MINUTES = 15;
export const ZOMBIE_DEFAULT_MINUTES = 6;
/** Where the horde goes, degrees (0 north, 90 east): westwards. */
export const ZOMBIE_DEFAULT_HEADING = 270;

/** The horde of a room is told this often, so that a player who joins sees it soon. */
export const ZOMBIE_TELL_MS = 1000;
/** The water the server saw is told with the horde this often (and at once): a player who joins waits that long. */
export const ZOMBIE_TERRAIN_TELL_MS = 5000;

/**
 * The water on a cell, as the horde reads it once when it begins (depths in pixels of altitude, a tile of altitude as
 * high as a tile is wide, 1.1 m):
 * - dry, under a film of 2 px (7 cm);
 * - shallow, to 16 px (55 cm, the knee to the thigh);
 * - deep, to 40 px (1.4 m, the waist to the chest);
 * - over the head beyond: the zombies walk on the bottom, as zombies do.
 */
export const ZOMBIE_DRY = 0;
export const ZOMBIE_SHALLOW = 1;
export const ZOMBIE_DEEP = 2;
export const ZOMBIE_UNDER = 3;
export const ZOMBIE_SHALLOW_PX = 2;
export const ZOMBIE_DEEP_PX = 16;
export const ZOMBIE_UNDER_PX = 40;

/**
 * How fast a zombie walks in each of those waters, as a share of its pace on dry land: a choice, the pace falling
 * with the depth, to a crawl on the bottom.
 */
export const ZOMBIE_WATER_PACE: readonly number[] = [1, 0.6, 0.3, 0.15];

/** A horde as a player asks for it, kept within what a horde may be. */
export interface ZombieHordeAsk {
    count: number;
    durationMs: number;
    /** Where it goes, degrees (0 north, 90 east). */
    heading: number;
}

/**
 * A horde crossing a map, as the server keeps it and tells it: since `startedAt` (ms, the time of the server), from
 * the edge it comes from, the way (dirX, dirY) goes (map pixels: east, south; a unit vector the server computes once,
 * so that nobody computes it again with a sine of their own), its middle over (anchorX, anchorY).
 */
export interface ZombieHorde extends ZombieHordeAsk {
    id: number;
    /** The luck of the crowd: where each zombie comes in, its pace, its sway. */
    seed: number;
    startedAt: number;
    dirX: number;
    dirY: number;
    anchorX: number;
    anchorY: number;
    /** The size of the map in cells of the relief (16 px), as the server read it. */
    widthCells: number;
    heightCells: number;
    /** The water of each cell when the horde began (zombieTerrainOf), run-length coded (encodeZombieTerrain). */
    terrain: string;
}

export function zombieCount(count: number | undefined): number {
    if (count === undefined || !Number.isFinite(count) || count === 0) return ZOMBIE_DEFAULT_COUNT;
    return Math.min(ZOMBIE_MAX_COUNT, Math.max(ZOMBIE_MIN_COUNT, Math.round(count)));
}

export function zombieMinutes(minutes: number | undefined): number {
    if (minutes === undefined || !Number.isFinite(minutes) || minutes === 0) return ZOMBIE_DEFAULT_MINUTES;
    return Math.min(ZOMBIE_MAX_MINUTES, Math.max(ZOMBIE_MIN_MINUTES, Math.round(minutes)));
}

export function zombieHeading(heading: number | undefined): number {
    if (heading === undefined || !Number.isFinite(heading)) return ZOMBIE_DEFAULT_HEADING;
    return ((Math.round(heading) % 360) + 360) % 360;
}

/** What a player asks for, kept within bounds. */
export function zombieAsk(asked: { count?: number; minutes?: number; heading?: number }): ZombieHordeAsk {
    return {
        count: zombieCount(asked.count),
        durationMs: zombieMinutes(asked.minutes) * 60_000,
        heading: zombieHeading(asked.heading),
    };
}

/** The way a heading goes, in map pixels (east, south): computed by the server alone, then told. */
export function zombieDirection(heading: number): { dirX: number; dirY: number } {
    const angle = (zombieHeading(heading) * Math.PI) / 180;
    const dirX = Math.sin(angle);
    const dirY = -Math.cos(angle);
    // Exactly on an axis when it is one: no east of 1e-16 on a horde going north.
    const clean = (value: number): number => (Math.abs(value) < 1e-12 ? 0 : value);
    return { dirX: clean(dirX), dirY: clean(dirY) };
}

/** Whether the horde ended at `epoch` (ms, the time of the server), or has not begun. */
export function zombieHordeGoing(horde: ZombieHorde | undefined, epoch: number): boolean {
    if (!horde || !Number.isFinite(epoch)) return false;
    const since = epoch - horde.startedAt;
    return since >= 0 && since < horde.durationMs;
}

/**
 * The water of each cell of a map `width` x `height` cells, as the horde reads it (ZOMBIE_DRY to ZOMBIE_UNDER), from
 * the depth of the water on it in pixels; `dry` says a cell is walked on dry whatever is under it (the deck of a
 * bridge).
 */
export function zombieTerrainOf(
    width: number,
    height: number,
    depthAt: (cellX: number, cellY: number) => number,
    dry: (cellX: number, cellY: number) => boolean = () => false,
): Uint8Array {
    const classes = new Uint8Array(Math.max(0, width * height));
    for (let cellY = 0; cellY < height; cellY++) {
        for (let cellX = 0; cellX < width; cellX++) {
            if (dry(cellX, cellY)) continue;
            const depth = depthAt(cellX, cellY);
            if (!(depth >= ZOMBIE_SHALLOW_PX)) continue;
            classes[cellY * width + cellX] =
                depth >= ZOMBIE_UNDER_PX ? ZOMBIE_UNDER : depth >= ZOMBIE_DEEP_PX ? ZOMBIE_DEEP : ZOMBIE_SHALLOW;
        }
    }
    return classes;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Of(bytes: readonly number[]): string {
    let text = "";
    for (let at = 0; at < bytes.length; at += 3) {
        const a = bytes[at];
        const b = at + 1 < bytes.length ? bytes[at + 1] : 0;
        const c = at + 2 < bytes.length ? bytes[at + 2] : 0;
        text += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)];
        text += at + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : "=";
        text += at + 2 < bytes.length ? BASE64[c & 63] : "=";
    }
    return text;
}

function bytesOfBase64(text: string): number[] {
    const bytes: number[] = [];
    let bits = 0;
    let kept = 0;
    for (const char of text) {
        if (char === "=") break;
        const value = BASE64.indexOf(char);
        if (value < 0) continue;
        bits = (bits << 6) | value;
        kept += 6;
        if (kept >= 8) {
            kept -= 8;
            bytes.push((bits >> kept) & 255);
        }
    }
    return bytes;
}

/**
 * The water of the cells of a horde, as it is told: runs of the same water, row after row, each a byte of its water
 * and the length of the run in a variable number of bytes (7 bits each), in base64. A map without water is a few bytes.
 */
export function encodeZombieTerrain(classes: Uint8Array): string {
    const bytes: number[] = [];
    let at = 0;
    while (at < classes.length) {
        const value = classes[at];
        let run = 1;
        while (at + run < classes.length && classes[at + run] === value) run++;
        bytes.push(value);
        let left = run;
        while (left >= 128) {
            bytes.push((left & 127) | 128);
            left = Math.floor(left / 128);
        }
        bytes.push(left);
        at += run;
    }
    return base64Of(bytes);
}

/** The water of `size` cells from what encodeZombieTerrain told: dry where it says nothing, or anything wrong. */
export function decodeZombieTerrain(text: string, size: number): Uint8Array {
    const classes = new Uint8Array(Math.max(0, size));
    const bytes = bytesOfBase64(text);
    let at = 0;
    let read = 0;
    while (read < bytes.length && at < classes.length) {
        const value = Math.min(ZOMBIE_UNDER, bytes[read++]);
        let run = 0;
        let scale = 1;
        while (read < bytes.length) {
            const byte = bytes[read++];
            run += (byte & 127) * scale;
            if (byte < 128) break;
            scale *= 128;
        }
        const end = Math.min(classes.length, at + run);
        if (value !== ZOMBIE_DRY) classes.fill(value, at, end);
        at = end;
    }
    return classes;
}

/** A short number that tells two terrains apart (FNV-1a over the text): a horde told again keeps its crowd. */
export function zombieTerrainHash(text: string): number {
    let hash = 0x811c9dc5;
    for (let at = 0; at < text.length; at++) {
        hash ^= text.charCodeAt(at);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/** The cells of the relief in a tile. */
export const ZOMBIE_CELLS_A_TILE = TILE_PX / TERRAIN_CELL;
