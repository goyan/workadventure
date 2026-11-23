import { Gauge, register } from "prom-client";
import type { Registry } from "prom-client";
import { groundTimingsBoard } from "../Model/Ground/GroundTimings";
import type { GroundTimingsBoard } from "../Model/Ground/GroundTimings";

/**
 * The metrics of the ground of the rooms: how long the steps of the water take and the share of its thread the
 * ground takes, over the window since they were last read (as the lag of the event loop). No room is named: the
 * steps of all the rooms together, and the threads by their place.
 */
export function registerGroundMetrics(
    board: GroundTimingsBoard = groundTimingsBoard,
    registry: Registry = register,
): void {
    const registers = [registry];
    const gauge = (name: string, help: string, collect?: () => void): Gauge =>
        new Gauge({ name, help, registers, ...(collect ? { collect } : {}) });
    // Registered first, so read first: it empties the window and sets the others, as the lag of the event loop of
    // prom-client does.
    const p50 = gauge(
        "workadventure_water_step_p50_seconds",
        "Duration under which half the steps of the water were, since the last reading (0: no step).",
        () => {
            const read = board.read();
            p50.set(read.p50Ms / 1000);
            p90.set(read.p90Ms / 1000);
            p99.set(read.p99Ms / 1000);
            longest.set(read.longestMs / 1000);
            steps.set(read.steps);
            busy.reset();
            for (const [thread, share] of read.busy) busy.set({ thread }, share);
        },
    );
    const p90 = gauge(
        "workadventure_water_step_p90_seconds",
        "Duration under which 90 % of the steps of the water were, since the last reading.",
    );
    const p99 = gauge(
        "workadventure_water_step_p99_seconds",
        "Duration under which 99 % of the steps of the water were, since the last reading.",
    );
    const longest = gauge("workadventure_water_step_max_seconds", "Longest step of the water since the last reading.");
    const steps = gauge("workadventure_water_steps", "Number of steps of the water since the last reading.");
    const busy = new Gauge({
        name: "workadventure_ground_busy_ratio",
        help: 'Share of its time (0 to 1) a thread gave the steps of the water and of the meadow since the last reading. thread="rooms": the thread of the rooms; a number: a thread of the grounds (GROUND_THREADS).',
        labelNames: ["thread"] as const,
        registers,
    });
}
