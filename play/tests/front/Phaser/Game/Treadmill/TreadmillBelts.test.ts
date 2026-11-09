import { describe, expect, it, vi } from "vitest";
import { TreadmillBelts } from "../../../../../src/front/Phaser/Game/Treadmill/TreadmillBelts";

function setup() {
    const belts = new Map([
        ["a", { setBeltMoving: vi.fn() }],
        ["b", { setBeltMoving: vi.fn() }],
    ]);
    return { belts, registry: new TreadmillBelts((id) => belts.get(id)) };
}

describe("TreadmillBelts", () => {
    it("moves a belt while someone runs on it, and stops it when the last runner leaves", () => {
        const { belts, registry } = setup();
        const alice = {};
        const bob = {};
        registry.setRunner(alice, "a");
        expect(belts.get("a")?.setBeltMoving).toHaveBeenLastCalledWith(true);
        expect(registry.isMoving("a")).toBe(true);
        registry.setRunner(bob, "a");
        registry.setRunner(alice, undefined);
        expect(belts.get("a")?.setBeltMoving).toHaveBeenLastCalledWith(true);
        registry.setRunner(bob, undefined);
        expect(belts.get("a")?.setBeltMoving).toHaveBeenLastCalledWith(false);
        expect(registry.isMoving("a")).toBe(false);
    });

    it("stops the previous belt when a runner moves to another treadmill", () => {
        const { belts, registry } = setup();
        const alice = {};
        registry.setRunner(alice, "a");
        registry.setRunner(alice, "b");
        expect(belts.get("a")?.setBeltMoving).toHaveBeenLastCalledWith(false);
        expect(belts.get("b")?.setBeltMoving).toHaveBeenLastCalledWith(true);
    });

    it("does nothing when the runner stays on the same belt, and ignores unknown objects", () => {
        const { belts, registry } = setup();
        const alice = {};
        registry.setRunner(alice, "a");
        registry.setRunner(alice, "a");
        expect(belts.get("a")?.setBeltMoving).toHaveBeenCalledTimes(1);
        expect(() => registry.setRunner(alice, "gone")).not.toThrow();
        expect(registry.isMoving("gone")).toBe(true);
    });
});
