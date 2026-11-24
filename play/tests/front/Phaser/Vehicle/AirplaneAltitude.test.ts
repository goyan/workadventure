import { describe, expect, it } from "vitest";
import { AirplaneFlight } from "@wa/front/Phaser/Vehicle/AirplaneFlight";
import { altitudeCommand, spaceClimbs } from "@wa/front/Phaser/Vehicle/AirplaneAltitudeKeys";
import {
    AIRPLANE_ALTITUDE,
    AIRPLANE_MAX_ALTITUDE,
    AIRPLANE_MIN_FLIGHT_ALTITUDE,
    airplaneLift,
    airplaneScale,
    readVehicleState,
    Vehicle,
    VehicleMode,
} from "@wa/front/Phaser/Vehicle/Vehicle";

function cruising(): AirplaneFlight {
    const flight = new AirplaneFlight();
    for (let frame = 0; frame < 400; frame++) flight.step({ x: 300, y: 0 }, 16);
    return flight;
}

function hold(flight: AirplaneFlight, climb: -1 | 0 | 1, frames: number, wanted = { x: 300, y: 0 }): number {
    for (let frame = 0; frame < frames; frame++) flight.step(wanted, 16, climb);
    return flight.altitude;
}

describe("the altitude the pilot chooses", () => {
    it("climbs while the climb key is held, gently at first, up to the highest altitude", () => {
        const flight = cruising();
        expect(flight.altitude).toBe(AIRPLANE_ALTITUDE);
        flight.step({ x: 300, y: 0 }, 16, 1);
        const first = flight.altitude - AIRPLANE_ALTITUDE;
        expect(first).toBeGreaterThan(0);
        flight.step({ x: 300, y: 0 }, 16, 1);
        // Speeds up: the second step goes further than the first.
        expect(flight.altitude - AIRPLANE_ALTITUDE - first).toBeGreaterThan(first);
        expect(hold(flight, 1, 1000)).toBe(AIRPLANE_MAX_ALTITUDE);
    });

    it("holds the altitude once the key is let go, flying on or hovering", () => {
        const flight = cruising();
        hold(flight, 1, 60);
        // A short coast while the climb slows down, then the altitude stays.
        hold(flight, 0, 60);
        const reached = flight.altitude;
        expect(reached).toBeGreaterThan(AIRPLANE_ALTITUDE);
        expect(hold(flight, 0, 300)).toBe(reached);
        expect(hold(flight, 0, 300, { x: 0, y: 0 })).toBe(reached);
    });

    it("comes down while the descent key is held, never under the lowest flight level", () => {
        const flight = cruising();
        expect(hold(flight, -1, 1000)).toBe(AIRPLANE_MIN_FLIGHT_ALTITUDE);
        // Flying on: the plane keeps the low altitude chosen, it does not climb back to the cruise.
        expect(hold(flight, 0, 300)).toBe(AIRPLANE_MIN_FLIGHT_ALTITUDE);
    });

    it("takes off from the ground with the climb key, without moving", () => {
        const flight = new AirplaneFlight();
        expect(flight.step({ x: 0, y: 0 }, 16).altitude).toBe(0);
        expect(hold(flight, 1, 30, { x: 0, y: 0 })).toBeGreaterThan(0);
    });

    it("leaves a landing glide alone", () => {
        const flight = cruising();
        flight.landing = true;
        const before = flight.altitude;
        flight.step({ x: 0, y: 0 }, 16, 1);
        expect(flight.altitude).toBeLessThan(before);
    });

    it("starts each flight again at the cruise altitude", () => {
        const flight = cruising();
        hold(flight, -1, 1000);
        flight.reset();
        expect(hold(flight, 0, 600)).toBe(AIRPLANE_ALTITUDE);
    });
});

describe("the size of a plane seen from above", () => {
    it("grows from its size on the ground to twice it at the highest altitude, by sixteenths", () => {
        expect(airplaneScale(0)).toBe(1);
        expect(airplaneScale(AIRPLANE_ALTITUDE)).toBe(1.5);
        expect(airplaneScale(AIRPLANE_MAX_ALTITUDE)).toBe(2);
        expect(airplaneScale(100) * 16).toBe(Math.round(airplaneScale(100) * 16));
        expect(airplaneScale(-50)).toBe(1);
        expect(airplaneScale(1e9)).toBe(2);
        expect(airplaneScale(Number.NaN)).toBe(1);
    });

    it("is drawn higher above its shadow as it climbs, in whole pixels", () => {
        expect(airplaneLift(0)).toBe(0);
        expect(airplaneLift(AIRPLANE_ALTITUDE)).toBe(40);
        expect(airplaneLift(AIRPLANE_MAX_ALTITUDE)).toBe(80);
        expect(airplaneLift(1e9)).toBe(80);
        expect(Number.isInteger(airplaneLift(333))).toBe(true);
    });
});

describe("the altitude another player shares", () => {
    it("is kept within the sky, whatever a modified client sends", () => {
        const read = (altitude: unknown): number | undefined =>
            readVehicleState({ vehicle: Vehicle.Airplane, mode: VehicleMode.Always, altitude }).altitude;
        expect(read(1500)).toBe(1500);
        expect(read(1e12)).toBe(AIRPLANE_MAX_ALTITUDE);
        expect(read(-20)).toBe(0);
        expect(read(Number.NaN)).toBe(AIRPLANE_ALTITUDE);
        expect(read(Number.POSITIVE_INFINITY)).toBe(AIRPLANE_ALTITUDE);
        expect(read("9999")).toBe(AIRPLANE_ALTITUDE);
    });
});

describe("the keys of the altitude", () => {
    const base = { inAirplane: true, flying: false, spaceAskedFor: false, toolInHand: false };

    it("climbs with space in flight, whatever is around", () => {
        expect(spaceClimbs({ ...base, flying: true, spaceAskedFor: true, toolInHand: true })).toBe(true);
    });

    it("takes off with space on the ground only when space has nothing else to do", () => {
        expect(spaceClimbs(base)).toBe(true);
        expect(spaceClimbs({ ...base, spaceAskedFor: true })).toBe(false);
        expect(spaceClimbs({ ...base, toolInHand: true })).toBe(false);
    });

    it("leaves space alone out of the airplane", () => {
        expect(spaceClimbs({ ...base, inAirplane: false })).toBe(false);
        expect(spaceClimbs({ ...base, inAirplane: false, flying: true })).toBe(false);
    });

    it("climbs, comes down or holds", () => {
        expect(altitudeCommand(true, false)).toBe(1);
        expect(altitudeCommand(false, true)).toBe(-1);
        expect(altitudeCommand(true, true)).toBe(0);
        expect(altitudeCommand(false, false)).toBe(0);
    });
});
