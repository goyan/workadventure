import { TERRAIN_CELL, TILE_PX } from "../types";
import { TILE_AREA_M2 } from "../Terrain/Scale";
import { cellOf } from "../Terrain/TerrainGrid";
import type { WaterWallSides } from "../Terrain/WaterGrid";
import type { ZombieDart } from "./ZombieDart";

/**
 * A horde of zombies crosses the map the way a player chose: it comes in by the edge it comes from, runs across as a
 * crowd (ZombieCrowd), drawn to the avatars it hears on its way, and goes out by the other side. It keeps out of the
 * water, crosses it by the bridges, goes into the buildings by their doors. Where it runs it tramples the grass and
 * pulls the trees down.
 *
 * What the room is told is a few figures (the seed, the way it goes, its clock, how many they are, how long it lasts),
 * the ground the server froze when it began (zombieTerrainOf: its water, its walls, the collisions of the map) and the
 * log of where the avatars were, step by step (encodeZombieLog): every browser and the thread of the ground step the
 * same crowd from them, the same zombies at the same step. No position of a zombie is ever sent.
 */

/** Map pixels in a metre: a tile is about 1.1 m wide (Terrain/Scale). */
export const ZOMBIE_PX_PER_METRE = TILE_PX / Math.sqrt(TILE_AREA_M2);

/** How many zombies a player may send, and how many by default: a horde, not a handful. */
export const ZOMBIE_MIN_COUNT = 100;
export const ZOMBIE_MAX_COUNT = 4000;
export const ZOMBIE_DEFAULT_COUNT = 2000;
/** How long the horde has to cross the map, minutes: its last zombies are out by then. */
export const ZOMBIE_MIN_MINUTES = 1;
export const ZOMBIE_MAX_MINUTES = 15;
export const ZOMBIE_DEFAULT_MINUTES = 6;
/** Where the horde goes, degrees (0 north, 90 east): westwards. */
export const ZOMBIE_DEFAULT_HEADING = 270;

/** A step of the crowd at the speed of reality: ten a second. */
export const ZOMBIE_STEP_MS = 100;
/** The horde of a room is told this often, so that a player who joins sees it soon. */
export const ZOMBIE_TELL_MS = 1000;
/**
 * The ground the server froze is told to the room with the horde and its whole log this often (and at once), in case
 * a browser lost a message: a player who joins, or misses entries of the log, asks for them (`askWhole`) at once.
 */
export const ZOMBIE_TERRAIN_TELL_MS = 30_000;
/** A browser asks for the whole horde once in this long at most; the server answers a player once in this long. */
export const ZOMBIE_ASK_WHOLE_MS = 2000;
/**
 * Where the avatars are is applied this long (ms of reality) after the server read it: every browser has had it by
 * then, and steps the crowd with it at the same step as the server.
 */
export const ZOMBIE_INPUT_DELAY_MS = 2500;

/** A cell of the ground of a horde: water it keeps out of, its east side closed, its south side closed, a collision. */
export const ZOMBIE_WATER = 1;
export const ZOMBIE_EAST = 2;
export const ZOMBIE_SOUTH = 4;
export const ZOMBIE_SOLID = 8;
/** The water a zombie keeps out of: from a film of 2 px of altitude (7 cm). */
export const ZOMBIE_WATER_PX = 2;

/** A horde as a player asks for it, kept within what a horde may be. */
export interface ZombieHordeAsk {
    count: number;
    durationMs: number;
    /** Where it goes, degrees (0 north, 90 east). */
    heading: number;
}

/**
 * A horde crossing a map, as the server keeps it and tells it. It began at `startedAt` (ms, the time of the server);
 * its clock is its step `anchorStep` at the time `anchorAt`, a step every `msPerStep` (100 at the speed of reality,
 * less when the map is sped up). Its way, in map pixels (east, south), is a unit vector the server computes once.
 */
export interface ZombieHorde extends ZombieHordeAsk {
    id: number;
    /** The luck of the crowd: where each zombie comes in, its pace, its sway. */
    seed: number;
    startedAt: number;
    anchorStep: number;
    anchorAt: number;
    msPerStep: number;
    dirX: number;
    dirY: number;
    anchorX: number;
    anchorY: number;
    /** The size of the map in cells of the relief (16 px), as the server read it. */
    widthCells: number;
    heightCells: number;
    /** The ground of each cell when the horde began (zombieTerrainOf), run-length coded (encodeZombieTerrain). */
    terrain: string;
    /** Where the avatars were, step by step (encodeZombieLog), and the last step that log is complete to. */
    avatars: string;
    safeStep: number;
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

/** The step at which a horde ends: its duration, in steps of reality, whatever the speed of the map. */
export function zombieLastStep(horde: Pick<ZombieHorde, "durationMs">): number {
    return Math.ceil(horde.durationMs / ZOMBIE_STEP_MS);
}

/** The step of the horde at `epoch` (ms, the time of the server): fractional, negative before it began. */
export function zombieStepAt(horde: Pick<ZombieHorde, "anchorStep" | "anchorAt" | "msPerStep">, epoch: number): number {
    return horde.anchorStep + (epoch - horde.anchorAt) / horde.msPerStep;
}

/** Whether the horde goes on at `epoch` (ms, the time of the server): begun, and not at its last step. */
export function zombieHordeGoing(horde: ZombieHorde | undefined, epoch: number): boolean {
    if (!horde || !Number.isFinite(epoch) || epoch < horde.startedAt) return false;
    return zombieStepAt(horde, epoch) < zombieLastStep(horde);
}

/** How long the horde still lasts at `epoch`, whole ms (a field of whole numbers carries it). */
export function zombieMsLeft(horde: ZombieHorde, epoch: number): number {
    return Math.max(0, Math.round((zombieLastStep(horde) - zombieStepAt(horde, epoch)) * horde.msPerStep));
}

/**
 * The horde at `times` the speed of reality from `now`: a step every 100 / times ms, its clock anchored where it is,
 * so that it goes on from the same step without a jump. The same horde when nothing changes.
 */
export function zombieSpedUp(horde: ZombieHorde, times: number, now: number): ZombieHorde {
    const wanted = Number.isFinite(times) && times > 0 ? times : 1;
    const msPerStep = ZOMBIE_STEP_MS / wanted;
    if (Math.abs(msPerStep - horde.msPerStep) < 1e-9) return horde;
    const at = Math.round(now);
    return { ...horde, anchorStep: zombieStepAt(horde, at), anchorAt: at, msPerStep };
}

/**
 * The ground of each cell of a map `width` x `height` cells, as the horde reads it: ZOMBIE_WATER where the water is
 * 2 px deep at least (not on the deck of a bridge, `dry`), ZOMBIE_EAST and ZOMBIE_SOUTH where a wall closes its side
 * (the walls of the map, doors open: waterWallsOf), ZOMBIE_SOLID in a tile (32 px) the collisions of the map close
 * (`solid`, as the browser of the player who sent the horde reads them).
 */
export function zombieTerrainOf(
    width: number,
    height: number,
    depthAt: (cellX: number, cellY: number) => number,
    dry: (cellX: number, cellY: number) => boolean = () => false,
    walls?: WaterWallSides,
    solid: (tileX: number, tileY: number) => boolean = () => false,
): Uint8Array {
    const cells = new Uint8Array(Math.max(0, width * height));
    const cellsATile = TILE_PX / TERRAIN_CELL;
    for (let cellY = 0; cellY < height; cellY++) {
        for (let cellX = 0; cellX < width; cellX++) {
            let bits = 0;
            if (!dry(cellX, cellY) && depthAt(cellX, cellY) >= ZOMBIE_WATER_PX) bits |= ZOMBIE_WATER;
            if (solid(Math.floor(cellX / cellsATile), Math.floor(cellY / cellsATile))) bits |= ZOMBIE_SOLID;
            cells[cellY * width + cellX] = bits;
        }
    }
    for (const [sides, bit] of [
        [walls?.east, ZOMBIE_EAST],
        [walls?.south, ZOMBIE_SOUTH],
    ] as const) {
        for (const key of sides ?? []) {
            const { x, y } = cellOf(key);
            if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] |= bit;
        }
    }
    return cells;
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
        bits = ((bits << 6) | value) & 0xffff;
        kept += 6;
        if (kept >= 8) {
            kept -= 8;
            bytes.push((bits >> kept) & 255);
        }
    }
    return bytes;
}

function pushVarint(bytes: number[], value: number): void {
    let left = Math.max(0, Math.floor(value));
    while (left >= 128) {
        bytes.push((left & 127) | 128);
        left = Math.floor(left / 128);
    }
    bytes.push(left);
}

function readVarint(bytes: readonly number[], at: { read: number }): number {
    let value = 0;
    let scale = 1;
    while (at.read < bytes.length) {
        const byte = bytes[at.read++];
        value += (byte & 127) * scale;
        if (byte < 128) break;
        scale *= 128;
    }
    return value;
}

/**
 * The ground of the cells of a horde (or any bytes), as it is told: runs of the same byte, row after row, each the
 * byte and the length of the run in a variable number of bytes (7 bits each), in base64. An empty map is a few bytes.
 */
export function encodeZombieTerrain(cells: Uint8Array): string {
    const bytes: number[] = [];
    let at = 0;
    while (at < cells.length) {
        const value = cells[at];
        let run = 1;
        while (at + run < cells.length && cells[at + run] === value) run++;
        bytes.push(value);
        pushVarint(bytes, run);
        at += run;
    }
    return base64Of(bytes);
}

/** The `size` bytes encodeZombieTerrain told: 0 where it says nothing. */
export function decodeZombieTerrain(text: string, size: number): Uint8Array {
    const cells = new Uint8Array(Math.max(0, size));
    const bytes = bytesOfBase64(text);
    const at = { read: 0 };
    let filled = 0;
    while (at.read < bytes.length && filled < cells.length) {
        const value = bytes[at.read++];
        const end = Math.min(cells.length, filled + readVarint(bytes, at));
        if (value !== 0) cells.fill(value, filled, end);
        filled = end;
    }
    return cells;
}

/** A short number that tells two texts apart (FNV-1a): a horde told again keeps its crowd. */
export function zombieTerrainHash(text: string): number {
    let hash = 0x811c9dc5;
    for (let at = 0; at < text.length; at++) {
        hash ^= text.charCodeAt(at);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/**
 * What changed of the avatars at a step of the horde: each avatar (by its slot, numbered in the order the server first
 * saw them) now on that tile, or gone (-1).
 */
export interface ZombieLogEntry {
    applyStep: number;
    changes: { slot: number; tile: number }[];
    /**
     * The grenades that go off at this step (ZombieGrenade): shot from a point to a point (map pixels, whole), their
     * fuse lit ZOMBIE_GRENADE_FUSE_STEPS steps before. Absent when there is none.
     */
    grenades?: { fromX: number; fromY: number; toX: number; toY: number }[];
    /**
     * The darts of the Nerf whose flight is over by this step (ZombieDart): the zombie each met first is killed now.
     * Absent when there is none.
     */
    darts?: ZombieDart[];
}

/** A whole number that may be negative, as a variable number of bytes: 0, -1, 1, -2, 2… as 0, 1, 2, 3, 4… */
function zigzag(value: number): number {
    const whole = Math.round(value);
    return whole >= 0 ? whole * 2 : -whole * 2 - 1;
}

function unzigzag(value: number): number {
    return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

/**
 * The log of the avatars, as it is told: for each entry its step, its changes, its grenades, then its darts (where
 * each is shot from, the way to its end, how many steps before the entry it was shot, the steps of a tick).
 */
export function encodeZombieLog(entries: readonly ZombieLogEntry[]): string {
    const bytes: number[] = [];
    for (const entry of entries) {
        pushVarint(bytes, entry.applyStep);
        pushVarint(bytes, entry.changes.length);
        for (const change of entry.changes) {
            pushVarint(bytes, change.slot);
            pushVarint(bytes, change.tile + 1);
        }
        const grenades = entry.grenades ?? [];
        pushVarint(bytes, grenades.length);
        for (const grenade of grenades) {
            pushVarint(bytes, grenade.fromX);
            pushVarint(bytes, grenade.fromY);
            pushVarint(bytes, grenade.toX);
            pushVarint(bytes, grenade.toY);
        }
        const darts = entry.darts ?? [];
        pushVarint(bytes, darts.length);
        for (const dart of darts) {
            pushVarint(bytes, dart.fromX);
            pushVarint(bytes, dart.fromY);
            pushVarint(bytes, zigzag(dart.toX - dart.fromX));
            pushVarint(bytes, zigzag(dart.toY - dart.fromY));
            pushVarint(bytes, entry.applyStep - dart.shotStep);
            pushVarint(bytes, dart.stride);
        }
    }
    return base64Of(bytes);
}

export function decodeZombieLog(text: string): ZombieLogEntry[] {
    const bytes = bytesOfBase64(text);
    const at = { read: 0 };
    const entries: ZombieLogEntry[] = [];
    while (at.read < bytes.length) {
        const step = readVarint(bytes, at);
        const count = readVarint(bytes, at);
        const changes: { slot: number; tile: number }[] = [];
        for (let change = 0; change < count && at.read < bytes.length; change++) {
            const slot = readVarint(bytes, at);
            changes.push({ slot, tile: readVarint(bytes, at) - 1 });
        }
        const shots = readVarint(bytes, at);
        const grenades: { fromX: number; fromY: number; toX: number; toY: number }[] = [];
        for (let shot = 0; shot < shots && at.read < bytes.length; shot++) {
            const fromX = readVarint(bytes, at);
            const fromY = readVarint(bytes, at);
            const toX = readVarint(bytes, at);
            grenades.push({ fromX, fromY, toX, toY: readVarint(bytes, at) });
        }
        const thrown = readVarint(bytes, at);
        const darts: ZombieDart[] = [];
        for (let dart = 0; dart < thrown && at.read < bytes.length; dart++) {
            const fromX = readVarint(bytes, at);
            const fromY = readVarint(bytes, at);
            const toX = fromX + unzigzag(readVarint(bytes, at));
            const toY = fromY + unzigzag(readVarint(bytes, at));
            const shotStep = step - readVarint(bytes, at);
            darts.push({ fromX, fromY, toX, toY, shotStep, stride: readVarint(bytes, at) });
        }
        entries.push({
            applyStep: step,
            changes,
            ...(grenades.length > 0 ? { grenades } : {}),
            ...(darts.length > 0 ? { darts } : {}),
        });
    }
    return entries;
}

/**
 * The entries of a log by their step, those of a same step in the order they were told (an insertion, stable): the
 * grenades are told with the step they go off at, after the avatars told before them for earlier steps.
 */
export function zombieLogInOrder(entries: readonly ZombieLogEntry[]): ZombieLogEntry[] {
    const ordered: ZombieLogEntry[] = [];
    for (const entry of entries) {
        let at = ordered.length;
        while (at > 0 && ordered[at - 1].applyStep > entry.applyStep) at--;
        ordered.splice(at, 0, entry);
    }
    return ordered;
}

/** The cells of the relief in a tile. */
export const ZOMBIE_CELLS_A_TILE = TILE_PX / TERRAIN_CELL;

/**
 * The collisions of a map as a horde reads them, from the grid the browser walks its avatar by (`grid[tileY][tileX]`,
 * 1 where one does not walk): a byte a tile, run-length coded (encodeZombieTerrain), what the player who sends a
 * horde sends with it. The tiles of the doors stay open (`doors`: their leaves, the sides of cells they close): a
 * horde goes in by them, as the avatars do.
 */
export function zombieCollisionsOf(
    grid: readonly (readonly number[])[],
    doors: readonly { east: readonly string[]; south: readonly string[] }[] = [],
): { collisions: string; collisionsWidth: number; collisionsHeight: number } {
    const height = grid.length;
    const width = height > 0 ? grid[0].length : 0;
    const tiles = new Uint8Array(width * height);
    for (let tileY = 0; tileY < height; tileY++) {
        const row = grid[tileY];
        for (let tileX = 0; tileX < width; tileX++) if (row[tileX] === 1) tiles[tileY * width + tileX] = 1;
    }
    const open = (cellX: number, cellY: number): void => {
        const tileX = Math.floor(cellX / ZOMBIE_CELLS_A_TILE);
        const tileY = Math.floor(cellY / ZOMBIE_CELLS_A_TILE);
        if (tileX >= 0 && tileY >= 0 && tileX < width && tileY < height) tiles[tileY * width + tileX] = 0;
    };
    for (const door of doors) {
        for (const key of door.east) {
            const { x, y } = cellOf(key);
            open(x, y);
            open(x + 1, y);
        }
        for (const key of door.south) {
            const { x, y } = cellOf(key);
            open(x, y);
            open(x, y + 1);
        }
    }
    return { collisions: encodeZombieTerrain(tiles), collisionsWidth: width, collisionsHeight: height };
}
