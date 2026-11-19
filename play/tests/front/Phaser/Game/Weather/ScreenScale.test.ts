import { describe, expect, it } from "vitest";
import { distinguishable, screenScale, seenFromFar } from "../../../../../src/front/Phaser/Game/Weather/ScreenScale";

const sceneAt = (zoom: number, displayScale?: number) => ({
    cameras: { main: { zoom } },
    scale: displayScale === undefined ? undefined : { displayScale: { x: displayScale } },
});

describe("screenScale", () => {
    it("is the camera zoom over the display scale of the canvas (a Retina screen)", () => {
        expect(screenScale(sceneAt(0.5))).toBe(0.5);
        expect(screenScale(sceneAt(0.5, 2))).toBe(0.25);
        expect(screenScale(sceneAt(1, 1))).toBe(1);
    });

    it("is 1 when the zoom is unknown: everything is drawn", () => {
        expect(screenScale({})).toBe(1);
        expect(screenScale(sceneAt(Number.NaN))).toBe(1);
        expect(screenScale(sceneAt(0))).toBe(1);
    });
});

describe("distinguishable", () => {
    it("tells a shape that takes two screen pixels, and a movement that takes one", () => {
        // A fish of 8 map pixels: two screen pixels at a quarter, less under it.
        expect(distinguishable(sceneAt(0.25), 8)).toBe(true);
        expect(distinguishable(sceneAt(0.24), 8)).toBe(false);
        // The sway of a tree, 4 map pixels: one screen pixel at a quarter.
        expect(distinguishable(sceneAt(0.25), 4, 1)).toBe(true);
        expect(distinguishable(sceneAt(0.2), 4, 1)).toBe(false);
    });

    it("leaves the leaves and the puddles out under half a screen pixel a map pixel", () => {
        expect(seenFromFar(sceneAt(0.5))).toBe(false);
        expect(seenFromFar(sceneAt(0.49))).toBe(true);
        expect(seenFromFar(sceneAt(0.8, 2))).toBe(true);
        expect(seenFromFar({})).toBe(false);
    });
});
