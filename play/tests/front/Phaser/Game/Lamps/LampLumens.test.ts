import { describe, expect, it } from "vitest";
import {
    LAMP_LUMENS_MAX,
    LAMP_LUMENS_MIN,
    LAMP_LUMENS_PRESETS,
    lampFromLumens,
    lumensOfLamp,
    lumensOfReach,
    realLightFalloff,
} from "../../../../../src/front/Phaser/Game/Lamps/LampLumens";
import { lightFalloff } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";

describe("the power of a lamp, in lumens", () => {
    it("takes the lamp of today (6 tiles, full strength) for a living room bulb of about 600 lm", () => {
        expect(lumensOfReach(6)).toBeGreaterThan(580);
        expect(lumensOfReach(6)).toBeLessThan(620);
        expect(lampFromLumens(lumensOfReach(6))).toEqual({ radius: 6, intensityPercent: 100 });
    });

    it("gives a weaker lamp a shorter reach and less light at its foot, both together", () => {
        expect(lampFromLumens(200)).toEqual({ radius: 3, intensityPercent: 35 });
        expect(lampFromLumens(75)).toEqual({ radius: 1, intensityPercent: 10 });
    });

    it("gives a stronger lamp a longer reach, its foot already fully lit", () => {
        expect(lampFromLumens(1600)).toEqual({ radius: 10, intensityPercent: 100 });
        expect(lampFromLumens(6100)).toEqual({ radius: 20, intensityPercent: 100 });
    });

    it("keeps to what a lamp of the map can be", () => {
        expect(lampFromLumens(1)).toEqual(lampFromLumens(LAMP_LUMENS_MIN));
        expect(lampFromLumens(1e6)).toEqual(lampFromLumens(LAMP_LUMENS_MAX));
        expect(lampFromLumens(Number.NaN)).toEqual(lampFromLumens(LAMP_LUMENS_MIN));
    });

    it("finds the reach again from the power, for every reach a lamp can have", () => {
        for (let radius = 1; radius <= 20; radius += 0.5) {
            expect(lampFromLumens(lumensOfReach(radius)).radius).toBe(radius);
        }
    });

    it("reads the power of a lamp whose reach and strength go together, and none for a lamp set freely", () => {
        expect(lumensOfLamp(6, 100)).toBe(lumensOfReach(6));
        expect(lumensOfLamp(3, 35)).toBe(lumensOfReach(3));
        // 10 tiles at 30 %: no real lamp does that.
        expect(lumensOfLamp(10, 30)).toBeUndefined();
        expect(lumensOfLamp(2, 100)).toBeUndefined();
    });

    it("names a few real lamps, each of them a lamp of the map", () => {
        expect(LAMP_LUMENS_PRESETS.map((preset) => preset.name)).toEqual([
            "candle",
            "accent",
            "desk",
            "bulb",
            "ceiling",
            "floodlight",
        ]);
        for (const preset of LAMP_LUMENS_PRESETS) {
            const lamp = lampFromLumens(preset.lumens);
            expect(lumensOfLamp(lamp.radius, lamp.intensityPercent)).toBeDefined();
        }
    });
});

describe("realLightFalloff", () => {
    it("is full at the lamp and gone at the end of its reach, like the usual one", () => {
        expect(realLightFalloff(0, 6)).toBeCloseTo(1);
        expect(realLightFalloff(1, 6)).toBeCloseTo(0);
        expect(realLightFalloff(2, 6)).toBe(0);
    });

    it("fades faster near the lamp than the usual one: a real light is brighter at its foot", () => {
        expect(realLightFalloff(0.5, 6)).toBeLessThan(lightFalloff(0.5));
        expect(realLightFalloff(0.5, 6)).toBeGreaterThan(0.2);
        expect(realLightFalloff(0.25, 6)).toBeGreaterThan(realLightFalloff(0.5, 6));
    });
});
