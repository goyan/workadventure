import { describe, expect, it } from "vitest";
import { DRAIN_TURN_MS, drainRings, drainStrands } from "../../../../../src/front/Phaser/Game/Catastrophe/DrainSwirl";

const far = (point: { x: number; y: number }): number => Math.hypot(point.x, point.y);
const angleOf = (point: { x: number; y: number }): number => Math.atan2(point.y, point.x);
/** How far a point turned around the middle between two angles, the short way. */
const turned = (from: number, to: number): number => {
    const gone = Math.abs(to - from) % (2 * Math.PI);
    return Math.min(gone, 2 * Math.PI - gone);
};

describe("drainStrands", () => {
    it("draws as many wisps as asked, all within the disc, each curling inwards", () => {
        const strands = drainStrands(0, 60, false);
        expect(strands).toHaveLength(60);
        for (const strand of strands) {
            expect(strand.points.length).toBeGreaterThanOrEqual(6);
            for (const point of strand.points) expect(far(point)).toBeLessThanOrEqual(1.0001);
            const first = strand.points[0];
            const last = strand.points[strand.points.length - 1];
            expect(far(last)).toBeLessThan(far(first));
            expect(turned(angleOf(first), angleOf(last))).toBeGreaterThan(0.5);
            expect([0, 1, 2, 3]).toContain(strand.tone);
            expect(strand.alpha).toBeGreaterThanOrEqual(0);
            expect(strand.alpha).toBeLessThanOrEqual(1);
            expect(strand.width).toBeGreaterThan(0);
        }
    });

    it("spreads them over the whole disc, in every tone, and leaves the eye empty", () => {
        const strands = drainStrands(0, 60, false);
        const starts = strands.map((strand) => far(strand.points[0]));
        expect(Math.min(...starts)).toBeLessThan(0.4);
        expect(Math.max(...starts)).toBeGreaterThan(0.9);
        expect(new Set(strands.map((strand) => strand.tone)).size).toBe(4);
        for (const strand of strands) for (const point of strand.points) expect(far(point)).toBeGreaterThan(0.09);
    });

    it("fades at the rim: the whirl has no edge", () => {
        const strands = drainStrands(0, 120, false);
        const outermost = strands.reduce((one, other) => (far(other.points[0]) > far(one.points[0]) ? other : one));
        const midway = strands.filter((strand) => far(strand.points[0]) < 0.7);
        expect(outermost.alpha).toBeLessThan(Math.min(...midway.map((strand) => strand.alpha)));
    });

    it("turns with the time, faster next to the eye than at the rim, keeping the shape of each wisp", () => {
        const before = drainStrands(0, 60, false);
        const after = drainStrands(100, 60, false);
        const outer = before.reduce(
            (best, strand, index) => (far(strand.points[0]) > far(before[best].points[0]) ? index : best),
            0,
        );
        const inner = before.reduce(
            (best, strand, index) => (far(strand.points[0]) < far(before[best].points[0]) ? index : best),
            0,
        );
        const outerTurn = turned(angleOf(before[outer].points[0]), angleOf(after[outer].points[0]));
        const innerTurn = turned(angleOf(before[inner].points[0]), angleOf(after[inner].points[0]));
        expect(outerTurn).toBeGreaterThan(0);
        expect(innerTurn).toBeGreaterThan(outerTurn * 2);
        expect(far(after[outer].points[0])).toBeCloseTo(far(before[outer].points[0]));
    });

    it("takes the water at the rim about one DRAIN_TURN_MS to go round", () => {
        const before = drainStrands(0, 120, false);
        const after = drainStrands(DRAIN_TURN_MS / 4, 120, false);
        const outer = before.reduce(
            (best, strand, index) => (far(strand.points[0]) > far(before[best].points[0]) ? index : best),
            0,
        );
        const quarter = turned(angleOf(before[outer].points[0]), angleOf(after[outer].points[0]));
        expect(quarter).toBeGreaterThan(Math.PI / 2);
        expect(quarter).toBeLessThan(Math.PI);
    });

    it("stays still for who asked for less motion", () => {
        expect(drainStrands(900, 40, true)).toEqual(drainStrands(0, 40, true));
    });
});

describe("drainRings", () => {
    it("darkens towards the middle from a rim that hardly shows", () => {
        const rings = drainRings();
        expect(rings.length).toBeGreaterThanOrEqual(5);
        expect(rings[0].radius).toBe(1);
        expect(rings[0].alpha).toBeLessThan(0.1);
        for (let index = 1; index < rings.length; index++) {
            expect(rings[index].radius).toBeLessThan(rings[index - 1].radius);
            expect(rings[index].alpha).toBeGreaterThan(rings[index - 1].alpha);
        }
    });
});
