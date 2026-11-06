import { describe, expect, it } from "vitest";
import { MathUtils } from "@workadventure/math-utils";
import type { AreaData } from "@workadventure/map-editor";
import { lightableAreas, NIGHT_FADE_MS, NightLights } from "../../../../../src/front/Phaser/Game/Night/NightLights";

function area(id: string, x: number, y: number, width: number, height: number): AreaData {
    return { id, x, y, width, height, name: id, visible: true, properties: [] };
}

describe("lightableAreas", () => {
    it("keeps areas covering at most a quarter of the map", () => {
        const kept = area("kept", 0, 0, 500, 500);
        const dropped = area("dropped", 0, 0, 501, 500);
        expect(lightableAreas([kept, dropped], 1000, 1000)).toEqual([kept]);
    });
});

describe("NightLights", () => {
    const a = area("a", 100, 100, 50, 50);
    const inside = { x: 120, y: 120 };
    const outside = { x: 500, y: 500 };

    it("returns nothing without areas", () => {
        expect(new NightLights().update(0, [], [inside])).toEqual([]);
    });

    it("fades in while occupied", () => {
        const lights = new NightLights();
        expect(NIGHT_FADE_MS).toBe(1000);
        expect(lights.update(0, [a], [inside])).toEqual([]);
        expect(lights.isFading()).toBe(true);
        expect(lights.update(500, [a], [inside])).toEqual([
            { id: "a", x: 100, y: 100, width: 50, height: 50, intensity: 0.5 },
        ]);
        expect(lights.isFading()).toBe(true);
        expect(lights.update(1000, [a], [inside])[0].intensity).toBe(1);
        expect(lights.isFading()).toBe(false);
    });

    it("fades in again after a reset, whatever the time elapsed", () => {
        const lights = new NightLights();
        lights.update(0, [a], [inside]);
        lights.update(1000, [a], [inside]);
        lights.reset();
        expect(lights.update(60_000, [a], [inside])).toEqual([]);
        expect(lights.isFading()).toBe(true);
        expect(lights.update(60_500, [a], [inside])[0].intensity).toBe(0.5);
    });

    it("fades out once the player leaves", () => {
        const lights = new NightLights();
        lights.update(0, [a], [inside]);
        lights.update(1000, [a], [inside]);
        lights.update(2000, [a], [inside]);
        expect(lights.update(2500, [a], [outside])[0].intensity).toBe(0.5);
        expect(lights.isFading()).toBe(true);
        expect(lights.update(3000, [a], [outside])).toEqual([]);
        expect(lights.isFading()).toBe(false);
    });

    it("drops areas that are no longer present", () => {
        const lights = new NightLights();
        lights.update(0, [a], [inside]);
        lights.update(1000, [a], [inside]);
        expect(lights.update(1100, [], [inside])).toEqual([]);
        expect(lights.update(1200, [a], [inside])).toEqual([]);
    });

    it("uses the same border rule as MathUtils.isOverlappingWithRectangle", () => {
        const onRightBorder = { x: 150, y: 120 };
        const expected = MathUtils.isOverlappingWithRectangle(onRightBorder, a);
        const lights = new NightLights();
        lights.update(0, [a], [onRightBorder]);
        const lit = lights.update(500, [a], [onRightBorder]);
        expect(lit.length === 1).toBe(expected);
    });

    it("lights several areas for several players", () => {
        const b = area("b", 300, 300, 50, 50);
        const lights = new NightLights();
        lights.update(0, [a, b], [inside, { x: 310, y: 310 }]);
        const lit = lights.update(500, [a, b], [inside, { x: 310, y: 310 }]);
        expect(lit.map((l) => l.id).sort()).toEqual(["a", "b"]);
    });
});
