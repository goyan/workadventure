import { describe, expect, it } from "vitest";
import { nowCellWithConditions, withManualWind } from "../../../../../src/front/Phaser/Game/Weather/ManualConditions";

const thresholds = { thresholdTemperature: 30, thresholdHumidity: 30, thresholdWindSpeed: 30 };
const manual = { manual: true, temperature: 38, humidity: 12, windSpeed: 55, windFrom: 180, ...thresholds };
const real = { ...manual, manual: false, temperature: 22, humidity: 64, windSpeed: 4, windFrom: 90 };

describe("withManualWind", () => {
    it("gives the scene the wind set by hand, whatever the map shows", () => {
        expect(withManualWind({ windFrom: 300, windSpeed: 8, cloudiness: 0.4 }, manual)).toEqual({
            windFrom: 180,
            windSpeed: 55,
            cloudiness: 0.4,
        });
        expect(withManualWind(undefined, manual)).toEqual({ windFrom: 180, windSpeed: 55 });
    });

    it("leaves the wind of the map alone while the conditions are the real ones, or not known yet", () => {
        const settings = { windFrom: 300, windSpeed: 8 };
        expect(withManualWind(settings, real)).toBe(settings);
        expect(withManualWind(settings, undefined)).toBe(settings);
        expect(withManualWind(undefined, undefined)).toBeUndefined();
    });
});

describe("nowCellWithConditions", () => {
    const cell = { at: 0, weather: undefined, temperature: 22, windSpeed: 4, windFrom: 90 };

    it("shows the heat and the wind set by hand, and says so", () => {
        expect(nowCellWithConditions(cell, manual)).toEqual({
            cell: { at: 0, weather: undefined, temperature: 38, windSpeed: 55, windFrom: 180 },
            humidity: 12,
            manual: true,
        });
    });

    it("drops the direction of a wind set to nothing", () => {
        expect(nowCellWithConditions(cell, { ...manual, windSpeed: 0 }).cell).toEqual({
            at: 0,
            weather: undefined,
            temperature: 38,
            windSpeed: 0,
        });
    });

    it("adds the humidity of the air to the real weather, and nothing before the conditions are known", () => {
        expect(nowCellWithConditions(cell, real)).toEqual({ cell, humidity: 64, manual: false });
        expect(nowCellWithConditions(cell, undefined)).toEqual({ cell, humidity: undefined, manual: false });
    });
});
