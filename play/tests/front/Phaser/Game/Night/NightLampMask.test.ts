import { describe, expect, it } from "vitest";
import { LampSteadiness, MOVING_DRAWINGS } from "../../../../../src/front/Phaser/Game/Night/NightLampMask";
import type { RgbLampLight } from "../../../../../src/front/Stores/RgbLampStore";

const lamp = (id: string, revision = 1, extra: Partial<RgbLampLight> = {}): RgbLampLight =>
    ({ id, revision, x: 100, y: 100, size: 64, textureKey: `rgb-lamp:${id}`, ...extra });

describe("LampSteadiness", () => {
    it("takes every lamp as steady when it first sees them, and keeps them so while nothing changes", () => {
        const steadiness = new LampSteadiness();
        const lamps = [lamp("a"), lamp("b"), lamp("c")];
        const first = steadiness.split(lamps);
        expect(first.steady.map((each) => each.id)).toEqual(["a", "b", "c"]);
        expect(first.moving).toEqual([]);
        const second = steadiness.split(lamps);
        expect(second.steady).toHaveLength(3);
        // The same lamps: the mask pierced for them is kept.
        expect(second.key).toBe(first.key);
    });

    it("puts a lamp whose light changes among the moving ones, without touching the mask of the others again", () => {
        const steadiness = new LampSteadiness();
        steadiness.split([lamp("a"), lamp("turning"), lamp("c")]);
        const turned = steadiness.split([lamp("a"), lamp("turning", 2), lamp("c")]);
        expect(turned.moving.map((each) => each.id)).toEqual(["turning"]);
        expect(turned.steady.map((each) => each.id)).toEqual(["a", "c"]);
        // It keeps turning: the mask of the two others stays the same, image after image.
        const again = steadiness.split([lamp("a"), lamp("turning", 3), lamp("c")]);
        expect(again.moving.map((each) => each.id)).toEqual(["turning"]);
        expect(again.key).toBe(turned.key);
    });

    it("counts a change of place, size, image or intensity as a change of light", () => {
        for (const change of [
            { x: 101 },
            { y: 99 },
            { size: 80 },
            { textureKey: "rgb-lamp:a:2" },
            { intensity: 0.5 },
        ]) {
            const steadiness = new LampSteadiness();
            steadiness.split([lamp("a")]);
            expect(steadiness.split([lamp("a", 1, change)]).moving).toHaveLength(1);
        }
    });

    it("lets a lamp that stopped changing be steady again after a while, not at once", () => {
        const steadiness = new LampSteadiness();
        steadiness.split([lamp("a")]);
        steadiness.split([lamp("a", 2)]);
        for (let drawing = 1; drawing < MOVING_DRAWINGS; drawing++) {
            expect(steadiness.split([lamp("a", 2)]).moving).toHaveLength(1);
        }
        const settled = steadiness.split([lamp("a", 2)]);
        expect(settled.steady).toHaveLength(1);
        expect(settled.moving).toEqual([]);
    });

    it("makes the mask again when a steady lamp is added, removed or changed", () => {
        const steadiness = new LampSteadiness();
        const before = steadiness.split([lamp("a"), lamp("b")]).key;
        expect(steadiness.split([lamp("a"), lamp("b"), lamp("c")]).key).not.toBe(before);
        expect(steadiness.split([lamp("a")]).key).not.toBe(before);
        // A lamp that went and comes back is new again: steady.
        expect(steadiness.split([lamp("a"), lamp("b")]).key).toBe(before);
    });

    it("forgets everything when reset", () => {
        const steadiness = new LampSteadiness();
        steadiness.split([lamp("a")]);
        steadiness.split([lamp("a", 2)]);
        steadiness.reset();
        expect(steadiness.split([lamp("a", 3)]).steady).toHaveLength(1);
    });
});
