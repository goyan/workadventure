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

    it("says a wind as the weather does: km/h, and where it comes from", () => {
        // 10 m/s towards the east comes from the west.
        expect(windOfAir({ east: 10, north: 0 }).windSpeed).toBeCloseTo(36, 6);
        expect(windOfAir({ east: 10, north: 0 }).windFrom).toBeCloseTo(270, 6);
        expect(windOfAir({ east: 0, north: -5 }).windFrom).toBeCloseTo(0, 6);
    });
});
