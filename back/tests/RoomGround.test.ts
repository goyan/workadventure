import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HURRICANE_GUST_FACTOR, HURRICANE_RMAX_PX, hurricaneHere, TREE_FALL_GUST_KMH } from "@workadventure/map-editor";
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
        // The wind of the air of the hurricane at the foot of each tree, after each step of the air (the meadow reads
        // it between two): where it comes from (degrees) and its gusts (km/h).
        const feet = { "oak-west": { x: 40, y: 100 }, "oak-south-east": { x: 700, y: 700 } };
        const blew: Record<string, { from: number; gust: number }[]> = { "oak-west": [], "oak-south-east": [] };
        reference.water.stepAlong(() => {
            for (const [id, foot] of Object.entries(feet)) {
                const wind = reference.air.windAt(foot.x, foot.y);
                if (!wind) continue;
                const from = ((((Math.atan2(wind.east, wind.north) * 180) / Math.PI + 180) % 360) + 360) % 360;
                blew[id].push({ from, gust: Math.hypot(wind.east, wind.north) * 3.6 * HURRICANE_GUST_FACTOR });
            }
        });
        await live(reference, hand.state);
        reference.stop();
        const trees = reference.treeSnapshot()?.trees ?? [];
        // Both trees stood in gusts over 130 km/h while the hurricane blew, and each lies the way the wind of the air
        // blew at its foot then (its own way: the trees are on either side of the track of the eye), still lying a
        // minute later. Laid by the formula of the hurricane, they lay from 57 and 122 to 127 degrees; by its air,
        // turned by its inflow and the wind of the room, from 110 west of the lake and 126 south-east of it (98 and 121
        // while the drag of the land was held in a layer as deep as over the sea: AirSimulation.dragAt).
        for (const id of ["oak-west", "oak-south-east"]) {
            const tree = trees.find((told) => told.id === id);
            expect(tree, id).toMatchObject({ fire: 0, damage: 16 });
            const fallen = (tree?.fallen ?? 0) - 1;
            expect(
                blew[id].some((wind) => Math.round(wind.from) % 360 === fallen && wind.gust >= TREE_FALL_GUST_KMH),
                `${id} fallen from ${fallen}`,
            ).toBe(true);
        }
        const west = trees.find((told) => told.id === "oak-west")?.fallen ?? 0;
        const southEast = trees.find((told) => told.id === "oak-south-east")?.fallen ?? 0;
        expect(Math.abs(west - southEast)).toBeGreaterThan(10);
    }, 60_000);

    it("lays down the trees of a forest by the wind of the standard exposure, not by the calmer top of its canopy", async () => {
        // Four oaks more next to the one of the south-east corner, their feet in the tiles 22 and 23: five trees in the
        // cell of the air of 4 x 4 tiles there (tiles 20 to 23), a forest, and the air past the edge of the map takes
        // the surface of its edge: from 704 px on, nothing but forest around the feet.
        const wam = groundWam();
        for (const [at, [x, y]] of [
            [680, 648],
            [712, 648],
            [680, 680],
            [712, 680],
        ].entries()) {
            wam.entities[`oak-stand-${at}`] = {
                x,
                y,
                prefabRef: { collectionName: "Nature", id: "Nature:tree-oak:Down" },
            };
        }
        const hand = world(wam);
        const reference = await byHand(hand.inputs);
        const feet = [
            [712, 712],
            [744, 712],
            [712, 744],
            [744, 744],
        ];
        // The gusts at the top of the canopy and in the standard exposure, at the feet of the stand, after each step.
        const canopy: { gust: number; share: number }[] = [];
        const standard: { from: number; gust: number }[][] = feet.map(() => []);
        reference.water.stepAlong(() => {
            feet.forEach(([x, y], at) => {
                const top = reference.air.windAt(x, y);
                const open = reference.air.standardWindAt(x, y);
                if (!top || !open) return;
                canopy.push({
                    gust: Math.hypot(top.east, top.north) * 3.6 * HURRICANE_GUST_FACTOR,
                    share: Math.hypot(top.east, top.north) / Math.max(1e-9, Math.hypot(open.east, open.north)),
                });
                const from = ((((Math.atan2(open.east, open.north) * 180) / Math.PI + 180) % 360) + 360) % 360;
                standard[at].push({ from, gust: Math.hypot(open.east, open.north) * 3.6 * HURRICANE_GUST_FACTOR });
            });
        });
        await live(reference, hand.state);
        reference.stop();
        const trees = reference.treeSnapshot()?.trees ?? [];
        // The top of the canopy blows at a third of the standard exposure there (surfaceRatio of a forest over that of
        // open land, 0.27 for 0.84 of the sea's), rarely as hard as what lays a tree down (EF: 130 km/h of gusts at
        // 10 m in open terrain); the standard exposure does, and each tree lies the way it blew there.
        expect(canopy.length).toBeGreaterThan(0);
        for (const told of canopy) {
            expect(told.share).toBeGreaterThan(0.2);
            expect(told.share).toBeLessThan(0.4);
        }
        for (let at = 0; at < 4; at++) {
            const tree = trees.find((told) => told.id === `oak-stand-${at}`);
            expect(tree, `oak-stand-${at}`).toMatchObject({ fire: 0, damage: 16 });
            const fallen = (tree?.fallen ?? 0) - 1;
            expect(
                standard[at].some((wind) => Math.round(wind.from) % 360 === fallen && wind.gust >= TREE_FALL_GUST_KMH),
                `oak-stand-${at} fallen from ${fallen}`,
            ).toBe(true);
        }
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
