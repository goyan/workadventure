import type { HurricaneAirMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import { HURRICANE_RMAX_M, hurricaneAt } from "../src/Catastrophe/Hurricane";
import { AIR_CELL_PX, AIR_ROUGHNESS_M } from "../src/Weather/AirSimulation";
import {
    hurricaneAirMessageOf,
    hurricaneAirWindAt,
    MAP_AIR_STEPS_PER_MESSAGE,
    MapAir,
    mapSurfaceOf,
    slabWindOf,
} from "../src/Weather/MapAir";

const MAP = { width: 7680, height: 5120 };
const PX_PER_M = 32 / Math.sqrt(1.2);
const RMAX_PX = HURRICANE_RMAX_M * PX_PER_M;
const NOW = 1_800_000_000_000;

/** A hurricane of category 4 crossing the map from the west to the east, a third of the way at NOW. */
function crossing(durationMs: number, times?: number): Hurricane {
    return {
        id: 5,
        startedAt: NOW - 0.3 * durationMs,
        category: 4,
        durationMs,
        heading: 90,
        southern: false,
        times,
        fromX: -1000,
        fromY: 2560,
        toX: 8680,
        toY: 2560,
        anchorX: 3840,
        anchorY: 2560,
    };
}

/** An air over the sea of the map, its room told in `sent`, its clock moved by hand. */
function mapAir(hurricane: () => Hurricane | undefined, surface = () => (): number | "sea" => "sea") {
    const sent: SubToPusherRoomMessage[] = [];
    const clock = { now: NOW };
    const air = new MapAir({
        room: { sendSubMessageToRoom: (message) => sent.push(message) },
        hurricane,
        now: () => clock.now,
        roomWind: () => ({ windSpeed: 0, windFrom: 0 }),
        mapSize: () => MAP,
        surface,
    });
    const step = (count: number): void => {
        for (let at = 0; at < count; at++) {
            clock.now += 100;
            air.step();
        }
    };
    return { air, sent, clock, step };
}

const airs = (sent: SubToPusherRoomMessage[]): HurricaneAirMessage[] =>
    sent.flatMap((message) =>
        message.message?.$case === "hurricaneAirMessage" ? [message.message.hurricaneAirMessage] : [],
    );

/** Where the air puts the eye: the calmest point within three radii of the eye of the formula (pixels). */
function eyeOf(air: MapAir, near: { eyeX: number; eyeY: number }): { x: number; y: number } {
    let calmest = { x: near.eyeX, y: near.eyeY, speed: Infinity };
    for (let dy = -3 * RMAX_PX; dy <= 3 * RMAX_PX; dy += 32) {
        for (let dx = -3 * RMAX_PX; dx <= 3 * RMAX_PX; dx += 32) {
            const wind = air.windAt(near.eyeX + dx, near.eyeY + dy);
            if (!wind) continue;
            const speed = Math.hypot(wind.east, wind.north);
            if (speed < calmest.speed) calmest = { x: near.eyeX + dx, y: near.eyeY + dy, speed };
        }
    }
    return calmest;
}

describe("the air of a map while a hurricane crosses it (MapAir)", () => {
    it("takes the wind of the room into the slab, blowing away from where it comes from", () => {
        // 36 km/h at 10 m is 10 m/s; 12.5 m/s in the slab (over 0.80).
        const west = slabWindOf({ windSpeed: 36, windFrom: 270 });
        expect(west.east).toBeCloseTo(12.5, 6);
        expect(west.north).toBeCloseTo(0, 6);
        const north = slabWindOf({ windSpeed: 36, windFrom: 0 });
        expect(north.north).toBeCloseTo(-12.5, 6);
        expect(north.east).toBeCloseTo(0, 6);
    });

    it("sends the wind at the points of a grid over the map, a byte a component, read back within half a step", () => {
        const wind = (x: number, y: number) => ({ east: x / 200 - 20, north: 8 - y / 300 });
        const size = { width: 1000, height: 600 };
        const message = hurricaneAirMessageOf({ surfaceWindAt: wind }, size, 5, 0, NOW);
        expect(message.cellPx).toBe(AIR_CELL_PX);
        expect(message.columns).toBe(Math.floor(1000 / AIR_CELL_PX) + 1);
        expect(message.rows).toBe(Math.floor(600 / AIR_CELL_PX) + 1);
        expect(message.east.length).toBe(message.columns * message.rows);
        // The strongest component, 20 m/s, at 127.
        expect(message.step).toBeCloseTo(20 / 127, 6);
        for (const [x, y] of [
            [0, 0],
            [AIR_CELL_PX * 3, AIR_CELL_PX * 2],
            [AIR_CELL_PX * 2.5, AIR_CELL_PX * 1.25],
        ]) {
            const read = hurricaneAirWindAt(message, x, y);
            // Linear: bilinear between the points gives it back, but for the rounding of each byte.
            expect(Math.abs(read.east - wind(x, y).east)).toBeLessThanOrEqual(message.step / 2 + 1e-6);
            expect(Math.abs(read.north - wind(x, y).north)).toBeLessThanOrEqual(message.step / 2 + 1e-6);
        }
    });

    it("tells the room the wind twice a second while a hurricane crosses, and nothing once it ended", () => {
        let hurricane: Hurricane | undefined;
        const { air, sent, step } = mapAir(() => hurricane);
        step(10);
        expect(sent).toHaveLength(0);
        expect(air.snapshot()).toBeUndefined();

        hurricane = crossing(300_000);
        step(10 * MAP_AIR_STEPS_PER_MESSAGE);
        const told = airs(sent);
        expect(told).toHaveLength(10);
        expect(told.map((message) => message.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(told.every((message) => message.hurricaneId === 5)).toBe(true);
        expect(air.snapshot()).toEqual(told[told.length - 1]);
        // A hurricane of category 4: its strongest wind at 10 m in the message, near 214 km/h.
        expect(told[told.length - 1].step * 127 * 3.6).toBeGreaterThan(150);

        hurricane = undefined;
        step(10);
        expect(airs(sent)).toHaveLength(10);
        expect(air.snapshot()).toBeUndefined();
        expect(air.windAt(3840, 2560)).toBeUndefined();
    }, 30_000);

    it("grows and fades with the storm, as its formula and its low over the water do", () => {
        /** The strongest wind at 10 m round the eye (m/s) a second after the air starts at `progress` of its crossing. */
        const strongestAt = (progress: number): number => {
            const hurricane = { ...crossing(300_000), startedAt: NOW - progress * 300_000 };
            const { air, clock, step } = mapAir(() => hurricane);
            step(10);
            const eye = hurricaneAt(hurricane, clock.now);
            if (!eye) throw new Error("the hurricane left the map");
            let strongest = 0;
            for (let dy = -2 * RMAX_PX; dy <= 2 * RMAX_PX; dy += 64) {
                for (let dx = -2 * RMAX_PX; dx <= 2 * RMAX_PX; dx += 64) {
                    const wind = air.windAt(eye.eyeX + dx, eye.eyeY + dy);
                    if (wind) strongest = Math.max(strongest, Math.hypot(wind.east, wind.north));
                }
            }
            return strongest;
        };
        // At 1 % of its crossing the storm is grown by a quarter (its share, 0.26: it grows over the first 3 %); at
        // 30 %, whole. Its wind goes as the square root of its low: about half (measured 0.45), where it would be
        // whole if the low of the air did not grow with the storm.
        const ratio = strongestAt(0.01) / strongestAt(0.3);
        expect(ratio).toBeGreaterThan(0.3);
        expect(ratio).toBeLessThan(0.6);
    }, 30_000);

    it("leaves the wind to the formula when its air fails, for that hurricane only", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        let hurricane: Hurricane | undefined = crossing(300_000);
        let fail = true;
        const { air, sent, step } = mapAir(
            () => hurricane,
            () => {
                if (fail) throw new Error("no surface");
                return () => "sea";
            },
        );
        expect(() => step(20)).not.toThrow();
        expect(sent).toHaveLength(0);
        expect(air.snapshot()).toBeUndefined();
        expect(air.windAt(3840, 2560)).toBeUndefined();
        expect(error).toHaveBeenCalledTimes(1);

        // Another hurricane: its air is tried again.
        fail = false;
        hurricane = { ...crossing(300_000), id: 6 };
        step(1);
        expect(airs(sent)).toHaveLength(1);
        error.mockRestore();
    }, 30_000);

    it("keeps its eye with that of the formula when the widget speeds the hurricane ten times", () => {
        const lagOf = (hurricane: Hurricane): number => {
            const { air, clock, step } = mapAir(() => hurricane);
            step(50);
            const formula = hurricaneAt(hurricane, clock.now);
            if (!formula) throw new Error("the hurricane left the map");
            const eye = eyeOf(air, formula);
            return Math.hypot(eye.x - formula.eyeX, eye.y - formula.eyeY) / RMAX_PX;
        };
        const lags = {
            real: lagOf(crossing(300_000)),
            spedUp: lagOf(crossing(30_000, 10)),
            // The same sped up crossing, its air living one step in each step of the room.
            notSpedUp: lagOf(crossing(30_000)),
        };
        // Measured after 5 s: 0.09 radius at the real pace; sped up ten times, 0.14 with the five steps of its air
        // it lives in each step of the room (MAP_AIR_MOST_TIMES; 0.12 with ten), 0.29 with one only (its air cannot
        // turn as fast as its eye goes).
        expect(lags.real).toBeLessThan(0.2);
        expect(lags.spedUp).toBeLessThan(0.2);
        expect(lags.notSpedUp).toBeGreaterThan(1.5 * lags.spedUp);
    }, 60_000);

    it("reads the sea, the land and the forests of a map from its water and its trees", () => {
        const size = { width: 1024, height: 512 };
        // Water deep enough for a fish over the west half; trees on every other tile of the east quarter.
        const depthAt = (cellX: number): number => (cellX * 16 < 512 ? 20 : 0);
        const trees: { x: number; y: number }[] = [];
        for (let x = 768; x < 1024; x += 64) for (let y = 0; y < 512; y += 32) trees.push({ x: x + 16, y: y + 16 });
        const surface = mapSurfaceOf(size, depthAt, trees, 8, 16, 32);
        expect(surface(256, 256)).toBe("sea");
        expect(surface(640, 256)).toBe(AIR_ROUGHNESS_M.land);
        expect(surface(896, 256)).toBe(AIR_ROUGHNESS_M.forest);
        // Past the edges, the surface of the nearest edge.
        expect(surface(-640, 256)).toBe("sea");
        expect(surface(4000, 256)).toBe(AIR_ROUGHNESS_M.forest);
    });
});
