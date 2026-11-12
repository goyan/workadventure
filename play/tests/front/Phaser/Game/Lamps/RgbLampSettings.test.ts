import { describe, expect, it } from "vitest";
import {
    coneFromTip,
    coneOpeningFromEdge,
    coneTip,
    rgbLampColour,
    rgbLampLight,
    rgbLampSettingsOf,
} from "../../../../../src/front/Phaser/Game/Lamps/RgbLampSettings";

describe("rgbLampSettingsOf", () => {
    it("is a warm white disc of 6 tiles turned downwards for a lamp nothing was set on", () => {
        expect(rgbLampSettingsOf([])).toEqual({ color: "#ffd9a0", radius: 6, direction: 90, angle: 360 });
    });

    it("reads what was set on the object", () => {
        expect(
            rgbLampSettingsOf([
                { id: "a", type: "rgbLampPropertyData", color: "#00ff00", radius: 10, direction: 180, angle: 45 },
            ]),
        ).toEqual({ color: "#00ff00", radius: 10, direction: 180, angle: 45 });
    });

    it("ignores the other properties of the object", () => {
        expect(rgbLampSettingsOf([{ id: "a", type: "lampPropertyData", width: 4, height: 4 }]).radius).toBe(6);
    });
});

describe("rgbLampColour", () => {
    it("reads #rrggbb as a number", () => {
        expect(rgbLampColour("#ffd9a0")).toBe(0xffd9a0);
        expect(rgbLampColour("#00FF80")).toBe(0x00ff80);
    });

    it("falls back to the warm white on anything else", () => {
        expect(rgbLampColour("red")).toBe(0xffd9a0);
    });
});

describe("rgbLampLight", () => {
    it("turns the reach in tiles into pixels of the map, around the source", () => {
        expect(rgbLampLight({ x: 50, y: 60 }, { color: "#ffffff", radius: 6, direction: 90, angle: 120 }, 32)).toEqual({
            x: 50,
            y: 60,
            radius: 192,
            direction: 90,
            angle: 120,
        });
    });
});

describe("handles of the cone", () => {
    const source = { x: 100, y: 100 };

    it("puts the tip at the end of the reach, in the direction of the cone", () => {
        const tip = coneTip(source, { radius: 2, direction: 90 }, 32);
        expect(tip.x).toBeCloseTo(100, 6);
        expect(tip.y).toBeCloseTo(164, 6);
    });

    it("reads the direction and the reach from where the tip is dragged", () => {
        // Three tiles to the west.
        expect(coneFromTip(source, { x: 4, y: 100 }, 32)).toEqual({ radius: 3, direction: 180 });
        // Upwards: 270 degrees, clockwise from the east.
        expect(coneFromTip(source, { x: 100, y: 36 }, 32)).toEqual({ radius: 2, direction: 270 });
    });

    it("keeps the reach within 1 to 20 tiles, by half tiles, and the direction by whole degrees", () => {
        expect(coneFromTip(source, { x: 101, y: 100 }, 32).radius).toBe(1);
        expect(coneFromTip(source, { x: 100 + 32 * 50, y: 100 }, 32).radius).toBe(20);
        expect(coneFromTip(source, { x: 100 + 80, y: 100 }, 32).radius).toBe(2.5);
        const dragged = coneFromTip(source, { x: 100 + 64, y: 100 + 1 }, 32);
        expect(dragged.direction).toBe(1);
        expect(coneFromTip(source, { x: 100 + 64, y: 100 - 0.1 }, 32).direction).toBe(0);
    });

    it("opens the cone to twice the angle between its direction and the edge that is dragged", () => {
        // Direction downwards; the pointer 45 degrees beside it, on either side.
        expect(coneOpeningFromEdge(source, { x: 150, y: 150 }, 90)).toBe(90);
        expect(coneOpeningFromEdge(source, { x: 50, y: 150 }, 90)).toBe(90);
        // Straight behind the direction: all around.
        expect(coneOpeningFromEdge(source, { x: 100, y: 0 }, 90)).toBe(360);
    });

    it("keeps the opening within 10 to 360 degrees", () => {
        expect(coneOpeningFromEdge(source, { x: 100, y: 200 }, 90)).toBe(10);
        expect(coneOpeningFromEdge(source, { x: 101, y: 0 }, 90)).toBe(359);
    });
});
