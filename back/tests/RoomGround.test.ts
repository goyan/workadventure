import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HURRICANE_RMAX_PX, hurricaneHere } from "@workadventure/map-editor";
import type { Hurricane } from "@workadventure/map-editor";
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
        // The air of the hurricane told twice a second while it crosses (11 s), a wind of a hurricane in it.
        const airs = hand.seen.told
            .filter((told) => told.includes("hurricaneAirMessage"))
            .map((told) => (JSON.parse(told) as { message: { hurricaneAirMessage: { step: number } } }).message);
        expect(airs.length).toBeGreaterThanOrEqual(20);
        expect(Math.max(...airs.map((air) => air.hurricaneAirMessage.step))).toBeGreaterThan(0.2);
        expect(hand.seen.saved.some((saved) => saved.startsWith("terrain-water:room|grid|"))).toBe(true);
        expect(hand.seen.saved.some((saved) => saved.startsWith("meadow:room|ice|"))).toBe(true);
        expect(levels).toEqual(handLevels);
        expect(inline.seen.told).toEqual(hand.seen.told);
        expect(inline.seen.saved).toEqual(hand.seen.saved);
        expect(ground.waterSnapshot()).toEqual(reference.waterSnapshot());
        expect(ground.meadowSnapshot()).toEqual(reference.meadowSnapshot());
        expect(ground.treeSnapshot()).toEqual(reference.treeSnapshot());
        // The hurricane ended: no wind of its air for who joins.
        expect(ground.airSnapshot()).toBeUndefined();
        // What the ice fishing shacks read: the ice of each tile, and whether the meadow is made.
        const iceOf = (read: RoomGround): number[] =>
            Array.from({ length: 24 * 24 }, (_, tile) => read.iceAt(tile % 24, Math.floor(tile / 24)));
        expect(iceOf(ground)).toEqual(iceOf(reference));
        // The cold snap of the scenario froze water: what breaks the ice had ice to break.
        expect(iceOf(ground).some((mm) => mm > 0)).toBe(true);
        // The mass of cold air a player laid on the pond of the east froze it in a mild air, and it still holds ice
        // six seconds after it was let go, the cold air dispelled since.
        expect(ground.iceAt(21, 4)).toBeGreaterThan(0);
        expect(ground.hasMeadow()).toBe(true);
        expect(ground.catchingUp()).toBe(reference.catchingUp());
        // The map of these grounds goes six times faster than reality, and its steps cost nothing on their clock:
        // its water lives six steps of its time in each.
    }, 60_000);

    it("lays down each tree the way the wind blows at that tree", async () => {
        const hand = world(groundWam());
        const reference = await byHand(hand.inputs);
        await live(reference, hand.state);
        reference.stop();
        const trees = reference.treeSnapshot()?.trees ?? [];
        // Both trees stood in gusts over 130 km/h while the hurricane blew, each from where the wind came at its
        // foot (hurricaneHere): from 57 to 58 degrees at the tree west of the lake (40, 100), from 122 to 127 degrees
        // at the one of the south-east corner (700, 700). Each lies its own way, still lying a minute later.
        const west = trees.find((tree) => tree.id === "oak-west");
        expect(west).toMatchObject({ fire: 0, damage: 16 });
        expect(west?.fallen).toBeGreaterThanOrEqual(57 + 1);
        expect(west?.fallen).toBeLessThanOrEqual(58 + 1);
        const southEast = trees.find((tree) => tree.id === "oak-south-east");
        expect(southEast).toMatchObject({ fire: 0, damage: 16 });
        expect(southEast?.fallen).toBeGreaterThanOrEqual(122 + 1);
        expect(southEast?.fallen).toBeLessThanOrEqual(127 + 1);
    }, 60_000);

    it("rains on the water at the real rate of a hurricane, and not at all in its eye", async () => {
        /** The rain the water of the room last said it reads (mm an hour of its own time), and how fast it lives. */
        const rainUnder = async (
            hurricane: ReturnType<typeof world>["state"]["hurricane"],
        ): Promise<{ rate: number; inflow: number }> => {
            const { state, inputs, seen } = world(groundWam());
            state.hurricane = hurricane;
            // A warm air: what falls is rain.
            state.air = { temperature: 26, humidity: 80 };
            const ground = new InlineRoomGround(inputs);
            await ground.startWater();
            for (let tenth = 0; tenth < 30; tenth++) {
                // eslint-disable-next-line no-await-in-loop
                await vi.advanceTimersByTimeAsync(100);
            }
            const inflow = ground.water.livedTimes().inflow;
            ground.stop();
            const told = seen.told
                .map(
                    (line) =>
                        JSON.parse(line) as {
                            message?: { $case?: string; terrainWaterMessage?: { stats?: { rainRate?: number } } };
                        },
                )
                .filter((message) => message.message?.$case === "terrainWaterMessage");
            return { rate: told[told.length - 1]?.message?.terrainWaterMessage?.stats?.rainRate ?? NaN, inflow };
        };
        // Northwards over the point (200, 200) of the map, 3600 px in 5 min: at 0.5 its eye is there.
        const storm = (progress: number): Hurricane => ({
            id: 1,
            startedAt: Date.now() - progress * 300_000,
            category: 4,
            durationMs: 300_000,
            heading: 0,
            southern: false,
            fromX: 200,
            fromY: 2000,
            toX: 200,
            toY: -1600,
            anchorX: 200,
            anchorY: 200,
        });
        // Its wall over the point: the eye a radius of the strongest winds (876 px) south of it.
        const wall = storm((2000 - 200 - HURRICANE_RMAX_PX) / 3600);
        const under = await rainUnder(wall);
        // What the storm rains there, at its real rate, over the speed this water already lives at: not counted twice.
        const falling = hurricaneHere(wall, Date.now(), 200, 200)?.rainRate ?? NaN;
        expect(falling).toBeGreaterThan(5);
        // Read within the last second: the storm went on meanwhile.
        expect((under.rate * under.inflow) / falling).toBeCloseTo(1, 1);
        // In the eye no rain falls, whatever the map says (30 mm/h).
        expect((await rainUnder(undefined)).rate).toBeCloseTo(30, 6);
        expect((await rainUnder(storm(0.5))).rate).toBe(0);
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
    }, 60_000);

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
        // The map of these grounds goes six times faster than reality, and its steps cost nothing on their clock:
        // its water lives six steps of its time in each.
    }, 60_000);
});
