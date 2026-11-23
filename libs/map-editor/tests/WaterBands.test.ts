import { afterEach, describe, expect, it } from "vitest";
import { ordinaryWaterArrays, sharedWaterArrays } from "../src/Terrain/WaterArrays";
import {
    runWaterPass,
    setWaterPassRunner,
    WaterBandsFollower,
    WaterBandsLead,
    WaterBandsLost,
} from "../src/Terrain/WaterBands";
import type { WaterPass } from "../src/Terrain/WaterBands";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import type { InertiaMove } from "../src/Terrain/WaterKernel";
import { DEFAULT_WAVE_SETTINGS } from "../src/types";
import { bandsOnOneThread } from "./helpers/BandsOnOneThread";

/**
 * The passes of the water shared between threads (WaterBands), without any thread: who follows is called by hand,
 * where a test wants it. No clock but the one the test moves.
 */

const WIDTH = 24;
const HEIGHT = 40;
/** The word of the board where the slices are claimed (see WaterBands). */
const CLAIM = 1;

/** A basin with a heap of water in a corner, on arrays threads share. */
function basin(): { move: InertiaMove; rowLost: Float64Array } {
    const size = WIDTH * HEIGHT;
    const floats = (): Float32Array => sharedWaterArrays.floats(size);
    const move: InertiaMove = {
        width: WIDTH,
        height: HEIGHT,
        depth: floats(),
        ground: floats(),
        spill: floats(),
        closed: sharedWaterArrays.bytes(size),
        hollow: sharedWaterArrays.bytes(size),
        rough: floats(),
        powers: Float32Array.from({ length: 641 }, (_, eighths) => Math.pow(Math.max(1, eighths) / 8, -4 / 3)),
        east: floats(),
        south: floats(),
        afford: floats(),
        speedEast: floats(),
        speedSouth: floats(),
        nextSpeedEast: floats(),
        nextSpeedSouth: floats(),
        dt: 1 / 30,
        swiftest: 15,
        pull: 0.037,
        pulled: 98,
        edgeShare: 0.2 / 3,
        top: 256,
        roughness: 1,
        damping: 0.01,
        breaking: 4,
        carried: 1,
        compiled: undefined,
    };
    for (let index = 0; index < size; index++) {
        const column = index % WIDTH;
        const row = (index - column) / WIDTH;
        move.ground[index] = -20 + ((column * 7 + row * 3) % 5);
        move.hollow[index] = 1;
        move.rough[index] = 0.01;
        move.depth[index] = column < 8 && row < 12 ? 30 : 4;
    }
    return { move, rowLost: sharedWaterArrays.doubles(HEIGHT) };
}

/** `steps` steps of three moves, each pass run by `run`. Returns the water lost. */
function live(move: InertiaMove, rowLost: Float64Array, steps: number, run: (pass: WaterPass) => void): number {
    let lost = 0;
    for (let step = 0; step < steps * 3; step++) {
        run(0);
        [move.speedEast, move.nextSpeedEast] = [move.nextSpeedEast, move.speedEast];
        [move.speedSouth, move.nextSpeedSouth] = [move.nextSpeedSouth, move.speedSouth];
        run(1);
        run(2);
        run(3);
        for (let row = 0; row < HEIGHT; row++) lost += rowLost[row];
    }
    return lost;
}

/** The water of a basin after `steps` steps on one thread, the passes over all the rows at once. */
function alone(steps: number): { move: InertiaMove; lost: number } {
    const { move, rowLost } = basin();
    return { move, lost: live(move, rowLost, steps, (pass) => runWaterPass(pass, move, 0, HEIGHT, rowLost)) };
}

const same = (a: InertiaMove, b: InertiaMove): void => {
    for (const name of ["depth", "east", "south", "speedEast", "speedSouth", "afford"] as const) {
        expect(Array.from(a[name]), name).toEqual(Array.from(b[name]));
    }
};

const neverSleeps = (): void => {
    throw new Error("Who leads slept");
};

/** The turns of the board come round after this many (see WaterBands). */
const TURNS = 1 << 20;

describe("the passes of the water shared between threads (WaterBands)", () => {
    afterEach(() => setWaterPassRunner(undefined));

    it("leaves alone the pass of another turn, even when the turns have come round", () => {
        const { move, rowLost } = basin();
        let stop = false;
        const lead = new WaterBandsLead(
            1,
            neverSleeps,
            1000,
            () => 0,
            () => {
                // The pass is left open, nobody at work yet.
                if (stop) throw new Error("opened");
            },
        );
        const follower = new WaterBandsFollower(lead.board);
        // The last turn before they come round.
        Reflect.set(lead, "turn", TURNS - 2);
        for (const news of lead.begin({}, move, rowLost)) follower.know(news.grid, news.arrays);
        lead.run(0);
        const flows = Array.from(move.east);
        // Who follows wakes for that turn, and before it has read the pass, the turn is over and the next one is
        // open: turn 0, whose claims are smaller than those of the turn it woke for.
        follower.workOnce(() => {
            stop = true;
            expect(() => lead.run(1)).toThrow("opened");
        });
        // It claimed nothing of the pass that is open, and computed nothing.
        expect(lead.claims()).toBe(0);
        expect(Array.from(move.east)).toEqual(flows);
        expect(Array.from(move.afford).every((share) => share === 0)).toBe(true);
    });

    it("shares nothing of a water that creeps, and goes on right when the water has inertia again", () => {
        const creep: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
        const inertia: WaterStepInput = {
            ...creep,
            inertia: true,
            seconds: 0.1,
            waves: { ...DEFAULT_WAVE_SETTINGS },
            moves: 3,
            pace: 1,
        };
        const bands = bandsOnOneThread(2, 7);
        setWaterPassRunner(bands);
        const grids = [ordinaryWaterArrays, sharedWaterArrays].map((arrays) => {
            const grid = new WaterGrid(
                undefined,
                { x: 0, y: 0, width: WIDTH, height: HEIGHT },
                undefined,
                undefined,
                undefined,
                arrays,
            );
            const bytes = new Uint8Array(WIDTH * HEIGHT * 2);
            for (let index = 0; index < WIDTH * HEIGHT; index++) {
                bytes[index * 2] = index % WIDTH < 8 ? 240 : 16;
            }
            expect(grid.readDepths(bytes)).toBe(true);
            return grid;
        });
        const lost = [0, 0];
        const live = (input: WaterStepInput, steps: number): void => {
            for (let step = 0; step < steps; step++) {
                grids.forEach((grid, at) => {
                    lost[at] += grid.step(input).lostPx;
                });
            }
        };
        live(inertia, 5);
        const shared = bands.slices();
        // Four passes a move, twelve slices a pass: four for each of the three threads.
        expect(shared.here + shared.others).toBeGreaterThan(0);
        expect((shared.here + shared.others) % (4 * 12)).toBe(0);
        // The water creeps (the time a room missed, a map without inertia): its depths change places with their
        // double at each step, in the memory the threads share too, and no pass is shared.
        live(creep, 3);
        expect(bands.slices()).toEqual(shared);
        expect((Reflect.get(grids[1], "depth") as Float32Array).buffer).toBeInstanceOf(SharedArrayBuffer);
        // Inertia again: who follows is told the depths are other arrays, and the water is the same to the bit.
        live(inertia, 5);
        expect(bands.told.map((news) => news.arrays !== undefined)).toEqual([true, false, true]);
        expect(bands.slices().others).toBeGreaterThan(shared.others);
        for (const name of ["depth", "flowEast", "flowSouth", "speedEast", "speedSouth"]) {
            const read = (grid: WaterGrid): number[] => Array.from(Reflect.get(grid, name) as Float32Array);
            expect(read(grids[1]), name).toEqual(read(grids[0]));
        }
        expect(lost[1]).toBe(lost[0]);
    });

    it("gives the same water when nobody follows, though threads were expected", () => {
        const reference = alone(20);
        const { move, rowLost } = basin();
        const lead = new WaterBandsLead(3, neverSleeps);
        const key = {};
        const lost = live(move, rowLost, 20, (pass) => {
            if (pass === 0) lead.begin(key, move, rowLost);
            lead.run(pass);
        });
        same(move, reference.move);
        expect(lost).toBe(reference.lost);
        // Every slice was computed by who leads: sixteen a pass, four for each of the four threads expected.
        expect(lead.computed()).toEqual({ here: 20 * 3 * 4 * 16, others: 0 });
    });

    it("gives the same water whoever takes which slices, and tells who follows of a grid only once", () => {
        const reference = alone(20);
        const { move, rowLost } = basin();
        const followers: WaterBandsFollower[] = [];
        let turn = 0;
        const lead = new WaterBandsLead(
            2,
            neverSleeps,
            1000,
            () => 0,
            () => {
                turn++;
                // One takes a slice or two before who leads, the other all that is left one turn in five.
                followers[0].workOnce(undefined, 1 + (turn % 2));
                if (turn % 5 === 0) followers[1].workOnce();
            },
        );
        followers.push(new WaterBandsFollower(lead.board), new WaterBandsFollower(lead.board));
        const key = {};
        let told = 0;
        const lost = live(move, rowLost, 20, (pass) => {
            if (pass === 0) {
                for (const news of lead.begin(key, move, rowLost)) {
                    told++;
                    for (const follower of followers) follower.know(news.grid, news.arrays);
                }
            }
            lead.run(pass);
        });
        same(move, reference.move);
        expect(lost).toBe(reference.lost);
        expect(told).toBe(1);
        const { here, others } = lead.computed();
        expect(others).toBeGreaterThan(300);
        expect(here).toBeGreaterThan(0);
        expect(here + others).toBe(20 * 3 * 4 * 12);
    });

    it("leaves alone a pass that is over: who wakes late computes nothing", () => {
        const { move, rowLost } = basin();
        const lead = new WaterBandsLead(1, neverSleeps);
        const follower = new WaterBandsFollower(lead.board);
        for (const news of lead.begin({}, move, rowLost)) follower.know(news.grid, news.arrays);
        lead.run(0);
        const flows = Array.from(move.east);
        // The pass is done; who follows wakes only now, with the pass still written on the board.
        expect(follower.workOnce()).toBe(true);
        expect(Array.from(move.east)).toEqual(flows);
        expect(lead.computed().others).toBe(0);
    });

    it("does without a thread that does not know the grid yet", () => {
        const { move, rowLost } = basin();
        const following: WaterBandsFollower[] = [];
        const lead = new WaterBandsLead(
            1,
            neverSleeps,
            1000,
            () => 0,
            () => following[0]?.workOnce(),
        );
        const follower = new WaterBandsFollower(lead.board);
        following.push(follower);
        // The arrays of the grid have not reached who follows.
        lead.begin({}, move, rowLost);
        lead.run(0);
        expect(lead.computed()).toEqual({ here: 8, others: 0 });
    });

    it("tells who follows of other arrays as of another grid, and of a grid that is gone", () => {
        const first = basin();
        const lead = new WaterBandsLead(1, neverSleeps);
        const key = {};
        const [told] = lead.begin(key, first.move, first.rowLost);
        expect(told.arrays?.depth).toBe(first.move.depth);
        // The same arrays, the speeds having changed places an odd number of times: nothing to tell.
        const { move } = first;
        [move.speedEast, move.nextSpeedEast] = [move.nextSpeedEast, move.speedEast];
        [move.speedSouth, move.nextSpeedSouth] = [move.nextSpeedSouth, move.speedSouth];
        expect(lead.begin(key, move, first.rowLost)).toEqual([]);
        // Other depths (the water that creeps swaps them): the grid of before is forgotten, another is told.
        move.depth = sharedWaterArrays.floats(WIDTH * HEIGHT);
        const news = lead.begin(key, move, first.rowLost);
        expect(news.map((one) => [one.grid, one.arrays !== undefined])).toEqual([
            [told.grid, false],
            [told.grid + 1, true],
        ]);
        lead.forget(key);
        const other = basin();
        expect(lead.begin({}, other.move, other.rowLost).map((one) => [one.grid, one.arrays !== undefined])).toEqual([
            [told.grid + 1, false],
            [told.grid + 2, true],
        ]);
    });

    it("gives the step up when a slice claimed is not computed within its patience, and not before", () => {
        const { move, rowLost } = basin();
        let now = 0;
        const sleeps: number[] = [];
        const lead: WaterBandsLead = new WaterBandsLead(
            1,
            (_words, _index, _value, ms) => {
                sleeps.push(ms);
                now += 400;
            },
            1000,
            () => now,
            // A thread claims a slice, and is lost before it computes it.
            () => Atomics.add(lead.board.words, CLAIM, 1),
        );
        lead.begin({}, move, rowLost);
        expect(() => lead.run(0)).toThrow(WaterBandsLost);
        // It slept until its patience was over: 1000 ms, then what was left of them.
        expect(sleeps).toEqual([1000, 600, 200]);
        expect(lead.computed().here).toBe(7);
    });

    it("fails the pass a thread failed at, and stops who follows when told", () => {
        const { move, rowLost } = basin();
        const following: WaterBandsFollower[] = [];
        let failed: unknown;
        const lead = new WaterBandsLead(
            1,
            neverSleeps,
            1000,
            () => 0,
            () => {
                try {
                    following[0]?.workOnce(undefined, 1);
                } catch (error) {
                    failed = error;
                }
            },
        );
        const follower = new WaterBandsFollower(lead.board);
        following.push(follower);
        for (const news of lead.begin({}, move, rowLost)) {
            // Arrays too short for the grid: the pass of who follows reads out of them and fails.
            follower.know(news.grid, news.arrays && { ...news.arrays, rowLost: undefined as unknown as Float64Array });
        }
        lead.run(0);
        lead.run(1);
        lead.run(2);
        expect(() => lead.run(3)).toThrow("failed on a thread of the bands of the water");
        expect(failed).toBeInstanceOf(TypeError);
        lead.stop();
        expect(follower.workOnce()).toBe(false);
    });
});
