import { describe, expect, it } from "vitest";
import { WaterTrend } from "../../../../../src/front/Phaser/Game/Terrain/WaterTrend";

/** Depths as the server tells them: in eighths of a pixel, a cell not told again until it moved a quarter pixel. */
function told(): (depth: number) => number {
    let last: number | undefined;
    return (depth: number): number => {
        const eighths = Math.round(depth * 8);
        if (last === undefined || Math.abs(eighths - last) >= 2) last = eighths;
        return last / 8;
    };
}

/** Messages 0.8 to 1.2 s apart, as a network delivers them. */
const gapMs = (index: number): number => 1000 + 200 * Math.sin(index * 2.7);

/** A clapot of two periods (2.2 s and 3 s) over a level, a cell deep of 40 px. */
const clapot = (seconds: number, amplitude = 1.5): number =>
    amplitude * Math.sin((2 * Math.PI * seconds) / 2.2) + amplitude * 0.7 * Math.sin((2 * Math.PI * seconds) / 3 + 1);

/** Feeds one cell `messages` states of `level(seconds)`, and gives what it shows after each one. */
function run(level: (seconds: number) => number, messages: number, trend = new WaterTrend()): number[] {
    const tell = told();
    let now = 0;
    let depth = tell(level(0));
    trend.reset(Float32Array.of(depth), now);
    const shown: number[] = [];
    for (let index = 1; index <= messages; index++) {
        now += gapMs(index);
        const before = Float32Array.of(depth);
        depth = tell(level(now / 1000));
        trend.add(before, Float32Array.of(depth), now);
        shown.push(trend.shown()[0]);
    }
    return shown;
}

describe("WaterTrend", () => {
    it("shows no rise nor fall on water that only ripples, whatever its waves", () => {
        for (const amplitude of [0.3, 1.5, 4]) {
            const shown = run((seconds) => 40 + clapot(seconds, amplitude), 120);
            expect(
                shown.filter((sign) => sign !== 0),
                `waves of ${amplitude} px`,
            ).toEqual([]);
        }
    });

    it("shows a steady rise under the ripples as a rise, without changing its mind", () => {
        // 0.1 px a second (3.4 mm a second, 20 cm a minute), the level of a pond a source fills.
        const shown = run((seconds) => 40 + 0.1 * seconds + clapot(seconds, 0.5), 90);
        expect(shown.slice(15)).toEqual(shown.slice(15).map(() => 1));
    });

    it("shows a rise on a rough sea too, never as a fall", () => {
        // Waves of 5 cm and more: a slow rise may be lost in them, but never shown as a fall; 1.2 m a minute shows.
        expect(run((seconds) => 40 + 0.1 * seconds + clapot(seconds), 90).every((sign) => sign >= 0)).toBe(true);
        const shown = run((seconds) => 40 + 0.6 * seconds + clapot(seconds), 90);
        expect(shown.slice(15)).toEqual(shown.slice(15).map(() => 1));
    });

    it("shows a steady fall under the ripples as a fall", () => {
        const shown = run((seconds) => 60 - 0.1 * seconds + clapot(seconds, 0.5), 90);
        expect(shown.slice(15)).toEqual(shown.slice(15).map(() => -1));
    });

    it("shows a sudden flood within a few seconds", () => {
        // Still water, then a flood that raises it 2 px a second (7 cm a second) from the 30th second on.
        const shown = run((seconds) => 40 + Math.max(0, seconds - 30) * 2 + clapot(seconds, 0.3), 40);
        const first = shown.findIndex((sign) => sign === 1);
        expect(first).toBeGreaterThanOrEqual(29);
        // Messages about a second apart: shown within three of the start of the flood.
        expect(first).toBeLessThanOrEqual(32);
    });

    it("stops showing a rise once the water is calm again", () => {
        const shown = run((seconds) => 40 + Math.min(seconds, 30) * 0.3 + clapot(seconds, 0.3), 70);
        expect(shown[25]).toBe(1);
        expect(shown.slice(45)).toEqual(shown.slice(45).map(() => 0));
    });

    it("lets the tint die when the server falls silent, as it does over still water", () => {
        const trend = new WaterTrend();
        run((seconds) => 40 + seconds * 0.5, 20, trend);
        expect(trend.shown()[0]).toBe(1);
        // The last state came at about 20 s; nothing more comes.
        const lastAt = Array.from({ length: 20 }, (_, index) => gapMs(index + 1)).reduce((sum, gap) => sum + gap, 0);
        trend.idle(lastAt + 1500);
        expect(trend.shown()[0]).toBe(1);
        trend.idle(lastAt + 20_000);
        expect(trend.shown()[0]).toBe(0);
        expect(Math.abs(trend.trend()[0])).toBeLessThan(0.05);
    });

    it("tells the trend in pixels a second, the clapot left out", () => {
        const trend = new WaterTrend();
        run((seconds) => 40 + 0.2 * seconds + clapot(seconds, 0.5), 60, trend);
        expect(trend.trend()[0]).toBeGreaterThan(0.15);
        expect(trend.trend()[0]).toBeLessThan(0.25);
    });

    it("starts again from nothing on another grid", () => {
        const trend = new WaterTrend();
        run((seconds) => 40 + seconds, 20, trend);
        trend.reset(new Float32Array(4), 50_000);
        expect(Array.from(trend.trend())).toEqual([0, 0, 0, 0]);
        expect(Array.from(trend.shown())).toEqual([0, 0, 0, 0]);
    });
});
