import { describe, expect, it } from "vitest";
import { AirplaneFlight } from "@wa/front/Phaser/Vehicle/AirplaneFlight";
import { AIRPLANE_ALTITUDE } from "@wa/front/Phaser/Vehicle/Vehicle";

describe("airplane movement engine", () => {
    it("boards on the ground, accelerates and climbs as movement starts", () => {
        const flight = new AirplaneFlight();
        expect(flight.step({ x: 0, y: 0 }, 16).altitude).toBe(0);
        const first = flight.step({ x: 300, y: 0 }, 16);
        expect(first.x).toBeGreaterThan(0);
        expect(first.x).toBeLessThan(300);
        expect(first.altitude).toBeGreaterThan(0);
        expect(first.altitude).toBeLessThan(AIRPLANE_ALTITUDE);
        let last = first;
        for (let frame = 0; frame < 300; frame++) last = flight.step({ x: 300, y: 0 }, 16);
        expect(last.x).toBe(300);
        expect(last.altitude).toBe(AIRPLANE_ALTITUDE);
        const coast = flight.step({ x: 0, y: 0 }, 16);
        expect(coast.x).toBeGreaterThan(0);
        expect(coast.x).toBeLessThan(300);
        expect(coast.altitude).toBe(AIRPLANE_ALTITUDE);
    });
    it("brakes and descends gradually, and can abort a blocked landing", () => {
        const flight = new AirplaneFlight();
        for (let frame = 0; frame < 300; frame++) flight.step({ x: 300, y: 0 }, 16);
        flight.landing = true;
        const first = flight.step({ x: 300, y: 0 }, 16);
        expect(first.altitude).toBeGreaterThan(0);
        expect(first.altitude).toBeLessThan(AIRPLANE_ALTITUDE);
        expect(first.landed).toBe(false);
        for (let frame = 0; frame < 300; frame++) flight.step({ x: 300, y: 0 }, 16);
        expect(flight.step({ x: 300, y: 0 }, 16).landed).toBe(true);
        flight.cancelLanding();
        expect(flight.altitude).toBeGreaterThan(0);
        expect(flight.step({ x: 0, y: 0 }, 16).landed).toBe(false);
    });
    it("clamps delayed frames so a suspended window cannot teleport the aircraft", () => {
        const flight = new AirplaneFlight();
        expect(flight.step({ x: 300, y: 0 }, 60000).x).toBeLessThan(300);
        expect(flight.altitude).toBeLessThan(AIRPLANE_ALTITUDE);
    });
    it("follows the glide of the approach down, faster than it climbs", () => {
        const flight = new AirplaneFlight();
        for (let frame = 0; frame < 300; frame++) flight.step({ x: 300, y: 0 }, 16);
        flight.glideAltitude = AIRPLANE_ALTITUDE / 2;
        for (let frame = 0; frame < 40; frame++) flight.step({ x: 100, y: 0 }, 16);
        expect(flight.altitude).toBe(AIRPLANE_ALTITUDE / 2);
        flight.cancelLanding();
        expect(flight.glideAltitude).toBeUndefined();
    });
});
