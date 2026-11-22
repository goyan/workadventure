import { afterEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { fireConditionsStore } from "../../../../../src/front/Stores/FireConditionsStore";
import { fastWaterStore } from "../../../../../src/front/Stores/FastWaterStore";
import { fastWaterRightsOf, roomWaterTimes } from "../../../../../src/front/Phaser/Game/Terrain/FastWater";

const conditions = {
    manual: false,
    temperature: 20,
    humidity: 50,
    windSpeed: 0,
    windFrom: 0,
    thresholdTemperature: 30,
    thresholdHumidity: 30,
    thresholdWindSpeed: 30,
};

describe("the fast water as this browser knows it", () => {
    afterEach(() => fireConditionsStore.set(undefined));

    it("is off until the server says it is on, for everyone in the room", () => {
        expect(get(fastWaterStore)).toBeUndefined();
        fireConditionsStore.set(conditions);
        expect(get(fastWaterStore)).toBeUndefined();
        fireConditionsStore.set({ ...conditions, fastWater: 60 });
        expect(get(fastWaterStore)).toBe(60);
        // An older server says nothing of it: off.
        fireConditionsStore.set({ ...conditions, fastWater: 0 });
        expect(get(fastWaterStore)).toBeUndefined();
    });

    it("gives the clock of the water, the snow and the ice of the room: the map's, or the fast one while on", () => {
        expect(roomWaterTimes(undefined)).toBe(1);
        expect(roomWaterTimes({ speed: 4 })).toBe(4);
        fireConditionsStore.set({ ...conditions, fastWater: 60 });
        expect(roomWaterTimes(undefined)).toBe(60);
        expect(roomWaterTimes({ speed: 4 })).toBe(60);
        // A map already faster keeps its own.
        expect(roomWaterTimes({ speed: 300 })).toBe(300);
    });

    it("is for whoever may edit the map, and changes nothing on a map that goes fast already", () => {
        expect(fastWaterRightsOf(true, undefined)).toEqual({ allowed: true, mapTimes: 1, mapFaster: false });
        expect(fastWaterRightsOf(false, { speed: 4 })).toEqual({ allowed: false, mapTimes: 4, mapFaster: false });
        expect(fastWaterRightsOf(true, { speed: 60 }).mapFaster).toBe(true);
    });
});
