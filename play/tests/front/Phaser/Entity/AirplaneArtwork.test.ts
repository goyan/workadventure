import { describe, expect, it } from "vitest";
import {
    airplaneCockpit,
    airplaneFrame,
    airplaneFrontFrame,
    airplaneShadowFrame,
    paintAirplane,
} from "@wa/front/Phaser/Vehicle/AirplaneArtwork";

describe("airplane sprite directions and animation", () => {
    it("keeps all eight headings, the propeller at rest when parked", () => {
        expect([0, 1, 2, 3, 4, 5, 6, 7].map((heading) => airplaneFrame(heading, 0, false))).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7,
        ]);
        expect([0, 45, 90, 500].map((time) => airplaneFrame(5, time, false))).toEqual([5, 5, 5, 5]);
    });
    it("spins through the four phases of the drawn propeller: no frame of resting blades in flight", () => {
        expect([0, 40, 80, 120, 160].map((time) => airplaneFrame(5, time, true))).toEqual([13, 21, 29, 37, 13]);
    });
    it("draws the cockpit front and the shadow of the same heading", () => {
        expect(airplaneFrontFrame(6)).toBe(46);
        expect(airplaneShadowFrame(6)).toBe(54);
        expect(airplaneShadowFrame(-1)).toBe(55);
    });
    it("places the pilot inside the cockpit on each heading", () => {
        for (let heading = 0; heading < 8; heading++) {
            const cockpit = airplaneCockpit(heading);
            expect(cockpit.x).toBeGreaterThan(28);
            expect(cockpit.x).toBeLessThan(52);
            expect(cockpit.y).toBeGreaterThan(22);
            expect(cockpit.y).toBeLessThan(53);
        }
    });
    it("paints the fuselage, wings and canopy in their colours, keeping the shading", () => {
        // A light and a dark red, a yellow, a teal glass, a black outline.
        const pixels = new Uint8ClampedArray([
            200, 40, 40, 255, 100, 20, 20, 255, 247, 200, 8, 255, 50, 70, 75, 255, 0, 0, 0, 255,
        ]);
        paintAirplane(pixels, { color: "#0000ff", edgeColor: "#00ff00", wheelsColor: "#ff00ff" });
        expect([...pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
        expect(pixels[6]).toBeGreaterThan(100);
        expect(pixels[6]).toBeLessThan(140);
        expect([...pixels.slice(8, 12)]).toEqual([0, 255, 0, 255]);
        expect([...pixels.slice(12, 16)]).toEqual([255, 0, 255, 255]);
        expect([...pixels.slice(16, 20)]).toEqual([0, 0, 0, 255]);
    });
});
