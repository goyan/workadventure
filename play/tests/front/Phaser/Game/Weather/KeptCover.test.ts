import {
    ICE_BEARS_MM,
    ICE_GROWTH_TIMES,
    iceGrowthMmPerDay,
    iceThawMmPerHour,
    snowMeltMmPerHour,
    snowSublimationMmPerHour,
} from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    explainKeptIce,
    explainKeptSnow,
    iceRateMmPerHour,
    iceTimeTo,
} from "../../../../../src/front/Phaser/Game/Weather/KeptCover";

const cairo = { temperature: 24, humidity: 49, windSpeed: 10 };
const frost = { temperature: -10, humidity: 70, windSpeed: 0 };

describe("explainKeptIce", () => {
    it("says a thick ice thaws under a warm air, at the rate of the server, and when it gives way and is gone", () => {
        const ice = explainKeptIce({ mm: 100, weather: cairo });
        expect(ice.trend).toBe("thawing");
        expect(ice.mmPerHour).toBe(iceThawMmPerHour(cairo));
        // 24 °C, 10 km/h, 49 %: about 7 mm an hour, so 100 mm last about 14 hours of the real clock.
        expect(ice.mmPerHour).toBeCloseTo(7.13, 1);
        expect(ice.goneIn).toBeCloseTo((100 / iceThawMmPerHour(cairo)) * 3600, 3);
        expect(ice.givesWayIn).toBeCloseTo(((100 - ICE_BEARS_MM) / iceThawMmPerHour(cairo)) * 3600, 3);
        expect(ice).toMatchObject({ bears: true, shack: false, temperature: 24 });
    });

    it("goes as many times faster as the water of the map", () => {
        const slow = explainKeptIce({ mm: 100, weather: cairo, times: 1 });
        const fast = explainKeptIce({ mm: 100, weather: cairo, times: 60 });
        expect(fast.mmPerHour).toBeCloseTo((slow.mmPerHour ?? 0) * 60, 6);
        expect(fast.goneIn).toBeCloseTo((slow.goneIn ?? 0) / 60, 3);
    });

    it("says a thin ice no longer bears, with no time before it gives way", () => {
        const ice = explainKeptIce({ mm: 20, weather: cairo });
        expect(ice).toMatchObject({ trend: "thawing", bears: false });
        expect(ice.givesWayIn).toBeUndefined();
    });

    it("says an ice grows in the frost, slower as it thickens, and when it will bear a walker", () => {
        const thin = explainKeptIce({ mm: 20, weather: frost });
        expect(thin.trend).toBe("growing");
        expect(thin.mmPerHour).toBe((iceGrowthMmPerDay(20, frost, 0) * ICE_GROWTH_TIMES) / 24);
        expect(explainKeptIce({ mm: 40, weather: frost }).mmPerHour).toBeLessThan(thin.mmPerHour);
        // Stepping the rate of the server from 20 to 50 mm: between the times the two end rates would give.
        const bearsIn = thin.bearsIn ?? Number.NaN;
        const fastest = (30 / iceRateMmPerHour(20, frost, 0, undefined, 1)) * 3600;
        const slowest = (30 / iceRateMmPerHour(50, frost, 0, undefined, 1)) * 3600;
        expect(bearsIn).toBeGreaterThan(fastest);
        expect(bearsIn).toBeLessThan(slowest);
    });

    it("grows slower under the snow, as on the server", () => {
        const bare = explainKeptIce({ mm: 20, weather: frost });
        const covered = explainKeptIce({ mm: 20, weather: frost, snowMm: 50 });
        expect(covered.mmPerHour).toBeCloseTo(bare.mmPerHour / 2, 6);
    });

    it("says no ice takes on water running too fast, and less on water running fast", () => {
        expect(explainKeptIce({ mm: 0, weather: frost, currentMs: 1.5 })).toMatchObject({
            trend: "none",
            currentShare: 0,
        });
        const half = explainKeptIce({ mm: 0, weather: frost, currentMs: 0.9 });
        expect(half.trend).toBe("growing");
        expect(half.currentShare).toBeCloseTo(0.5, 6);
        expect(half.mmPerHour).toBeCloseTo(explainKeptIce({ mm: 0, weather: frost }).mmPerHour / 2, 6);
    });

    it("never bears where the water is too shallow to hold that much ice", () => {
        const ice = explainKeptIce({ mm: 10, weather: frost, capMm: 30 });
        expect(ice.trend).toBe("growing");
        expect(ice.bearsIn).toBeUndefined();
        expect(explainKeptIce({ mm: 30, weather: frost, capMm: 30 }).trend).toBe("holding");
    });

    it("says nothing is there nor coming over zero without ice, and holds at zero", () => {
        expect(explainKeptIce({ mm: 0, weather: cairo }).trend).toBe("none");
        expect(explainKeptIce({ mm: 80, weather: { temperature: 0, humidity: 50, windSpeed: 5 } })).toMatchObject({
            trend: "holding",
            mmPerHour: 0,
        });
    });

    it("says the trend is not known without the air of the room", () => {
        expect(explainKeptIce({ mm: 80, weather: undefined })).toMatchObject({ trend: "unknown", bears: true });
    });
});

describe("iceTimeTo", () => {
    it("is exact for a steady thaw and undefined the wrong way", () => {
        expect(iceTimeTo(100, 0, () => -10)).toBeCloseTo(36000, 6);
        expect(iceTimeTo(100, 0, () => 5)).toBeUndefined();
        expect(iceTimeTo(10, 50, () => -5)).toBeUndefined();
        expect(iceTimeTo(10, 10, () => 0)).toBe(0);
    });
});

describe("explainKeptSnow", () => {
    it("says a snow melts over zero, by the melt and the dry wind of the server, and when it is gone", () => {
        const snow = explainKeptSnow({ mm: 15, weather: cairo });
        const going = snowMeltMmPerHour(cairo) + snowSublimationMmPerHour(cairo);
        expect(snow).toMatchObject({ trend: "thawing", temperature: 24 });
        expect(snow.mmPerHour).toBe(going);
        expect(snow.meltMmPerHour).toBe(snowMeltMmPerHour(cairo));
        expect(snow.goneIn).toBeCloseTo((15 / going) * 3600, 6);
    });

    it("says a snow under zero only goes by the dry wind, and holds in a calm", () => {
        const windy = explainKeptSnow({ mm: 15, weather: { temperature: -5, humidity: 30, windSpeed: 30 } });
        expect(windy.trend).toBe("thawing");
        expect(windy.meltMmPerHour).toBe(0);
        expect(windy.mmPerHour).toBeGreaterThan(0);
        expect(explainKeptSnow({ mm: 15, weather: { temperature: -5, humidity: 30, windSpeed: 0 } }).trend).toBe(
            "holding",
        );
    });

    it("says it builds up while a snow falls, nothing without snow, unknown without air", () => {
        expect(explainKeptSnow({ mm: 3, weather: frost, building: true }).trend).toBe("growing");
        expect(explainKeptSnow({ mm: 0, weather: cairo }).trend).toBe("none");
        expect(explainKeptSnow({ mm: 5, weather: undefined }).trend).toBe("unknown");
    });
});
