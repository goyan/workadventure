import { WeatherType } from "@workadventure/map-editor";
import type { RealWeatherSlot, WAMFileFormat } from "@workadventure/map-editor";
import type { FireConditionsMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { FireConditionsManager } from "../src/Model/FireConditionsManager";

const QUARTER = 15 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 14, 12);
const neutral = { temperature: 20, humidity: 60, windSpeed: 10, windFrom: 315 };
const thresholds = { thresholdTemperature: 30, thresholdHumidity: 30, thresholdWindSpeed: 30 };
const hot = { manual: true, temperature: 38, humidity: 12, windSpeed: 55, windFrom: 180, ...thresholds };

function createHarness({
    weather = WeatherType.Clear,
    slots = undefined as RealWeatherSlot[] | undefined,
}: { weather?: WeatherType; slots?: RealWeatherSlot[] } = {}) {
    const sent: FireConditionsMessage[] = [];
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { weather },
    };
    const clock = { now: NOW };
    const timeline = { slots };
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
            if (message.message?.$case === "fireConditionsMessage") sent.push(message.message.fireConditionsMessage);
        },
    };
    const manager = new FireConditionsManager(room, { slotsFor: vi.fn(() => timeline.slots) }, () => clock.now);
    return { manager, sent, wam, clock, timeline };
}

const slot = (at: number, more: Partial<RealWeatherSlot> = {}): RealWeatherSlot => ({
    at,
    weather: WeatherType.Clear,
    temperature: 33,
    ...more,
});

describe("FireConditionsManager", () => {
    it("has neutral conditions on a map that is not in real weather", () => {
        const { manager } = createHarness({ slots: [slot(NOW, { humidity: 10, windSpeed: 80, windFrom: 90 })] });
        expect(manager.conditions()).toEqual(neutral);
        expect(manager.thresholds()).toEqual({ temperature: 30, humidity: 30, windSpeed: 30 });
        expect(manager.snapshot()).toEqual({ manual: false, ...neutral, ...thresholds });
    });

    it("reads the quarter hour under way of a map in real weather", () => {
        const { manager } = createHarness({
            weather: WeatherType.Real,
            slots: [
                slot(NOW - QUARTER, { temperature: 5, humidity: 90, windSpeed: 1, windFrom: 1 }),
                slot(NOW, { humidity: 22, windSpeed: 41.5, windFrom: 200 }),
                slot(NOW + QUARTER, { temperature: 40, humidity: 5, windSpeed: 99, windFrom: 2 }),
            ],
        });
        expect(manager.conditions()).toEqual({ temperature: 33, humidity: 22, windSpeed: 41.5, windFrom: 200 });
    });

    it("takes the neutral value for what the real weather does not give", () => {
        const real = createHarness({ weather: WeatherType.Real, slots: [slot(NOW, { temperature: null })] });
        expect(real.manager.conditions()).toEqual(neutral);
        const unknown = createHarness({ weather: WeatherType.Real, slots: undefined });
        expect(unknown.manager.conditions()).toEqual(neutral);
        const stale = createHarness({ weather: WeatherType.Real, slots: [slot(NOW - 2 * QUARTER, { humidity: 5 })] });
        expect(stale.manager.conditions()).toEqual(neutral);
    });

    it("lets a player set the conditions by hand, for the whole room, over the real ones", () => {
        const { manager, sent } = createHarness({
            weather: WeatherType.Real,
            slots: [slot(NOW, { humidity: 80, windSpeed: 3, windFrom: 10 })],
        });
        expect(manager.set(1, hot)).toBe(true);
        expect(manager.conditions()).toEqual({ temperature: 38, humidity: 12, windSpeed: 55, windFrom: 180 });
        expect(sent).toEqual([hot]);
        expect(manager.snapshot()).toEqual(hot);
    });

    it("goes back to the real conditions, and keeps the thresholds", () => {
        const { manager, sent } = createHarness({
            weather: WeatherType.Real,
            slots: [slot(NOW, { humidity: 80, windSpeed: 3, windFrom: 10 })],
        });
        manager.set(1, hot);
        expect(
            manager.set(1, {
                ...hot,
                manual: false,
                thresholdTemperature: 25,
                thresholdHumidity: 40,
                thresholdWindSpeed: 20,
            }),
        ).toBe(true);
        expect(manager.conditions()).toEqual({ temperature: 33, humidity: 80, windSpeed: 3, windFrom: 10 });
        expect(manager.thresholds()).toEqual({ temperature: 25, humidity: 40, windSpeed: 20 });
        expect(sent.at(-1)).toMatchObject({ manual: false, temperature: 33, thresholdTemperature: 25 });
    });

    it("keeps what a player sends within what the conditions may be", () => {
        const { manager } = createHarness();
        manager.set(1, {
            manual: true,
            temperature: 9999,
            humidity: -40,
            windSpeed: Number.POSITIVE_INFINITY,
            windFrom: Number.NaN,
            thresholdTemperature: -5,
            thresholdHumidity: 1000,
            thresholdWindSpeed: Number.NaN,
        });
        expect(manager.conditions()).toEqual({ temperature: 50, humidity: 0, windSpeed: 10, windFrom: 315 });
        expect(manager.thresholds()).toEqual({ temperature: 0, humidity: 100, windSpeed: 30 });
    });

    it("refuses the sixth change of a player within a second, not the first of another", () => {
        const { manager, sent, clock } = createHarness();
        for (let change = 0; change < 5; change++) expect(manager.set(1, hot)).toBe(true);
        expect(manager.set(1, { ...hot, temperature: 45 })).toBe(false);
        expect(manager.conditions().temperature).toBe(38);
        expect(manager.set(2, { ...hot, temperature: 41 })).toBe(true);
        expect(sent).toHaveLength(6);
        clock.now += 1000;
        expect(manager.set(1, { ...hot, temperature: 45 })).toBe(true);
    });

    it("tells the room when the real conditions change, and not otherwise", () => {
        const { manager, sent, clock, timeline } = createHarness({
            weather: WeatherType.Real,
            slots: [slot(NOW, { humidity: 50 }), slot(NOW + QUARTER, { humidity: 20 })],
        });
        manager.tick();
        expect(sent).toHaveLength(1);
        manager.tick();
        expect(sent).toHaveLength(1);
        clock.now += QUARTER;
        manager.tick();
        expect(sent).toHaveLength(2);
        expect(sent[1].humidity).toBe(20);
        // The weather service stops answering: neutral again, told once.
        timeline.slots = undefined;
        manager.tick();
        manager.tick();
        expect(sent).toHaveLength(3);
        expect(sent[2]).toMatchObject(neutral);
    });

    it("does not tell the real conditions again while they are set by hand", () => {
        const { manager, sent, clock } = createHarness({
            weather: WeatherType.Real,
            slots: [slot(NOW, { humidity: 50 }), slot(NOW + QUARTER, { humidity: 20 })],
        });
        manager.set(1, hot);
        clock.now += QUARTER;
        manager.tick();
        expect(sent).toHaveLength(1);
    });
});
