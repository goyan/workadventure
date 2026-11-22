import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineRoomGround } from "../src/Model/Ground/InlineRoomGround";
import type { RoomGround } from "../src/Model/Ground/RoomGround";
import { byHand, groundWam, GROUND_NOW, happenAt, world } from "./helpers/GroundScenario";

/** A minute and a half of a room, its timers running. */
async function live(ground: RoomGround, state: ReturnType<typeof world>["state"]): Promise<number[]> {
    const levels: number[] = [];
    for (let tenth = 0; tenth < 900; tenth++) {
        happenAt(tenth, ground, state, levels);
        // One tenth of a second after the other: what happens at each is the point.
        // eslint-disable-next-line no-await-in-loop
        await vi.advanceTimersByTimeAsync(100);
    }
    return levels;
}

describe("the ground of a room behind its door (RoomGround)", () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: GROUND_NOW });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("does on the thread of the rooms exactly what the room did by hand: same states told, same saves", async () => {
        const hand = world(groundWam());
        const reference = await byHand(hand.inputs);
        const handLevels = await live(reference, hand.state);
        reference.stop();

        // The same instant again for the other ground: both read the same clock.
        vi.setSystemTime(GROUND_NOW);
        const inline = world(groundWam());
        const ground = new InlineRoomGround(inline.inputs);
        await ground.startWater();
        await ground.startMeadow();
        const levels = await live(ground, inline.state);
        ground.stop();

        // The scenario does what it says: water told often, the meadow too, both saved.
        expect(hand.seen.told.length).toBeGreaterThan(100);
        expect(hand.seen.told.some((told) => told.includes("meadowMessage"))).toBe(true);
        expect(hand.seen.saved.some((saved) => saved.startsWith("terrain-water:room|grid|"))).toBe(true);
        expect(hand.seen.saved.some((saved) => saved.startsWith("meadow:room|ice|"))).toBe(true);
        expect(levels).toEqual(handLevels);
        expect(inline.seen.told).toEqual(hand.seen.told);
        expect(inline.seen.saved).toEqual(hand.seen.saved);
        expect(ground.waterSnapshot()).toEqual(reference.waterSnapshot());
        expect(ground.meadowSnapshot()).toEqual(reference.meadowSnapshot());
        expect(ground.treeSnapshot()).toEqual(reference.treeSnapshot());
    });

    it("keeps the floor of a building dry through its drain, as before (the sinks that dry a floor)", async () => {
        const { inputs, state } = world(groundWam());
        const ground = new InlineRoomGround(inputs);
        await ground.startWater();
        await ground.startMeadow();
        state.downpours = [{ id: 1, x: 0, y: 0, radiusTiles: 4, wholeMap: true }];
        await vi.advanceTimersByTimeAsync(3000);
        const grid = ground.getGrid();
        // A cell of the floor the drain stands on, and one of the ground outside under the same downpour.
        expect(grid?.depthAt(34, 34)).toBe(0);
        expect(grid?.depthAt(44, 10)).toBeGreaterThan(0);
        ground.stop();
    });

    it("lives the time a room missed as before: the meadow and its water catch up alike", async () => {
        const first = world(groundWam());
        const before = new InlineRoomGround(first.inputs);
        await before.startWater();
        await before.startMeadow();
        await vi.advanceTimersByTimeAsync(40_000);
        before.stop();
        const stored: Record<string, Record<string, string>> = {};
        for (const saved of first.seen.saved) {
            const [key, field, value] = saved.split("|");
            (stored[key] ??= {})[field] = value;
        }
        // Three hours later the room opens again.
        const later = GROUND_NOW + 40_000 + 3 * 3600_000;
        vi.setSystemTime(later);
        const hand = world(groundWam(), stored);
        const reference = await byHand(hand.inputs);
        await vi.advanceTimersByTimeAsync(20_000);
        reference.stop();

        vi.setSystemTime(later);
        const inline = world(groundWam(), stored);
        const ground = new InlineRoomGround(inline.inputs);
        await ground.startWater();
        await ground.startMeadow();
        await vi.advanceTimersByTimeAsync(20_000);
        ground.stop();

        expect(hand.seen.told.length).toBeGreaterThan(5);
        expect(inline.seen.told).toEqual(hand.seen.told);
        expect(inline.seen.saved).toEqual(hand.seen.saved);
    });
});
