import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import {
    adultGrams,
    castLine,
    castPoint,
    castTiles,
    emptyFishing,
    FISHING_MAX_CAST_PX,
    FISHING_MAX_LINES,
    fishGrams,
    reelLine,
    reelMsOf,
    stepFishing,
} from "../src/Life/Fishing";
import type { FishingEvent, FishingState } from "../src/Life/Fishing";

const fish = (id: number, x: number, y: number, more: Partial<Animal> = {}): Animal => ({
    id,
    kind: "fish",
    sex: "female",
    x,
    y,
    bornAt: 0,
    lifespanMs: 600_000,
    readyAt: 0,
    ...more,
});
const wet = (): boolean => true;
const SPEED = 48;
/** The angler of user 1 stands at (100, 100) and casts at (200, 100). */
const cast = (state: FishingState, now = 0, userId = 1, x = 200, y = 100): FishingEvent[] =>
    castLine(state, { userId, x, y, anglerX: 100, anglerY: 100 }, wet, now);
const anglers = (...ids: number[]): Map<number, { x: number; y: number }> =>
    new Map(ids.map((id) => [id, { x: 100, y: 100 }]));
const step = (state: FishingState, animals: Animal[], now: number, random = 0, who = anglers(1, 2)): FishingEvent[] =>
    stepFishing(state, animals, who, SPEED, now, () => random);

describe("the cast", () => {
    it("goes from one tile to eight in a second and a half", () => {
        expect(castTiles(0)).toBe(1);
        expect(castTiles(750)).toBe(4.5);
        expect(castTiles(5000)).toBe(8);
    });

    it("lands in front of the avatar", () => {
        expect(castPoint(100, 100, "right", 2)).toEqual({ x: 164, y: 100 });
        expect(castPoint(100, 100, "up", 2)).toEqual({ x: 100, y: 36 });
        expect(castPoint(100, 100, "left", 1)).toEqual({ x: 68, y: 100 });
        expect(castPoint(100, 100, "down", 1)).toEqual({ x: 100, y: 132 });
    });

    it("puts a line in the water", () => {
        const state = emptyFishing();
        expect(cast(state)).toEqual([]);
        expect(state.lines.get(1)).toMatchObject({ userId: 1, x: 200, y: 100, state: "waiting", since: 0 });
        expect(state.lines.get(1)?.fishId).toBeUndefined();
    });

    it("is refused out of reach", () => {
        const state = emptyFishing();
        expect(cast(state, 0, 1, 100 + FISHING_MAX_CAST_PX + 1, 100)).toEqual([{ type: "refused", userId: 1 }]);
        expect(state.lines.size).toBe(0);
    });

    it("is refused out of the water of the fish", () => {
        const state = emptyFishing();
        const events = castLine(state, { userId: 1, x: 200, y: 100, anglerX: 100, anglerY: 100 }, () => false, 0);
        expect(events).toEqual([{ type: "refused", userId: 1 }]);
        expect(state.lines.size).toBe(0);
    });

    it("is refused less than a second after the last one, which stays", () => {
        const state = emptyFishing();
        cast(state, 0);
        expect(cast(state, 500, 1, 180, 100)).toEqual([{ type: "refused", userId: 1 }]);
        expect(state.lines.get(1)?.x).toBe(200);
    });

    it("replaces the line of the player after a second", () => {
        const state = emptyFishing();
        cast(state, 0);
        expect(cast(state, 1000, 1, 180, 100)).toEqual([]);
        expect(state.lines.size).toBe(1);
        expect(state.lines.get(1)?.x).toBe(180);
    });

    it("is refused when the room has all its lines", () => {
        const state = emptyFishing();
        for (let user = 1; user <= FISHING_MAX_LINES; user++) expect(cast(state, 0, user)).toEqual([]);
        expect(cast(state, 0, 99)).toEqual([{ type: "refused", userId: 99 }]);
        expect(state.lines.size).toBe(FISHING_MAX_LINES);
    });
});

describe("the weight of a fish", () => {
    it("is the same for the same fish, between 300 g and 3 kg as an adult", () => {
        const weights = new Set<number>();
        for (let id = 1; id <= 500; id++) {
            const grams = adultGrams(id);
            expect(grams).toBe(adultGrams(id));
            expect(grams).toBeGreaterThanOrEqual(300);
            expect(grams).toBeLessThanOrEqual(3000);
            weights.add(grams);
        }
        expect(weights.size).toBeGreaterThanOrEqual(50);
    });

    it("grows from a twentieth at birth to the whole at half its life", () => {
        const adult = adultGrams(7);
        const born = { id: 7, bornAt: 1000, lifespanMs: 600_000 };
        expect(fishGrams(born, 1000)).toBe(Math.round(adult * 0.05));
        expect(fishGrams(born, 1000 + 150_000)).toBe(Math.round(adult * 0.525));
        expect(fishGrams(born, 1000 + 300_000)).toBe(adult);
        expect(fishGrams(born, 1000 + 599_000)).toBe(adult);
    });

    it("sets how long the fish takes to bring in", () => {
        expect(reelMsOf(0)).toBe(1000);
        expect(reelMsOf(1500)).toBe(2500);
        expect(reelMsOf(3000)).toBe(4000);
        expect(reelMsOf(9000)).toBe(4000);
    });
});

describe("a line in the water", () => {
    it("draws the nearest free fish within four cells", () => {
        const state = emptyFishing();
        cast(state);
        const near = fish(1, 248, 100);
        const nearer = fish(2, 240, 100);
        const far = fish(3, 280, 100);
        expect(step(state, [near, nearer, far], 500)).toEqual([]);
        expect(state.lines.get(1)?.fishId).toBe(2);
        expect(nearer).toMatchObject({ targetX: 200, targetY: 100, speed: SPEED, wanderUntil: 1500 });
        expect(near.targetX).toBeUndefined();
    });

    it("draws nothing beyond four cells, nor when the fish is not curious", () => {
        const state = emptyFishing();
        cast(state);
        step(state, [fish(1, 280, 100)], 500);
        expect(state.lines.get(1)?.fishId).toBeUndefined();
        step(state, [fish(1, 240, 100)], 1000, 0.99);
        expect(state.lines.get(1)?.fishId).toBeUndefined();
    });

    it("never draws a dolphin, a wary fish nor the fish of another line", () => {
        const state = emptyFishing();
        cast(state, 0, 1);
        cast(state, 0, 2, 204, 100);
        state.wary.set(5, 10_000);
        const taken = fish(4, 230, 100);
        step(state, [fish(3, 220, 100, { kind: "dolphin" }), fish(5, 225, 100), taken], 500);
        expect(state.lines.get(1)?.fishId).toBe(4);
        expect(state.lines.get(2)?.fishId).toBeUndefined();
    });

    it("has a bite when its fish reaches the float", () => {
        const state = emptyFishing();
        cast(state);
        const curious = fish(1, 240, 100);
        step(state, [curious], 500);
        curious.x = 210;
        expect(step(state, [curious], 1000)).toEqual([{ type: "bite", userId: 1 }]);
        expect(state.lines.get(1)).toMatchObject({ state: "bite", fishId: 1, since: 1000 });
    });

    it("loses the bite after two seconds: the fish is wary for a minute", () => {
        const state = emptyFishing();
        cast(state);
        const curious = fish(1, 210, 100);
        step(state, [curious], 500);
        expect(step(state, [curious], 2500)).toEqual([]);
        expect(step(state, [curious], 2501)).toEqual([{ type: "missed", userId: 1 }]);
        expect(state.lines.get(1)).toMatchObject({ state: "waiting" });
        expect(state.lines.get(1)?.fishId).toBeUndefined();
        expect(state.wary.get(1)).toBe(62_501);
        // Wary, it does not come back at once.
        step(state, [curious], 3000);
        expect(state.lines.get(1)?.fishId).toBeUndefined();
        // A minute later it may.
        step(state, [curious], 62_501);
        expect(state.lines.get(1)?.fishId).toBe(1);
    });

    it("brings in the fish that was hooked in time, then lets it go", () => {
        const state = emptyFishing();
        cast(state);
        const curious = fish(7, 210, 100, { sex: "male", bornAt: -300_000 });
        const animals = [curious];
        step(state, animals, 500);
        expect(reelLine(state, 1, animals, 1000)).toEqual([]);
        const grams = adultGrams(7);
        expect(state.lines.get(1)).toMatchObject({ state: "reeling", since: 1000, reelMs: reelMsOf(grams) });
        expect(step(state, animals, 1000 + reelMsOf(grams) - 1)).toEqual([]);
        expect(step(state, animals, 1000 + reelMsOf(grams))).toEqual([
            { type: "caught", userId: 1, fishId: 7, sex: "male", grams },
        ]);
        expect(state.lines.size).toBe(0);
        expect(animals).toEqual([curious]);
        expect(state.wary.get(7)).toBe(1000 + reelMsOf(grams) + 60_000);
    });

    it("loses the fish a dolphin ate on its way in", () => {
        const state = emptyFishing();
        cast(state);
        const animals = [fish(1, 210, 100)];
        step(state, animals, 500);
        reelLine(state, 1, animals, 1000);
        expect(step(state, [], 1500)).toEqual([{ type: "lost", userId: 1 }]);
        expect(state.lines.size).toBe(0);
    });

    it("waits again when its curious fish died or went away", () => {
        const state = emptyFishing();
        cast(state);
        const curious = fish(1, 240, 100);
        step(state, [curious], 500);
        expect(step(state, [], 1000, 0.99)).toEqual([]);
        expect(state.lines.get(1)).toMatchObject({ state: "waiting" });
        expect(state.lines.get(1)?.fishId).toBeUndefined();
        step(state, [curious], 1500);
        expect(state.lines.get(1)?.fishId).toBe(1);
        curious.x = 200 + 97;
        step(state, [curious], 2000, 0.99);
        expect(state.lines.get(1)?.fishId).toBeUndefined();
    });

    it("comes back when the key is pressed without a bite", () => {
        const state = emptyFishing();
        expect(reelLine(state, 1, [], 0)).toEqual([]);
        cast(state);
        expect(reelLine(state, 1, [], 500)).toEqual([{ type: "retrieved", userId: 1 }]);
        expect(state.lines.size).toBe(0);
    });

    it("comes back when its angler walked or left", () => {
        const state = emptyFishing();
        cast(state, 0, 1);
        cast(state, 0, 2);
        const events = step(state, [], 500, 0, new Map([[1, { x: 109, y: 100 }]]));
        expect(events).toEqual([
            { type: "retrieved", userId: 1 },
            { type: "retrieved", userId: 2 },
        ]);
        expect(state.lines.size).toBe(0);
    });

    it("forgets the fish that are no longer wary", () => {
        const state = emptyFishing();
        state.wary.set(1, 1000);
        state.wary.set(2, 5000);
        step(state, [], 2000);
        expect([...state.wary.keys()]).toEqual([2]);
    });
});
