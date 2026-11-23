import { DEFAULT_FIRE_THRESHOLDS, NEUTRAL_FIRE_CONDITIONS } from "@workadventure/map-editor";
import { Registry } from "prom-client";
import { describe, expect, it, vi } from "vitest";
import { GroundThreads } from "../src/Model/Ground/GroundThreads";
import type { GroundThread } from "../src/Model/Ground/GroundThreads";
import type { GroundRoomState, GroundTold } from "../src/Model/Ground/GroundProtocol";
import { GroundTimings, GroundTimingsBoard } from "../src/Model/Ground/GroundTimings";
import type { GroundTimingsBatch } from "../src/Model/Ground/GroundTimings";
import { registerGroundMetrics } from "../src/Services/GroundMetrics";

const EMPTY_STATE: GroundRoomState = {
    mapSize: undefined,
    walkers: [],
    downpours: [],
    drains: [],
    balls: [],
    grazers: [],
    air: undefined,
    fire: NEUTRAL_FIRE_CONDITIONS,
    thresholds: DEFAULT_FIRE_THRESHOLDS,
    slots: undefined,
};

/** A clock moved by hand (ms). */
function handClock(): { now: () => number; advance: (ms: number) => void } {
    let at = 1000;
    return { now: () => at, advance: (ms) => (at += ms) };
}

describe("GroundTimings", () => {
    it("gives the durations of the steps of the water within 5 %, and the longest exactly", () => {
        const clock = handClock();
        const here = new GroundTimings(clock.now);
        const board = new GroundTimingsBoard(here);
        // 100 steps: 1 ms to 100 ms.
        for (let ms = 1; ms <= 100; ms++) here.waterStepped(ms);
        clock.advance(10_000);
        const read = board.read();
        expect(read.steps).toBe(100);
        expect(read.p50Ms).toBeGreaterThanOrEqual(50);
        expect(read.p50Ms).toBeLessThanOrEqual(50 * 1.05);
        expect(read.p90Ms).toBeGreaterThanOrEqual(90);
        expect(read.p90Ms).toBeLessThanOrEqual(90 * 1.05);
        expect(read.p99Ms).toBeGreaterThanOrEqual(99);
        expect(read.p99Ms).toBeLessThanOrEqual(100);
        expect(read.longestMs).toBe(100);
    });

    it("gives the share of its time a thread gave the water and the meadow, by thread and never by room", () => {
        const clock = handClock();
        const here = new GroundTimings(clock.now);
        const board = new GroundTimingsBoard(here);
        // The thread of the rooms: 2 s of water (its step, then its copy) and 1 s of meadow, in 10 s.
        here.waterStepped(1500, 2000);
        here.took(1000);
        clock.advance(10_000);
        // A thread of the grounds: 4.5 s in 6 s, told in two batches.
        board.add("1", { steps: [], longestMs: 0, busyMs: 1500, spanMs: 3000 });
        board.add("1", { steps: [], longestMs: 0, busyMs: 3000, spanMs: 3000 });
        const read = board.read();
        expect([...read.busy.keys()].sort()).toEqual(["1", "rooms"]);
        expect(read.busy.get("rooms")).toBeCloseTo(0.3, 10);
        expect(read.busy.get("1")).toBeCloseTo(0.75, 10);
    });

    it("starts a new window at each reading", () => {
        const clock = handClock();
        const here = new GroundTimings(clock.now);
        const board = new GroundTimingsBoard(here);
        here.waterStepped(40);
        board.add("1", { steps: [[0, 3]], longestMs: 0.005, busyMs: 1, spanMs: 1000 });
        clock.advance(1000);
        expect(board.read().steps).toBe(4);
        clock.advance(1000);
        const empty = board.read();
        expect(empty).toMatchObject({ steps: 0, p50Ms: 0, p90Ms: 0, p99Ms: 0, longestMs: 0 });
        // The thread of the rooms computed nothing in that second; the thread of the grounds told nothing.
        expect([...empty.busy]).toEqual([["rooms", 0]]);
    });

    it("leaves out what is not a duration, and a batch that names no bucket", () => {
        const clock = handClock();
        const here = new GroundTimings(clock.now);
        const board = new GroundTimingsBoard(here);
        here.waterStepped(Number.NaN);
        here.waterStepped(-1);
        here.took(Number.POSITIVE_INFINITY);
        board.add("1", {
            steps: [
                [-1, 5],
                [100_000, 5],
                [1.5, 5],
            ],
            longestMs: 0,
            busyMs: 0,
            spanMs: 0,
        });
        clock.advance(1000);
        const read = board.read();
        expect(read.steps).toBe(0);
        expect(read.busy.get("rooms")).toBe(0);
        // No time of that thread was spanned: no share to give.
        expect(read.busy.has("1")).toBe(false);
    });

    it("gathers what a thread of the grounds tells under the place of that thread", () => {
        const clock = handClock();
        const board = new GroundTimingsBoard(new GroundTimings(clock.now));
        let tell: ((told: GroundTold) => void) | undefined;
        const thread = {
            postMessage: () => undefined,
            on: (event: string, listener: unknown) => {
                if (event === "message") tell = listener as (told: GroundTold) => void;
            },
            terminate: () => undefined,
        } as GroundThread;
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const threads = new GroundThreads(1, () => thread, 1, board);
        const { room, port } = threads.assign();
        port.post({ kind: "close", room });
        info.mockRestore();
        tell?.({ kind: "timings", room: 0, batch: { steps: [[0, 2]], longestMs: 0.004, busyMs: 250, spanMs: 1000 } });
        clock.advance(1000);
        const read = board.read();
        expect(read.steps).toBe(2);
        expect(read.longestMs).toBe(0.004);
        expect(read.busy.get("1")).toBe(0.25);
    });
});

describe("GroundWorker", () => {
    it("tells how long its steps took once a second while it has a room", async () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const board = new GroundTimingsBoard(new GroundTimings());
        const told = new Promise<GroundTimingsBatch>((resolve) => {
            vi.spyOn(board, "add").mockImplementation((thread, batch) => {
                if (thread === "1") resolve(batch);
            });
        });
        const threads = new GroundThreads(1, undefined, 1, board);
        try {
            const { room, port } = threads.assign();
            port.listen(
                room,
                () => undefined,
                () => undefined,
            );
            port.post({
                kind: "open",
                room,
                roomUrl: "timings",
                wam: undefined,
                state: EMPTY_STATE,
                manual: { seed: 1 },
            });
            const batch = await told;
            // A room without a map: no step, and about a second of the time of the thread.
            expect(batch.steps).toEqual([]);
            expect(batch.busyMs).toBe(0);
            expect(batch.spanMs).toBeGreaterThan(500);
        } finally {
            threads.stop();
            info.mockRestore();
        }
    }, 30_000);
});

describe("registerGroundMetrics", () => {
    it("tells the window in seconds, without the name of a room, and empties it", async () => {
        const clock = handClock();
        const here = new GroundTimings(clock.now);
        const board = new GroundTimingsBoard(here);
        const registry = new Registry();
        registerGroundMetrics(board, registry);
        for (let step = 0; step < 10; step++) here.waterStepped(20, 25);
        clock.advance(1000);
        board.add("1", { steps: [], longestMs: 0, busyMs: 500, spanMs: 1000 });
        const first = await registry.metrics();
        expect(first).toContain("workadventure_water_steps 10\n");
        expect(first).toContain("workadventure_water_step_max_seconds 0.02\n");
        expect(first).toContain('workadventure_ground_busy_ratio{thread="rooms"} 0.25\n');
        expect(first).toContain('workadventure_ground_busy_ratio{thread="1"} 0.5\n');
        const p50 = Number(/^workadventure_water_step_p50_seconds (\S+)$/m.exec(first)?.[1]);
        expect(p50).toBeGreaterThanOrEqual(0.02 / 1.05);
        expect(p50).toBeLessThanOrEqual(0.02);
        expect(first).not.toMatch(/room="|http/);

        clock.advance(1000);
        const second = await registry.metrics();
        expect(second).toContain("workadventure_water_steps 0\n");
        expect(second).toContain("workadventure_water_step_p50_seconds 0\n");
        expect(second).toContain('workadventure_ground_busy_ratio{thread="rooms"} 0\n');
        expect(second).not.toContain('thread="1"');
    });
});
