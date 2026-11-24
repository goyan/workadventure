import { TERRAIN_CELL } from "../types";
import type { Animal } from "./Animal";

/**
 * Fishing in the water of the relief: the rules of a line, pure, run by the server before each step of the life (see
 * FishingManager in back). The fish at the end of a line are the fish of the map: a line only tells one where to
 * swim, the life goes on moving it, feeding the dolphins with it and letting it die.
 */

/** A tile is 32 map pixels: casts are counted in tiles. */
const TILE_PX = 32;
/** The cast goes from one tile to eight, the key held for a second and a half. */
export const FISHING_CAST_MIN_TILES = 1;
export const FISHING_CAST_MAX_TILES = 8;
export const FISHING_CHARGE_MS = 1500;
/** The server accepts a float this far from its angler: the longest cast and a tile of tolerance. */
export const FISHING_MAX_CAST_PX = (FISHING_CAST_MAX_TILES + 1) * TILE_PX;
/** A fish this close to a float (four cells) may come to it. */
export const FISHING_LURE_REACH_PX = 4 * TERRAIN_CELL;
/** A curious fish that went further than this (frightened, stopped by a shore) gives up. */
export const FISHING_LOSE_REACH_PX = 6 * TERRAIN_CELL;
/** It bites when it is this close to the float. */
export const FISHING_BITE_REACH_PX = TERRAIN_CELL;
/** The chance, at each step of the life, that a line draws the nearest free fish. */
export const FISHING_INTEREST_CHANCE = 0.06;
/** How long the angler has to hook a biting fish. */
export const FISHING_HOOK_WINDOW_MS = 2000;
/** A fish that got away, or was let go, bites nobody's line for this long. */
export const FISHING_WARY_MS = 60_000;
/** Bringing a fish in takes from one second to four, by its weight. */
export const FISHING_REEL_MIN_MS = 1000;
export const FISHING_REEL_MAX_MS = 4000;
/** A room holds this many lines, a player one, cast a second apart at least. */
export const FISHING_MAX_LINES = 20;
export const FISHING_CAST_COOLDOWN_MS = 1000;
/** An angler who moved further than this from where they cast brings their line back. */
export const FISHING_MOVE_TOLERANCE_PX = 8;
/** An adult fish weighs between these, a newborn a twentieth of its adult weight. */
export const FISHING_ADULT_MIN_GRAMS = 300;
export const FISHING_ADULT_MAX_GRAMS = 3000;
const NEWBORN_SHARE = 0.05;
/** A curious fish is kept from leaving for a mate until the next steps of the life. */
const HOLD_MS = 1000;

export type FishingDirection = "up" | "down" | "left" | "right";
export type FishingLineState = "waiting" | "bite" | "reeling";

export interface FishingLine {
    userId: number;
    /** Where the float is, in map pixels. */
    x: number;
    y: number;
    state: FishingLineState;
    /** The fish that comes to the float, bites it or is brought in. */
    fishId?: number;
    /** Since when the line is in this state. */
    since: number;
    /** Reeling: how long it takes, and what the fish weighed when it was hooked. */
    reelMs?: number;
    grams?: number;
    /** Where the angler stood when they cast. */
    anglerX: number;
    anglerY: number;
}

export interface FishingState {
    /** The line of each player, by user id. */
    lines: Map<number, FishingLine>;
    /** Until when each wary fish bites nothing, by animal id. */
    wary: Map<number, number>;
    /** When each player last tried to cast. */
    lastCast: Map<number, number>;
}

export type FishingEvent =
    | { type: "bite" | "missed" | "lost" | "retrieved" | "refused"; userId: number }
    | { type: "caught"; userId: number; fishId: number; sex: "male" | "female"; grams: number };

export const emptyFishing = (): FishingState => ({ lines: new Map(), wary: new Map(), lastCast: new Map() });

/** How far the cast goes, in tiles, for a key held this long. */
export function castTiles(heldMs: number): number {
    const share = Math.max(0, Math.min(1, heldMs / FISHING_CHARGE_MS));
    return FISHING_CAST_MIN_TILES + (FISHING_CAST_MAX_TILES - FISHING_CAST_MIN_TILES) * share;
}

/** Where the float lands: straight in front of the avatar. */
export function castPoint(x: number, y: number, direction: FishingDirection, tiles: number): { x: number; y: number } {
    const reach = Math.round(tiles * TILE_PX);
    switch (direction) {
        case "up":
            return { x, y: y - reach };
        case "down":
            return { x, y: y + reach };
        case "left":
            return { x: x - reach, y };
        case "right":
            return { x: x + reach, y };
    }
}

/**
 * What a fish weighs as an adult, in grams: drawn from its id, so the same fish weighs the same for everyone and
 * nothing is saved. Heavy ones are rarer than light ones.
 */
export function adultGrams(id: number): number {
    let hash = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    const draw = (hash >>> 0) / 0x100000000;
    return Math.round(FISHING_ADULT_MIN_GRAMS + (FISHING_ADULT_MAX_GRAMS - FISHING_ADULT_MIN_GRAMS) * draw * draw);
}

/** What a fish weighs now: it grows until the middle of its life. */
export function fishGrams(fish: Pick<Animal, "id" | "bornAt" | "lifespanMs">, now: number): number {
    const grown = Math.max(0, Math.min(1, (now - fish.bornAt) / (fish.lifespanMs / 2)));
    return Math.round(adultGrams(fish.id) * (NEWBORN_SHARE + (1 - NEWBORN_SHARE) * grown));
}

/** How long a fish of this weight takes to bring in. */
export function reelMsOf(grams: number): number {
    const share = Math.max(0, Math.min(1, grams / FISHING_ADULT_MAX_GRAMS));
    return Math.round(FISHING_REEL_MIN_MS + (FISHING_REEL_MAX_MS - FISHING_REEL_MIN_MS) * share);
}

/**
 * A player casts: their line is put where the float lands, in place of the one they had. Refused when the float is
 * out of reach or out of the water where fish live (`swimmable`, in map pixels), less than a second after their last
 * try, or when the room has all its lines.
 */
export function castLine(
    state: FishingState,
    cast: { userId: number; x: number; y: number; anglerX: number; anglerY: number },
    swimmable: (x: number, y: number) => boolean,
    now: number,
): FishingEvent[] {
    const refused: FishingEvent[] = [{ type: "refused", userId: cast.userId }];
    const last = state.lastCast.get(cast.userId);
    if (last !== undefined && now - last < FISHING_CAST_COOLDOWN_MS) return refused;
    state.lastCast.set(cast.userId, now);
    if (![cast.x, cast.y, cast.anglerX, cast.anglerY].every(Number.isFinite)) return refused;
    if (Math.hypot(cast.x - cast.anglerX, cast.y - cast.anglerY) > FISHING_MAX_CAST_PX) return refused;
    if (!state.lines.has(cast.userId) && state.lines.size >= FISHING_MAX_LINES) return refused;
    if (!swimmable(cast.x, cast.y)) return refused;
    state.lines.set(cast.userId, {
        userId: cast.userId,
        x: cast.x,
        y: cast.y,
        state: "waiting",
        since: now,
        anglerX: cast.anglerX,
        anglerY: cast.anglerY,
    });
    return [];
}

/** The key again: a biting fish is hooked and brought in; without a bite the line comes back. */
export function reelLine(state: FishingState, userId: number, animals: readonly Animal[], now: number): FishingEvent[] {
    const line = state.lines.get(userId);
    if (!line) return [];
    if (line.state === "reeling") return [];
    const fish = line.state === "bite" ? animals.find((animal) => animal.id === line.fishId) : undefined;
    if (!fish) {
        state.lines.delete(userId);
        return [{ type: "retrieved", userId }];
    }
    line.state = "reeling";
    line.since = now;
    line.grams = fishGrams(fish, now);
    line.reelMs = reelMsOf(line.grams);
    return [];
}

/**
 * The lines of a room, just before a step of the life. The lines of the anglers who left or walked come back; a
 * waiting line may draw the nearest free fish, which bites when it reaches the float, gets away when it is not hooked
 * in time, and is let go once brought in. A fish on a line is told to swim to the float: the life moves it.
 *
 * `anglers` are where the players who may fish stand, in map pixels, by user id.
 */
export function stepFishing(
    state: FishingState,
    animals: Animal[],
    anglers: ReadonlyMap<number, { x: number; y: number }>,
    maxSpeedPxPerS: number,
    now: number,
    random: () => number,
): FishingEvent[] {
    const events: FishingEvent[] = [];
    for (const [id, until] of state.wary) if (until <= now) state.wary.delete(id);
    for (const [userId, at] of state.lastCast) if (now - at >= FISHING_CAST_COOLDOWN_MS) state.lastCast.delete(userId);
    if (state.lines.size === 0) return events;

    const byId = new Map<number, Animal>();
    for (const animal of animals) byId.set(animal.id, animal);
    const led = new Set<number>();
    for (const line of state.lines.values()) if (line.fishId !== undefined) led.add(line.fishId);
    const far = (line: FishingLine, fish: Animal): number => Math.hypot(fish.x - line.x, fish.y - line.y);
    const release = (line: FishingLine): void => {
        if (line.fishId !== undefined) led.delete(line.fishId);
        line.fishId = undefined;
        line.state = "waiting";
        line.since = now;
        line.reelMs = line.grams = undefined;
    };

    for (const line of [...state.lines.values()]) {
        const angler = anglers.get(line.userId);
        if (!angler || Math.hypot(angler.x - line.anglerX, angler.y - line.anglerY) > FISHING_MOVE_TOLERANCE_PX) {
            if (line.fishId !== undefined) led.delete(line.fishId);
            state.lines.delete(line.userId);
            events.push({ type: "retrieved", userId: line.userId });
            continue;
        }
        let fish = line.fishId === undefined ? undefined : byId.get(line.fishId);

        if (line.state === "reeling") {
            if (!fish) {
                // Eaten, or dead, on its way in.
                if (line.fishId !== undefined) led.delete(line.fishId);
                state.lines.delete(line.userId);
                events.push({ type: "lost", userId: line.userId });
            } else if (now - line.since >= (line.reelMs ?? FISHING_REEL_MIN_MS)) {
                state.lines.delete(line.userId);
                led.delete(fish.id);
                state.wary.set(fish.id, now + FISHING_WARY_MS);
                events.push({
                    type: "caught",
                    userId: line.userId,
                    fishId: fish.id,
                    sex: fish.sex === "male" ? "male" : "female",
                    grams: line.grams ?? fishGrams(fish, now),
                });
            } else {
                lead(fish, line, maxSpeedPxPerS, now);
            }
            continue;
        }

        if (line.state === "bite") {
            if (!fish) {
                release(line);
            } else if (now - line.since > FISHING_HOOK_WINDOW_MS) {
                state.wary.set(fish.id, now + FISHING_WARY_MS);
                release(line);
                events.push({ type: "missed", userId: line.userId });
            } else {
                lead(fish, line, maxSpeedPxPerS, now);
            }
            continue;
        }

        // Waiting: its curious fish may have died or gone away.
        if (line.fishId !== undefined && (!fish || far(line, fish) > FISHING_LOSE_REACH_PX)) {
            release(line);
            fish = undefined;
        }
        if (!fish && random() < FISHING_INTEREST_CHANCE) {
            let least = FISHING_LURE_REACH_PX;
            for (const animal of animals) {
                if (animal.kind !== "fish" || led.has(animal.id) || state.wary.has(animal.id)) continue;
                const distance = far(line, animal);
                if (distance <= least) {
                    least = distance;
                    fish = animal;
                }
            }
            if (fish) {
                line.fishId = fish.id;
                led.add(fish.id);
            }
        }
        if (!fish) continue;
        lead(fish, line, maxSpeedPxPerS, now);
        if (far(line, fish) <= FISHING_BITE_REACH_PX) {
            line.state = "bite";
            line.since = now;
            events.push({ type: "bite", userId: line.userId });
        }
    }
    return events;
}

/** Tells a fish to swim to the float of a line, and not to leave for a mate meanwhile. */
function lead(fish: Animal, line: FishingLine, maxSpeedPxPerS: number, now: number): void {
    fish.targetX = line.x;
    fish.targetY = line.y;
    fish.speed = maxSpeedPxPerS;
    fish.wanderUntil = now + HOLD_MS;
}
