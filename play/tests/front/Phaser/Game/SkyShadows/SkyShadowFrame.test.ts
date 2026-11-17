import { describe, expect, it } from "vitest";
import {
    indoorRuns,
    SHADOW_MAX_ALPHA,
    shadowAlpha,
    shadowRedraw,
    shadowResolution,
} from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowFrame";
import type { ShadowFrame } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowFrame";

const view = { x: 0, y: 0, width: 800, height: 600 };
const frame: ShadowFrame = {
    light: { body: "sun", azimuth: 180, elevation: 30, intensity: 1, color: 0xffffff },
    casters: "walls",
    outdoorVersion: 1,
    view,
    zoom: 1,
};
const drawn = { ...frame, area: { x: -200, y: -150, width: 1200, height: 900 } };

describe("shadowRedraw", () => {
    it("draws the first time, and not again while nothing moves", () => {
        expect(shadowRedraw(undefined, frame)).toBe("draw");
        expect(shadowRedraw(drawn, frame)).toBe("none");
    });

    it("draws again when the light has moved by half a degree or more, not for less", () => {
        expect(shadowRedraw(drawn, { ...frame, light: { ...frame.light, azimuth: 180.4 } })).toBe("none");
        expect(shadowRedraw(drawn, { ...frame, light: { ...frame.light, azimuth: 180.5 } })).toBe("draw");
        expect(shadowRedraw(drawn, { ...frame, light: { ...frame.light, elevation: 29.4 } })).toBe("draw");
        expect(shadowRedraw(drawn, { ...frame, light: { ...frame.light, body: "moon" } })).toBe("draw");
    });

    it("draws again when the walls, the objects, the outdoors or the zoom change", () => {
        expect(shadowRedraw(drawn, { ...frame, casters: "walls and a tree" })).toBe("draw");
        expect(shadowRedraw(drawn, { ...frame, outdoorVersion: 2 })).toBe("draw");
        expect(shadowRedraw(drawn, { ...frame, zoom: 0.5 })).toBe("draw");
    });

    it("draws again before a scroll reaches the edge of what was drawn", () => {
        expect(shadowRedraw(drawn, { ...frame, view: { ...view, x: 50 } })).toBe("none");
        expect(shadowRedraw(drawn, { ...frame, view: { ...view, x: 150 } })).toBe("draw");
    });

    it("only changes the opacity when the light only grows or fades", () => {
        expect(shadowRedraw(drawn, { ...frame, light: { ...frame.light, intensity: 0.8 } })).toBe("alpha");
        expect(shadowRedraw(drawn, { ...frame, light: { ...frame.light, intensity: 0.995 } })).toBe("none");
    });
});

describe("shadowAlpha", () => {
    it("grows with the light, up to a shadow that keeps the ground readable", () => {
        expect(shadowAlpha({ ...frame.light, intensity: 1 })).toBe(SHADOW_MAX_ALPHA);
        expect(shadowAlpha({ ...frame.light, intensity: 0.5 })).toBeCloseTo(SHADOW_MAX_ALPHA / 2, 9);
        expect(SHADOW_MAX_ALPHA).toBeLessThanOrEqual(0.5);
    });
});

describe("indoorRuns", () => {
    it("gives the rows of cells that are not outdoors, merged left to right, in map pixels", () => {
        // A room of 2 × 2 cells of 8 px at columns 1-2, rows 1-2.
        const outdoor = (column: number, row: number): boolean => !(column >= 1 && column <= 2 && row >= 1 && row <= 2);
        expect(indoorRuns(outdoor, 8, { x: 0, y: 0, width: 32, height: 32 })).toEqual([
            { x: 8, y: 8, width: 16, height: 8 },
            { x: 8, y: 16, width: 16, height: 8 },
        ]);
    });
});

describe("shadowResolution", () => {
    it("draws one texel a map pixel zoomed in, and halves it at each halving of the zoom out", () => {
        expect(shadowResolution(3)).toBe(1);
        expect(shadowResolution(1)).toBe(1);
        expect(shadowResolution(0.99)).toBe(0.5);
        expect(shadowResolution(0.5)).toBe(0.5);
        expect(shadowResolution(0.3)).toBe(0.25);
        expect(shadowResolution(0)).toBe(1);
    });
});
