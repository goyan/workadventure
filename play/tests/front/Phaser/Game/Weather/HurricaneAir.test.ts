import { hurricaneAirMessageOf } from "@workadventure/map-editor";
import type { HurricaneAirMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import {
    HURRICANE_AIR_MESSAGE_MS,
    HURRICANE_AIR_STALE_MS,
    HurricaneAirField,
    windOfAir,
} from "../../../../../src/front/Phaser/Game/Weather/HurricaneAir";

const SIZE = { width: 1024, height: 512 };

/** A field told by the server: the same wind everywhere (m/s, east and north). */
function told(hurricaneId: number, east: number, north: number, seq = 0): HurricaneAirMessage {
    return hurricaneAirMessageOf({ surfaceWindAt: () => ({ east, north }) }, SIZE, hurricaneId, seq, 0);
}

function field() {
    const clock = { now: 1000 };
    return { air: new HurricaneAirField(() => clock.now), clock };
}

describe("the wind of the air of a hurricane as a browser is told it (HurricaneAirField)", () => {
    it("knows no wind before it is told one, nor for another hurricane", () => {
        const { air } = field();
        expect(air.windAt(5, 100, 100)).toBeUndefined();
        air.receive(told(5, 20, 0));
        expect(air.windAt(6, 100, 100)).toBeUndefined();
        expect(air.windAt(undefined, 100, 100)).toBeUndefined();
        expect(air.windAt(5, 100, 100)?.east).toBeCloseTo(20, 1);
    });

    it("goes from the field told before to the last over the time between two, without a jump", () => {
        const { air, clock } = field();
        air.receive(told(5, 20, 0));
        clock.now += HURRICANE_AIR_MESSAGE_MS;
        air.receive(told(5, 0, 40, 1));
        // Just told: still the field before; half way between two: half of each; then the last.
        expect(air.windAt(5, 100, 100)?.east).toBeCloseTo(20, 1);
        expect(air.windAt(5, 100, 100)?.north).toBeCloseTo(0, 1);
        clock.now += HURRICANE_AIR_MESSAGE_MS / 2;
        expect(air.windAt(5, 100, 100)?.east).toBeCloseTo(10, 1);
        expect(air.windAt(5, 100, 100)?.north).toBeCloseTo(20, 1);
        clock.now += HURRICANE_AIR_MESSAGE_MS;
        expect(air.windAt(5, 100, 100)?.north).toBeCloseTo(40, 1);
    });

    it("does not mix the field of another hurricane, and forgets a field told long ago", () => {
        const { air, clock } = field();
        air.receive(told(5, 20, 0));
        clock.now += HURRICANE_AIR_MESSAGE_MS;
        air.receive(told(6, 0, 40));
        expect(air.windAt(6, 100, 100)?.north).toBeCloseTo(40, 1);
        expect(air.windAt(6, 100, 100)?.east).toBeCloseTo(0, 1);
        // The server stopped telling it (its air failed): the formula of the hurricane takes over.
        clock.now += HURRICANE_AIR_STALE_MS;
        expect(air.windAt(6, 100, 100)).toBeUndefined();
    });

    it("lays the field before and the last side by side for the sea, in bytes of a step that holds both", () => {
        const { air, clock } = field();
        air.receive(told(5, 20, 0));
        clock.now += HURRICANE_AIR_MESSAGE_MS;
        air.receive(told(5, 0, -40, 1));
        clock.now += HURRICANE_AIR_MESSAGE_MS / 4;
        const sea = air.seaAir(5);
        if (!sea) throw new Error("no field");
        expect(sea.share).toBeCloseTo(0.25, 6);
        // The step of the stronger field: 40 m/s at 127.
        expect(sea.step).toBeCloseTo(40 / 127, 6);
        const texel = (column: number, row: number): number[] => {
            const at = (row * sea.columns * 2 + column) * 4;
            return Array.from(sea.pixels.slice(at, at + 4));
        };
        // Left, the field before: 20 m/s east (64 steps of 40/127); right, the last: 40 m/s south.
        expect(texel(0, 0)).toEqual([128 + 64, 128, 128, 255]);
        expect(texel(sea.columns, 0)).toEqual([128, 128 - 127, 128, 255]);
        expect(texel(sea.columns - 1, sea.rows - 1)).toEqual([128 + 64, 128, 128, 255]);
        // The same picture while no other field is told.
        expect(air.seaAir(5)?.pixels).toBe(sea.pixels);
        expect(air.seaAir(6)).toBeUndefined();
    });

    it("says a wind as the weather does: km/h, and where it comes from", () => {
        // 10 m/s towards the east comes from the west.
        expect(windOfAir({ east: 10, north: 0 }).windSpeed).toBeCloseTo(36, 6);
        expect(windOfAir({ east: 10, north: 0 }).windFrom).toBeCloseTo(270, 6);
        expect(windOfAir({ east: 0, north: -5 }).windFrom).toBeCloseTo(0, 6);
    });
});
