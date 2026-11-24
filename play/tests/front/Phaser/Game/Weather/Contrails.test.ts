import { describe, expect, it } from "vitest";
import {
    CONTRAIL_LIFE_SECONDS,
    CONTRAIL_SLOT_SECONDS,
    MAX_CONTRAILS,
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

    it("shows none at night nor under an overcast sky, and fainter ones under clouds", () => {
        const epoch = slots.find((at) => contrails(at, still, map, 1, 0).length > 0) ?? 0;
        expect(contrails(epoch, still, map, 0, 0)).toEqual([]);
        expect(contrails(epoch, still, map, 1, 1)).toEqual([]);
        expect(contrails(epoch, still, map, 1, 0.5)[0].strength).toBeLessThan(
            contrails(epoch, still, map, 1, 0)[0].strength,
        );
    });

    it("grows behind the plane, then stays in the air and drifts with it", () => {
        const drift = { x: 40, y: 0 };
        const epoch = slots.find((at) => contrails(at, drift, map, 1, 0).some((trail) => trail.flying)) ?? 0;
        const before = contrails(epoch, drift, map, 1, 0).find((trail) => trail.flying);
        const after = contrails(epoch + 1000, drift, map, 1, 0).find((trail) => trail.speed === before?.speed);
        if (!before || !after) throw new Error("Expected a plane flying");
        if (after.flying) expect(after.length).toBeCloseTo(before.length + before.speed, 3);
        expect(after.x).toBeCloseTo(before.x + drift.x, 3);
        expect(after.y).toBeCloseTo(before.y + drift.y, 3);
    });

    it("lets a trail go once it has faded", () => {
        for (const epoch of slots) {
            for (const trail of contrails(epoch, still, map, 1, 0)) {
                expect(trail.length / trail.speed).toBeLessThanOrEqual(CONTRAIL_SLOT_SECONDS);
            }
        }
        expect(CONTRAIL_LIFE_SECONDS).toBeLessThan(CONTRAIL_SLOT_SECONDS);
    });
});
