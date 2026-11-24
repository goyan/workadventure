import { describe, expect, it } from "vitest";
import { FastDayClock, fastDaySpeed } from "@wa/front/Phaser/Game/Night/FastDayClock";

const MINUTE = 60_000;

describe("FastDayClock", () => {
    it("is the real sky while off", () => {
        const clock = new FastDayClock();
        expect(clock.ahead(5_000, false, 10)).toBe(0);
    });

    it("goes `speed` minutes of sky a second from when it is turned on", () => {
        const clock = new FastDayClock();
        expect(clock.ahead(10_000, true, 3)).toBe(0);
        // Ten seconds later, thirty minutes of sky went by: ten seconds of them are the real time.
        expect(clock.ahead(20_000, true, 3)).toBe(30 * MINUTE - 10_000);
    });

    it("goes on from the sky reached when its speed changes, and back to the real sky once off", () => {
        const clock = new FastDayClock();
        clock.ahead(0, true, 1);
        const reached = clock.ahead(6_000, true, 10);
        // Six seconds at a minute a second: six minutes of sky, six seconds of them real.
        expect(reached).toBe(6 * MINUTE - 6_000);
        // Then two seconds at ten minutes a second.
        expect(clock.ahead(8_000, true, 10)).toBe(reached + 20 * MINUTE - 2_000);
        expect(clock.ahead(9_000, false, 10)).toBe(0);
        // Turned on again: from the real sky.
        expect(clock.ahead(10_000, true, 10)).toBe(0);
    });

    it("keeps its speed within one to ten minutes a second, whole", () => {
        expect(fastDaySpeed(0)).toBe(1);
        expect(fastDaySpeed(4.4)).toBe(4);
        expect(fastDaySpeed(42)).toBe(10);
        expect(fastDaySpeed(Number.NaN)).toBe(1);
    });
});
