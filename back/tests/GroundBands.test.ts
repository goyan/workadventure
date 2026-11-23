import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_WAVE_SETTINGS,
    ordinaryWaterArrays,
    setWaterPassRunner,
    sharedWaterArrays,
    WaterBandsLead,
    WaterBandsLost,
    WaterGrid,
} from "@workadventure/map-editor";
import type { WaterStepInput } from "@workadventure/map-editor";
import { GroundBands } from "../src/Model/Ground/GroundBands";
import type { GroundBandStart, GroundBandThread } from "../src/Model/Ground/GroundBands";
import type { GroundTold } from "../src/Model/Ground/GroundProtocol";
import { BAND_LOSSES_BEFORE_NONE, GroundThreads } from "../src/Model/Ground/GroundThreads";
import type { GroundThread } from "../src/Model/Ground/GroundThreads";

/**
 * The bands of the water on real threads (GroundBands, GroundBandWorker): the same water as on one thread, to the
 * bit, whatever happens to the threads. Nothing here measures a time: the tests wait for what must happen, within
 * bounds that only say a thread never came.
 */

const WIDTH = 96;
const HEIGHT = 80;
const BOUNDS = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
/** The word of the board where the slices are claimed (see WaterBands). */
const CLAIM = 1;

const inertia: WaterStepInput = {
    rainPx: 0,
    evaporationPx: 0,
    absorptionPx: 0,
    flows: [{ cellX: 70, cellY: 20, px: 40, radius: 3 }],
    inertia: true,
    seconds: 0.1,
    waves: { ...DEFAULT_WAVE_SETTINGS },
    moves: 3,
    pace: 1,
};

/** A flat map with a heap of water in a corner and a source: the water spreads, and falls off the edges. */
function flooded(shared: boolean): WaterGrid {
    const grid = new WaterGrid(
        undefined,
        BOUNDS,
        undefined,
        undefined,
        undefined,
        shared ? sharedWaterArrays : ordinaryWaterArrays,
    );
    const bytes = new Uint8Array(WIDTH * HEIGHT * 2);
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const eighths = x < 30 && y < 30 ? 30 * 8 : 8;
            bytes[(y * WIDTH + x) * 2] = eighths & 255;
            bytes[(y * WIDTH + x) * 2 + 1] = eighths >> 8;
        }
    }
    expect(grid.readDepths(bytes)).toBe(true);
    return grid;
}

/** Everything a step leaves: the water, its flows, its speeds, and what it lost. */
function stateOf(grid: WaterGrid, lost: number): unknown {
    return {
        lost,
        ...Object.fromEntries(
            ["depth", "flowEast", "flowSouth", "speedEast", "speedSouth"].map((name) => [
                name,
                Buffer.from(Float32Array.from(Reflect.get(grid, name) as Float32Array).buffer).toString("base64"),
            ]),
        ),
    };
}

function live(grid: WaterGrid, steps: number): number {
    let lost = 0;
    for (let step = 0; step < steps; step++) lost += grid.step(inertia).lostPx;
    return lost;
}

const realWorker = (start: GroundBandStart): Worker =>
    new Worker(new URL("../src/Model/Ground/GroundBandWorker.ts", import.meta.url), {
        workerData: start,
        transferList: [start.news],
        execArgv: ["--import", "tsx"],
    });

const faultyWorker =
    (fault: "stuck" | "throws") =>
    (start: GroundBandStart): Worker =>
        new Worker(new URL("./helpers/StuckBandWorker.ts", import.meta.url), {
            workerData: { board: start.board, fault },
            execArgv: ["--import", "tsx"],
        });

/** Sleeps on a word nobody writes: lets the other threads run, without spinning. */
const nap = (ms: number): void => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * Who leads, made to wait at the opening of a pass until another thread has claimed a slice (or `tries` ms have
 * passed: that thread never came): the threads take their part whatever the machine does.
 */
function patientLead(
    followers: number,
    each = 1,
    sleep?: ConstructorParameters<typeof WaterBandsLead>[1],
): WaterBandsLead {
    let turn = 0;
    let now = 0;
    // Once nobody came, it never waits again: threads that never start must not hold a test for minutes.
    let alone = false;
    const lead: WaterBandsLead = new WaterBandsLead(
        followers,
        sleep ??
            ((words, index, value, ms) => {
                Atomics.wait(words, index, value, ms);
            }),
        1000,
        sleep ? () => (now += 400) : undefined,
        () => {
            if (alone || turn++ % each !== 0) return;
            const opened = Atomics.load(lead.board.words, CLAIM);
            let tries = 0;
            while (tries < 5000 && Atomics.load(lead.board.words, CLAIM) === opened) {
                nap(1);
                tries++;
            }
            alone = tries >= 5000;
        },
    );
    return lead;
}

const exited = (thread: GroundBandThread): Promise<void> =>
    new Promise((resolve) => {
        thread.on("exit", () => resolve());
    });

describe("the bands of the water on real threads (GroundBands)", () => {
    const groups: GroundBands[] = [];
    afterEach(() => {
        setWaterPassRunner(undefined);
        for (const group of groups.splice(0)) group.stop();
        vi.restoreAllMocks();
    });

    it("gives the same water as one thread, to the bit, on two, three and four bands", async () => {
        const reference = flooded(false);
        const expected = stateOf(reference, live(reference, 40));
        for (const followers of [1, 2, 3]) {
            const threads: Worker[] = [];
            const group = new GroundBands(
                followers,
                () => undefined,
                () => undefined,
                (start) => {
                    const worker = realWorker(start);
                    threads.push(worker);
                    return worker;
                },
                patientLead(followers, 7),
            );
            groups.push(group);
            setWaterPassRunner(group);
            const grid = flooded(true);
            expect(stateOf(grid, live(grid, 40)), `${followers + 1} bands`).toEqual(expected);
            const { here, others } = group.computed();
            // The other threads took their part, and this one too.
            expect(others).toBeGreaterThan(40);
            expect(here).toBeGreaterThan(40);
            expect(group.bands).toBe(followers + 1);
            // Stopped, its threads end by themselves.
            const ends = threads.map(exited);
            group.stop();
            // eslint-disable-next-line no-await-in-loop -- one group after the other: they share the runner of the thread
            await Promise.all(ends);
        }
    }, 60_000);

    it("goes on with one band less, the same water, when a thread of the bands is ended while it sleeps", async () => {
        const reference = flooded(false);
        const expected = stateOf(reference, live(reference, 15) + live(reference, 15));
        const threads: Worker[] = [];
        const left: [string, number][] = [];
        const group = new GroundBands(
            2,
            (reason, remaining) => left.push([reason, remaining]),
            () => undefined,
            (start) => {
                const worker = realWorker(start);
                threads.push(worker);
                return worker;
            },
            patientLead(2, 7),
        );
        groups.push(group);
        setWaterPassRunner(group);
        const grid = flooded(true);
        let lost = live(grid, 15);
        // Both threads are at work: they took slices.
        expect(group.computed().others).toBeGreaterThan(15);
        const gone = exited(threads[0]);
        await threads[0].terminate();
        await gone;
        expect(left).toEqual([[expect.stringMatching(/^exit/), 1]]);
        expect(group.bands).toBe(2);
        lost += live(grid, 15);
        expect(stateOf(grid, lost)).toEqual(expected);
    }, 60_000);

    it("ends right, on this thread alone, a step whose other threads never wake", () => {
        const reference = flooded(false);
        const expected = stateOf(reference, live(reference, 10));
        // Threads that never come: nothing is started.
        const group = new GroundBands(
            3,
            () => undefined,
            () => undefined,
            () => ({ on: () => undefined, terminate: () => undefined }),
        );
        groups.push(group);
        setWaterPassRunner(group);
        const grid = flooded(true);
        expect(stateOf(grid, live(grid, 10))).toEqual(expected);
        expect(group.computed().others).toBe(0);
    });

    it.each(["stuck", "throws"] as const)(
        "loses the step, says so and ends its threads when one of them is %s in the middle of a slice",
        async (fault) => {
            const threads: Worker[] = [];
            const failed: unknown[] = [];
            const group = new GroundBands(
                1,
                () => undefined,
                (error) => failed.push(error),
                (start) => {
                    const worker = faultyWorker(fault)(start);
                    // The error of the thread that throws is the fault asked for.
                    worker.on("error", () => undefined);
                    threads.push(worker);
                    return worker;
                },
                // The patience of who leads runs on a clock of the test: 400 ms each time it sleeps.
                patientLead(1, 1, () => nap(1)),
            );
            groups.push(group);
            setWaterPassRunner(group);
            const grid = flooded(true);
            const ended = exited(threads[0]);
            expect(() => grid.step(inertia)).toThrow(fault === "stuck" ? WaterBandsLost : "of the bands of the water");
            expect(failed).toHaveLength(1);
            expect(group.bands).toBe(1);
            // The thread that was stuck is ended with the group.
            await ended;
        },
        60_000,
    );
});

/** A thread of the grounds that does nothing, tells what the test wants and can be lost. */
function fakeGroundThread(): GroundThread & { tell(told: GroundTold): void; fail(error: unknown): void } {
    const listeners: { message?: (told: GroundTold) => void; error?: (error: unknown) => void } = {};
    return {
        postMessage: () => undefined,
        on: (event: string, listener: unknown) => {
            if (event === "message") listeners.message = listener as (told: GroundTold) => void;
            if (event === "error") listeners.error = listener as (error: unknown) => void;
        },
        terminate: () => undefined,
        tell: (told) => listeners.message?.(told),
        fail: (error) => listeners.error?.(error),
    };
}

describe("the bands of the water of a thread of the grounds (GroundThreads)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("starts a thread again with one band less after each loss of its bands, and without bands after three", () => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const asked: number[] = [];
        const made: ReturnType<typeof fakeGroundThread>[] = [];
        const threads = new GroundThreads(
            1,
            (bands) => {
                asked.push(bands);
                const thread = fakeGroundThread();
                made.push(thread);
                return thread;
            },
            4,
        );
        expect(threads.bands).toBe(4);
        const { room, port } = threads.assign();
        port.listen(
            room,
            () => undefined,
            () => undefined,
        );
        const wake = (): void => port.post({ kind: "close", room });
        wake();
        expect(asked).toEqual([4]);
        // A step lost to the bands: the thread ends on that error, and starts again with three bands.
        made[0].fail(new WaterBandsLost(1000));
        wake();
        expect(asked).toEqual([4, 3]);
        // Lost for another reason: as many bands as before.
        made[1].fail(new Error("something else"));
        wake();
        expect(asked).toEqual([4, 3, 3]);
        // A thread of the bands that ended while it slept: the thread of the grounds goes on, and is counted.
        made[2].tell({ kind: "band", room: 0, reason: "exit 1", remaining: 1 });
        expect(asked).toEqual([4, 3, 3]);
        expect(error).not.toHaveBeenCalledWith(expect.stringContaining("without bands"));
        made[2].fail(new Error("A pass failed on a thread of the bands of the water: the step is lost"));
        expect(error).toHaveBeenCalledWith(
            `Ground thread 1 of 1 lost threads of the bands of its water ${BAND_LOSSES_BEFORE_NONE} times: its water is computed without bands from now on`,
        );
        wake();
        expect(asked).toEqual([4, 3, 3, 1]);
    });
});
