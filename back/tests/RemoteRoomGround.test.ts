import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroundCommand, GroundPort, GroundTold } from "../src/Model/Ground/GroundProtocol";
import { GroundThreads } from "../src/Model/Ground/GroundThreads";
import type { GroundThread } from "../src/Model/Ground/GroundThreads";
import { HostedGround } from "../src/Model/Ground/HostedGround";
import { InlineRoomGround } from "../src/Model/Ground/InlineRoomGround";
import { RemoteRoomGround } from "../src/Model/Ground/RemoteRoomGround";
import type { RoomGround } from "../src/Model/Ground/RoomGround";
import { byHand, groundWam, GROUND_NOW, GROUND_SEED, happenAt, plain, world } from "./helpers/GroundScenario";

/**
 * A thread that is none: the commands are copied as a thread copies them and handled later, in their order, by a
 * HostedGround of this thread; what it tells is copied back the same way.
 */
function loopback(): Pick<GroundThreads, "assign"> {
    return {
        assign: () => {
            let hosted: HostedGround | undefined;
            let listener: ((told: GroundTold) => void) | undefined;
            let last = Promise.resolve();
            const port: GroundPort = {
                post: (command: GroundCommand) => {
                    const copy = structuredClone(command);
                    last = last.then(async () => {
                        if (copy.kind === "open") {
                            hosted = new HostedGround(copy.room, copy, (told) => {
                                const back = structuredClone(told);
                                last = last.then(() => listener?.(back));
                            });
                            return;
                        }
                        await hosted?.handle(copy);
                    });
                },
                listen: (_room, told) => {
                    listener = told;
                },
                forget: () => {
                    listener = undefined;
                },
            };
            return { room: 1, port };
        },
    };
}

/** The threads of the server as they are spawned, kept so that a test can lose one. */
function realThreads(count: number): { threads: GroundThreads; workers: Worker[] } {
    const workers: Worker[] = [];
    const threads = new GroundThreads(count, (): GroundThread => {
        const worker = new Worker(new URL("../src/Model/Ground/GroundWorker.ts", import.meta.url), {
            execArgv: ["--import", "tsx"],
        });
        workers.push(worker);
        return worker;
    });
    return { threads, workers };
}

/** Everything a reader of the water can ask, on the cells of the map. */
function waterOf(ground: RoomGround): number[] {
    const grid = ground.getGrid();
    if (!grid) return [];
    const all: number[] = [grid.bounds.x, grid.bounds.y, grid.bounds.width, grid.bounds.height];
    for (let y = grid.bounds.y; y < grid.bounds.y + grid.bounds.height; y++) {
        for (let x = grid.bounds.x; x < grid.bounds.x + grid.bounds.width; x++) {
            all.push(grid.depthAt(x, y), grid.canCross(x, y, "east") ? 1 : 0, grid.canCross(x, y, "south") ? 1 : 0);
        }
    }
    return all;
}

/** Where the animals see a fire, on a few points of the map. */
function fireOf(ground: RoomGround): unknown[] {
    const fire = ground.lifeFire();
    const seen: unknown[] = [fire !== undefined];
    for (let y = 0; y < 768; y += 96)
        for (let x = 0; x < 768; x += 96) seen.push(fire?.near(x, y), fire?.burning(x, y));
    return seen;
}

/**
 * The same minute and a half of a room on a ground computed elsewhere, driven by hand, and on a ground wired by hand
 * on this thread: what they told, what they saved, and what the room reads of each along the way.
 */
async function compare(threads: Pick<GroundThreads, "assign">, tenths: number): Promise<void> {
    const hand = world(groundWam());
    const reference = await byHand(hand.inputs);
    const elsewhere = world(groundWam());
    const ground = new RemoteRoomGround(elsewhere.inputs, threads, { seed: GROUND_SEED });
    await ground.startWater();
    await ground.startMeadow();

    const levels: number[] = [];
    const handLevels: number[] = [];
    let burned = false;
    for (let tenth = 0; tenth < tenths; tenth++) {
        vi.setSystemTime(GROUND_NOW + tenth * 100);
        happenAt(tenth, reference, hand.state, handLevels);
        happenAt(tenth, ground, elsewhere.state, levels);
        reference.water.step();
        if (tenth % 20 === 0) reference.meadow.step();
        // One tenth of a second after the other: what happens at each is the point.
        // eslint-disable-next-line no-await-in-loop
        await ground.stepByHand(1, tenth % 20 === 0 ? 1 : 0);
        if (tenth % 50 === 0 || (tenth > 300 && tenth < 400)) {
            expect(waterOf(ground), `water at ${tenth}`).toEqual(waterOf(reference));
            expect(ground.waterVersion(), `version at ${tenth}`).toBe(reference.waterVersion());
            expect(fireOf(ground), `fire at ${tenth}`).toEqual(fireOf(reference));
            expect(plain(ground.waterSnapshot()), `water for who joins at ${tenth}`).toBe(
                plain(reference.waterSnapshot()),
            );
            expect(plain(ground.meadowSnapshot()), `meadow for who joins at ${tenth}`).toBe(
                plain(reference.meadowSnapshot()),
            );
            expect(plain(ground.treeSnapshot()), `trees for who joins at ${tenth}`).toBe(
                plain(reference.treeSnapshot()),
            );
        }
        burned ||= reference.lifeFire() !== undefined;
    }
    reference.stop();
    const closed = ground.closed();
    ground.stop();
    await closed;

    expect(hand.seen.told.length).toBeGreaterThan(tenths / 4);
    expect(hand.seen.told.some((told) => told.includes("meadowMessage"))).toBe(true);
    expect(hand.seen.saved.some((saved) => saved.startsWith("meadow:room|ice|"))).toBe(true);
    if (tenths > 1000) expect(burned).toBe(true);
    expect(levels).toEqual(handLevels);
    expect(elsewhere.seen.told).toEqual(hand.seen.told);
    expect(elsewhere.seen.saved).toEqual(hand.seen.saved);
}

describe("the ground of a room computed elsewhere (RemoteRoomGround)", () => {
    describe("driven by hand, against the ground of the thread of the rooms", () => {
        beforeEach(() => {
            // The clock only: the timers of this thread stay still, the steps are made by hand.
            vi.useFakeTimers({ now: GROUND_NOW, toFake: ["Date", "setInterval", "clearInterval"] });
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it("tells and saves the same, bit for bit, through the messages of a thread (no thread)", async () => {
            await compare(loopback(), 1300);
        }, 60_000);

        it("tells and saves the same, bit for bit, on a real thread", async () => {
            const { threads } = realThreads(1);
            try {
                await compare(threads, 1300);
            } finally {
                threads.stop();
            }
        }, 120_000);
    });

    describe("on its own timers, through the messages of a thread (no thread)", () => {
        beforeEach(() => {
            vi.useFakeTimers({ now: GROUND_NOW });
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it("lives the time a room missed as the ground of the thread of the rooms does", async () => {
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
            const here = world(groundWam(), stored);
            const reference = new InlineRoomGround(here.inputs);
            await reference.startWater();
            await reference.startMeadow();
            await vi.advanceTimersByTimeAsync(20_000);
            reference.stop();

            vi.setSystemTime(later);
            const elsewhere = world(groundWam(), stored);
            const ground = new RemoteRoomGround(elsewhere.inputs, loopback());
            const started = Promise.all([ground.startWater().then(() => ground.startMeadow())]);
            await vi.advanceTimersByTimeAsync(0);
            await started;
            await vi.advanceTimersByTimeAsync(20_000);
            const closed = ground.closed();
            ground.stop();
            await vi.advanceTimersByTimeAsync(0);
            await closed;

            expect(here.seen.told.length).toBeGreaterThan(5);
            expect(elsewhere.seen.told).toEqual(here.seen.told);
            expect(elsewhere.seen.saved).toEqual(here.seen.saved);
        }, 60_000);
    });

    describe("on its own timers, on a real thread", () => {
        const wait = (ms: number): Promise<void> =>
            new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        const wetCells = (ground: RoomGround): number =>
            waterOf(ground).filter((value, at) => at > 3 && at % 3 === 1 && value > 0).length;

        it("runs by itself, tells the room, and saves as it stops", async () => {
            const { threads } = realThreads(1);
            const { inputs, seen, state } = world(groundWam());
            const ground = new RemoteRoomGround({ ...inputs, now: undefined, clock: undefined }, threads);
            try {
                await ground.startWater();
                await ground.startMeadow();
                state.downpours = [{ id: 1, x: 0, y: 0, radiusTiles: 4, wholeMap: true }];
                await wait(1500);
                expect(seen.told.length).toBeGreaterThan(3);
                expect(wetCells(ground)).toBeGreaterThan(100);
                expect(ground.waterSnapshot()?.full).toBe(true);
                // The drain of the building keeps its floor dry there as here.
                expect(ground.getGrid()?.depthAt(34, 34)).toBe(0);
                const closed = ground.closed();
                ground.stop();
                await closed;
                expect(seen.saved.some((saved) => saved.startsWith("terrain-water:room|grid|"))).toBe(true);
                expect(seen.saved.some((saved) => saved.startsWith("meadow:room|grass|"))).toBe(true);
            } finally {
                threads.stop();
            }
        }, 60_000);

        it("starts again with its water when its thread is lost, and comes back to this thread after three losses", async () => {
            const { threads, workers } = realThreads(1);
            const { inputs, seen, state } = world(groundWam());
            const ground = new RemoteRoomGround({ ...inputs, now: undefined, clock: undefined }, threads);
            const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
            try {
                await ground.startWater();
                await ground.startMeadow();
                state.downpours = [{ id: 1, x: 0, y: 0, radiusTiles: 4, wholeMap: true }];
                await wait(1200);
                state.downpours = [];
                const wet = wetCells(ground);
                expect(wet).toBeGreaterThan(100);

                await workers[0].terminate();
                await wait(1500);
                expect(workers.length).toBe(2);
                // The water it had is still there, and the room is told again.
                expect(wetCells(ground)).toBeGreaterThan(wet / 2);
                const told = seen.told.length;
                await wait(800);
                expect(seen.told.length).toBeGreaterThan(told);

                await workers[1].terminate();
                await wait(1200);
                await workers[2].terminate();
                await wait(1500);
                // Three threads lost: no fourth, the ground is computed here, and goes on.
                expect(workers.length).toBe(3);
                expect(wetCells(ground)).toBeGreaterThan(0);
                const after = seen.told.length;
                await wait(800);
                expect(seen.told.length).toBeGreaterThan(after);
                ground.stop();
            } finally {
                errors.mockRestore();
                threads.stop();
            }
        }, 60_000);
    });
});
