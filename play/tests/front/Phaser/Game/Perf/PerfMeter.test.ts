import { describe, expect, it } from "vitest";
import { PERF_WINDOW_MS, PerfMeter } from "../../../../../src/front/Phaser/Game/Perf/PerfMeter";

/**
 * Runs `count` steps of the game `gap` ms apart from `from`, each taking `update` ms to work out; one in `every` is
 * drawn, in `render` ms.
 */
function run(meter: PerfMeter, from: number, count: number, gap: number, update = 2, render = 1, every = 1) {
    let stats;
    for (let index = 0; index < count; index++) {
        if (index % every === 0) meter.drawn(render);
        stats = meter.step(from + index * gap, update) ?? stats;
    }
    return stats;
}

describe("PerfMeter", () => {
    it("says nothing before a window of images has gone by", () => {
        const meter = new PerfMeter();
        expect(meter.step(0, 2)).toBeUndefined();
        expect(meter.step(16, 2)).toBeUndefined();
    });

    it("counts the images of a second, and what each costs on average", () => {
        const stats = run(new PerfMeter(), 0, 61, 1000 / 60, 3, 1.5);

        expect(stats?.fps).toBeCloseTo(60, 0);
        expect(stats?.drawnFps).toBeCloseTo(60, 0);
        expect(stats?.worstMs).toBeCloseTo(1000 / 60, 1);
        expect(stats?.updateMs).toBeCloseTo(3);
        expect(stats?.renderMs).toBeCloseTo(1.5);
    });

    // The game draws the scene again only when something changed on it: a still scene is not a slow one.
    it("tells the images the screen shows from the ones the game drew again", () => {
        // 60 steps a second, one in three drawn: smooth, with little to draw.
        const stats = run(new PerfMeter(), 0, 61, 1000 / 60, 3, 6, 3);

        expect(stats?.fps).toBeCloseTo(60, 0);
        expect(stats?.drawnFps).toBeCloseTo(20, 0);
        // What drawing costs is told for the images that were drawn, not spread over the others.
        expect(stats?.renderMs).toBeCloseTo(6);
        expect(stats?.updateMs).toBeCloseTo(3);
    });

    it("gives no cost of drawing when nothing was drawn", () => {
        const meter = new PerfMeter();
        let stats;
        for (let index = 0; index < 61; index++) stats = meter.step(index * 16, 2) ?? stats;
        expect(stats?.fps).toBeGreaterThan(55);
        expect(stats?.drawnFps).toBe(0);
        expect(stats?.renderMs).toBe(0);
    });

    it("shows the longest wait between two images of the window: a hitch the average hides", () => {
        const meter = new PerfMeter();
        run(meter, 0, 10, 16);
        // One image comes 120 ms late, then the rhythm is back.
        const stats = run(meter, 9 * 16 + 120, 30, 16);

        expect(stats?.worstMs).toBeCloseTo(120);
        expect(stats?.fps).toBeLessThan(60);
    });

    it("starts each window afresh: an old hitch is forgotten", () => {
        const meter = new PerfMeter();
        run(meter, 0, 5, 16);
        run(meter, 4 * 16 + 300, 40, 16);
        const later = run(meter, 4 * 16 + 300 + 40 * 16, 80, 16);

        expect(later?.worstMs).toBeCloseTo(16);
    });

    it("gives its figures about twice a second", () => {
        const meter = new PerfMeter();
        let given = 0;
        for (let time = 0; time <= 2000; time += 10) {
            if (meter.step(time, 1)) given++;
        }
        expect(given).toBe(Math.floor(2000 / PERF_WINDOW_MS));
    });
});
