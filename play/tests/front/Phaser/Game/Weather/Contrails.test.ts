import { describe, expect, it } from "vitest";
import {
    CONTRAIL_LIFE_SECONDS,
    CONTRAIL_SLOT_SECONDS,
    MAX_CONTRAILS,
    arcPoint,
    contrailZoomFade,
    contrails,
} from "../../../../../src/front/Phaser/Game/Weather/Contrails";

const map = { width: 7680, height: 5120 };
const still = { x: 0, y: 0 };
const slots = Array.from({ length: 400 }, (_, slot) => (slot + 0.5) * CONTRAIL_SLOT_SECONDS * 1000);

describe("contrails", () => {
    it("gives everyone the same trails at the same time", () => {
        expect(contrails(slots[7], still, map, 1, 0)).toEqual(contrails(slots[7], still, map, 1, 0));
    });

    it("has a plane in some slots of time only, never more trails than the shader takes", () => {
        const counts = slots.map((epoch) => contrails(epoch, still, map, 1, 0).length);
        expect(counts.some((count) => count === 0)).toBe(true);
        expect(counts.some((count) => count > 0)).toBe(true);
        expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_CONTRAILS);
    });

    it("shows faint trails and the lights of the planes at night, nothing under an overcast sky, fainter trails under clouds", () => {
        const epoch = slots.find((at) => contrails(at, still, map, 1, 0).length > 0) ?? 0;
        // At night: fainter trails, and the lights of the planes.
        const night = contrails(epoch, still, map, 0, 0);
        expect(night.length).toBeGreaterThan(0);
        for (const trail of night) {
            expect(trail.strength).toBeGreaterThan(0);
            expect(trail.strength).toBeLessThan(0.5);
            expect(trail.lights).toBe(1);
        }
        expect(contrails(epoch, still, map, 1, 1)).toEqual([]);
        expect(contrails(epoch, still, map, 1, 0.5)[0].strength).toBeLessThan(
            contrails(epoch, still, map, 1, 0)[0].strength,
        );
    });

    it("grows behind the plane, then stays in the air and drifts with it", () => {
        const drift = { x: 20, y: 0 };
        const epoch = slots.find((at) => contrails(at, drift, map, 1, 0).some((trail) => trail.flying)) ?? 0;
        const before = contrails(epoch, drift, map, 1, 0).find((trail) => trail.flying);
        const after = contrails(epoch + 1000, drift, map, 1, 0).find((trail) => trail.speed === before?.speed);
        if (!before || !after) throw new Error("Expected a plane flying");
        if (after.flying) expect(after.length).toBeCloseTo(before.length + before.speed, 3);
        // Up where the planes fly, the wind blows the same way as the clouds' one, twice as fast.
        expect(after.x).toBeCloseTo(before.x + 2 * drift.x, 3);
        expect(after.y).toBeCloseTo(before.y + 2 * drift.y, 3);
        expect(after.wind).toEqual({ x: 2 * drift.x, y: 0 });
    });

    it("keeps the high wind well below the speed of a plane", () => {
        const storm = { x: 0, y: -180 };
        const trail = slots.flatMap((epoch) => contrails(epoch, storm, map, 1, 0))[0];
        expect(Math.hypot(trail.wind.x, trail.wind.y)).toBeLessThanOrEqual(60);
    });

    it("dissolves soon in dry air, persists longer in moist air", () => {
        const lives = slots.flatMap((epoch) => contrails(epoch, still, map, 1, 0).map((trail) => trail.life));
        expect(Math.min(...lives)).toBeLessThan(40);
        expect(Math.max(...lives)).toBeGreaterThan(70);
        for (const life of lives) expect(life).toBeLessThanOrEqual(CONTRAIL_LIFE_SECONDS);
    });

    it("lets a trail go once it has faded", () => {
        for (const epoch of slots) {
            for (const trail of contrails(epoch, still, map, 1, 0)) {
                expect(trail.length / trail.speed).toBeLessThanOrEqual(CONTRAIL_SLOT_SECONDS);
            }
        }
        expect(CONTRAIL_LIFE_SECONDS).toBeLessThan(CONTRAIL_SLOT_SECONDS);
    });

    it("hides the trails zoomed in, sooner than the clouds: they fly higher", () => {
        expect(contrailZoomFade(0.4)).toBe(1);
        expect(contrailZoomFade(0.75)).toBeGreaterThan(0);
        expect(contrailZoomFade(0.75)).toBeLessThan(1);
        expect(contrailZoomFade(1)).toBe(0);
        expect(contrailZoomFade(Number.NaN)).toBe(1);
    });

    it("flies some planes straight, turns the others wide, either way", () => {
        const trails = slots.flatMap((epoch) => contrails(epoch, still, map, 1, 0));
        expect(trails.some((trail) => trail.curvature === 0)).toBe(true);
        expect(trails.some((trail) => trail.curvature > 0)).toBe(true);
        expect(trails.some((trail) => trail.curvature < 0)).toBe(true);
    });

    it("draws the arc of a turning plane as a circle, and a straight line without a turn", () => {
        const east = { x: 1, y: 0 };
        expect(arcPoint(east, 0, 100)).toEqual({ x: 100, y: 0 });
        // A quarter turn towards (-direction.y, direction.x), +y here, on a radius of 100.
        const quarter = arcPoint(east, 0.01, (Math.PI / 2) * 100);
        expect(quarter.x).toBeCloseTo(100, 6);
        expect(quarter.y).toBeCloseTo(100, 6);
    });

    it("sends a random number of planes, mostly none or one at a time", () => {
        const counts = slots.map((epoch) => contrails(epoch, still, map, 1, 0).filter((trail) => trail.flying).length);
        expect(counts.filter((count) => count === 0).length).toBeGreaterThan(counts.length * 0.3);
        expect(counts.some((count) => count === 1)).toBe(true);
        expect(counts.some((count) => count === 2)).toBe(true);
    });

    it("lights the planes from the second half of the dusk on, never by day", () => {
        const epoch = slots.find((at) => contrails(at, still, map, 1, 0).some((trail) => trail.flying)) ?? 0;
        expect(contrails(epoch, still, map, 1, 0)[0].lights).toBe(0);
        expect(contrails(epoch, still, map, 0.5, 0)[0].lights).toBe(0);
        expect(contrails(epoch, still, map, 0.25, 0)[0].lights).toBeCloseTo(0.5, 6);
    });
});
