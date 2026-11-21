import { describe, expect, it } from "vitest";
import {
    MOST_WHITECAPS,
    whitecapAlpha,
    Whitecaps,
    whitecapShare,
    windHeading,
} from "../../../../../src/front/Phaser/Game/Terrain/Whitecaps";

/** Numbers drawn in turn, always the same. */
function dice(): () => number {
    let seed = 12345;
    return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}
const view = { x: 0, y: 0, width: 1600, height: 900 };
const everywhere = (): boolean => true;
const settle = (caps: Whitecaps, windKmh: number | undefined, windFrom = 270): void => {
    for (let step = 0; step < 60; step++) caps.step(step * 66, 66, view, windKmh, windFrom);
};

describe("whitecapShare", () => {
    it("is nothing in a light wind, a little at force 4, more and more at force 5 and 6", () => {
        // Beaufort: force 2 up to 11 km/h, force 4 from 20 to 28, force 5 from 29 to 38, force 6 from 39 to 49.
        expect(whitecapShare(8)).toBe(0);
        expect(whitecapShare(undefined)).toBe(0);
        expect(whitecapShare(Number.NaN)).toBe(0);
        const force4 = whitecapShare(24);
        const force5 = whitecapShare(34);
        const force6 = whitecapShare(44);
        expect(force4).toBeGreaterThan(0.001);
        expect(force4).toBeLessThan(0.006);
        expect(force5).toBeGreaterThan(force4 * 2);
        expect(force6).toBeGreaterThan(force5 * 2);
        expect(force6).toBeLessThan(0.05);
        expect(whitecapShare(100000)).toBe(1);
    });
});

describe("windHeading", () => {
    it("is where the wind goes: south under a north wind, west under an east wind", () => {
        expect(windHeading(0)).toEqual({ x: 0, y: 1 });
        const east = windHeading(90);
        expect(east?.x).toBeCloseTo(-1, 5);
        expect(east?.y).toBeCloseTo(0, 5);
        expect(windHeading(undefined)).toBeUndefined();
    });
});

describe("Whitecaps", () => {
    it("has none in a calm, some at force 4, many more at force 6, never more than its most", () => {
        const calm = new Whitecaps(everywhere, dice());
        settle(calm, 8);
        expect(calm.caps()).toHaveLength(0);
        const force4 = new Whitecaps(everywhere, dice());
        settle(force4, 24);
        const force6 = new Whitecaps(everywhere, dice());
        settle(force6, 44);
        expect(force4.caps().length).toBeGreaterThan(5);
        expect(force6.caps().length).toBeGreaterThan(force4.caps().length * 2);
        const storm = new Whitecaps(everywhere, dice());
        settle(storm, 150);
        expect(storm.caps().length).toBeLessThanOrEqual(MOST_WHITECAPS);
    });

    it("breaks on open water only, and fewer where the screen shows less of it", () => {
        const dry = new Whitecaps(() => false, dice());
        settle(dry, 44);
        expect(dry.caps()).toHaveLength(0);
        // Open water on the west half of the screen only.
        // Force 4: under the most whitecaps a screen holds, so the share of water shows.
        const half = new Whitecaps((x) => x < 800, dice());
        settle(half, 24);
        const all = new Whitecaps(everywhere, dice());
        settle(all, 24);
        expect(half.caps().length).toBeGreaterThan(0);
        expect(half.caps().length).toBeLessThan(all.caps().length);
        for (const cap of half.caps()) expect(cap.x).toBeLessThan(800);
    });

    it("drifts downwind, and dies when the wind falls", () => {
        const caps = new Whitecaps(everywhere, dice());
        // A west wind (from 270 degrees): it blows towards the east.
        caps.step(0, 66, view, 60, 270);
        const [first] = caps.caps();
        const from = first.x;
        caps.step(66, 66, view, 60, 270);
        expect(first.x).toBeGreaterThan(from);
        caps.step(132, 66, view, 5, 270);
        expect(caps.caps()).toHaveLength(0);
    });

    it("comes in and goes out without a jump", () => {
        expect(whitecapAlpha({ x: 0, y: 0, half: 4, age: 0, life: 1000 })).toBe(0);
        expect(whitecapAlpha({ x: 0, y: 0, half: 4, age: 500, life: 1000 })).toBe(1);
        expect(whitecapAlpha({ x: 0, y: 0, half: 4, age: 1000, life: 1000 })).toBe(0);
    });
});
