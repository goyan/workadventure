import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CpuTracker, playersThreadCpuUsage } from "../src/Services/CpuTracker";

/**
 * The "overheat" of the server judges the thread that serves the players, not the whole process: a thread that
 * computes the ground of the rooms may take a core without the moves of the players being dropped.
 * Nothing here expects a duration: the threads compute until they have used a given processor time.
 */

const usedMs = (usage: NodeJS.CpuUsage): number => (usage.user + usage.system) / 1000;

/** A thread that computes until it has used `ms` of processor time, then says so and ends. */
function burnOnAThread(ms: number): Promise<void> {
    const worker = new Worker(
        `const start = process.threadCpuUsage();
         for (;;) { const now = process.threadCpuUsage(start); if ((now.user + now.system) / 1000 >= ${ms}) break; }
         require("node:worker_threads").parentPort.postMessage("done");`,
        { eval: true },
    );
    return new Promise((resolve, reject) => {
        worker.once("message", () => resolve());
        worker.once("error", reject);
    });
}

/** This thread computes until it has used `ms` of processor time. */
function burnHere(ms: number): void {
    const start = playersThreadCpuUsage();
    for (;;) {
        const now = playersThreadCpuUsage();
        if (usedMs(now) - usedMs(start) >= ms) return;
    }
}

describe("the overheat of the server (CpuTracker)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("does not overheat while another thread of the process takes a core", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const tracker = new CpuTracker(50, undefined, false);
        const process0 = process.cpuUsage();
        await burnOnAThread(400);
        tracker.sample();
        // The process did use that time: reading the process would have seen it.
        expect(usedMs(process.cpuUsage(process0))).toBeGreaterThanOrEqual(400);
        expect(tracker.getCpuPercent()).toBeLessThan(50);
        expect(tracker.isOverHeating()).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    }, 60_000);

    it("overheats when the thread of the players is saturated, and cools down once it rests", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        // A low threshold: on a busy machine a thread that never stops still gets only a part of a core.
        const tracker = new CpuTracker(20, undefined, false);
        burnHere(300);
        tracker.sample();
        expect(tracker.getCpuPercent()).toBeGreaterThan(20);
        expect(tracker.isOverHeating()).toBe(true);
        expect(warn).toHaveBeenCalledWith('CPU high threshold alert. Going in "overheat" mode');
        // It rests while another thread computes: back to normal.
        await burnOnAThread(300);
        tracker.sample();
        expect(tracker.isOverHeating()).toBe(false);
        expect(info).toHaveBeenCalledWith('CPU is back to normal. Canceling "overheat" mode');
    }, 60_000);

    it("judges by the share of the time between two readings, against its threshold", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        // A clock and a processor time the test moves: 100 ms between two readings.
        let nanoseconds = 0n;
        let micro = 0;
        vi.spyOn(process.hrtime, "bigint").mockImplementation(() => nanoseconds);
        const tracker = new CpuTracker(80, () => ({ user: micro, system: 0 }), false);
        const after = (cpuMs: number): number => {
            nanoseconds += 100_000_000n;
            micro += cpuMs * 1000;
            tracker.sample();
            return tracker.getCpuPercent();
        };
        expect(after(80)).toBe(80);
        expect(tracker.isOverHeating()).toBe(false);
        expect(after(81)).toBe(81);
        expect(tracker.isOverHeating()).toBe(true);
        expect(after(80)).toBe(80);
        expect(tracker.isOverHeating()).toBe(false);
    });
});
