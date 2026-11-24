import { describe, expect, it } from "vitest";
import { FIRE_CONDITION_BOUNDS } from "../src/Weather/FireConditions";
import {
    frostPoint,
    hoarFrost,
    iceSaturationPressure,
    iceSaturationRatio,
    surfaceTemperature,
    waterSaturationPressure,
} from "../src/Weather/HoarFrost";
import { liquidRainRate, snowRainRate, snowShare, wetBulbTemperature } from "../src/Weather/Precipitation";
import { soilFrost } from "../src/Weather/SoilFrost";
import { rainMeltMm, snowMeltMmPerHour, snowSublimationMmPerHour } from "../src/Terrain/Snow";
import { fireWindPush } from "../src/Terrain/Meadow";
import { emberReachTiles } from "../src/Terrain/TreeFire";
import { ICE_MAX_MM, iceGrowthMmPerDay, iceThawMmPerHour } from "../src/Terrain/Ice";

/**
 * Every rule of the weather that reads the conditions of a room, at the edges of what they may be set to by hand
 * (FIRE_CONDITION_BOUNDS): a number in its range, and a world that stays physical.
 */
const [COLDEST, WARMEST] = FIRE_CONDITION_BOUNDS.temperature;
const STRONGEST = FIRE_CONDITION_BOUNDS.windSpeed[1];
const TEMPERATURES = [COLDEST, -60, -40, -20, 0, 20, 50, 60, WARMEST];
const HUMIDITIES = [0, 5, 30, 50, 99, 100];
const WINDS = [0, 18, 100, 180, STRONGEST];

const finite = (value: number): void => {
    expect(Number.isFinite(value)).toBe(true);
};

describe("the bounds the rules are held to", () => {
    it("are -80 to +80 °C and 0 to 250 km/h", () => {
        expect([COLDEST, WARMEST, STRONGEST]).toEqual([-80, 80, 250]);
    });
});

describe("the wet bulb at the extremes", () => {
    it("is a number, never warmer than the air, and close to it in saturated air", () => {
        for (const temperature of TEMPERATURES) {
            for (const humidity of HUMIDITIES) {
                const wetBulb = wetBulbTemperature(temperature, humidity);
                finite(wetBulb);
                // Stull is within 0.35 °C of the air in a saturated air: it may stand a little over it there.
                expect(wetBulb).toBeLessThanOrEqual(temperature + (humidity >= 99 ? 0.35 : 2.5));
            }
            expect(Math.abs(wetBulbTemperature(temperature, 100) - temperature)).toBeLessThan(0.7);
        }
    });

    it("is the air itself in a great cold, whatever the humidity: such an air holds next to no vapour", () => {
        // The fit of Stull gives -48 °C for an air at -80 °C and 5 %: it is not valid under -20 °C.
        for (const humidity of HUMIDITIES) {
            expect(wetBulbTemperature(-80, humidity)).toBeCloseTo(-80, 0);
            expect(Math.abs(wetBulbTemperature(-40, humidity) + 40)).toBeLessThan(0.3);
        }
    });

    it("solves the psychrometric equation of the WMO over 50 °C: 34.5 °C for an air at 80 °C and 5 %", () => {
        expect(wetBulbTemperature(80, 5)).toBeCloseTo(34.5, 0);
        expect(wetBulbTemperature(60, 50)).toBeCloseTo(47.4, 0);
        expect(wetBulbTemperature(80, 0)).toBeLessThan(wetBulbTemperature(80, 5));
    });

    it("jumps where the fit of Stull hands over to the equation no more than the fit errs there", () => {
        // In an air both cold and dry the fit itself is some 4 °C too warm (Stull 2011): that is the jump at -20 °C.
        for (const humidity of [5, 30, 50, 99]) {
            expect(Math.abs(wetBulbTemperature(-20.001, humidity) - wetBulbTemperature(-20, humidity))).toBeLessThan(
                humidity <= 5 ? 4 : 2,
            );
            expect(Math.abs(wetBulbTemperature(50.001, humidity) - wetBulbTemperature(50, humidity))).toBeLessThan(1.5);
        }
    });
});

describe("rain or snow at the extremes", () => {
    it("is all snow in a great cold and all rain in a great heat, whatever the humidity", () => {
        for (const humidity of HUMIDITIES) {
            for (const temperature of [COLDEST, -60, -40, -20]) expect(snowShare(temperature, humidity)).toBe(1);
            for (const temperature of [20, 50, 60, WARMEST]) expect(snowShare(temperature, humidity)).toBe(0);
        }
    });

    it("splits what falls between rain and snow, the whole of it", () => {
        for (const temperature of TEMPERATURES) {
            const air = { temperature, humidity: 50 };
            expect(liquidRainRate(10, air) + snowRainRate(10, air)).toBeCloseTo(10, 9);
        }
    });
});

describe("the vapour of the air at the extremes", () => {
    it("is within 2.5 % of Murphy and Koop (2005) from -80 to +80 °C, out of the range the WMO gives", () => {
        // D. M. Murphy, T. Koop, Q. J. R. Meteorol. Soc. 131 (2005), eq. 7 (ice) and 10 (supercooled water), in hPa.
        const ice = (celsius: number): number => {
            const kelvin = celsius + 273.15;
            return Math.exp(9.550426 - 5723.265 / kelvin + 3.53068 * Math.log(kelvin) - 0.00728332 * kelvin) / 100;
        };
        const water = (celsius: number): number => {
            const t = celsius + 273.15;
            return (
                Math.exp(
                    54.842763 -
                        6763.22 / t -
                        4.21 * Math.log(t) +
                        0.000367 * t +
                        Math.tanh(0.0415 * (t - 218.8)) * (53.878 - 1331.22 / t - 9.44523 * Math.log(t) + 0.014025 * t),
                ) / 100
            );
        };
        for (const celsius of [-80, -65, -45, -20, 0, 20, 50]) {
            expect(Math.abs(waterSaturationPressure(celsius) / water(celsius) - 1)).toBeLessThan(0.025);
        }
        for (const celsius of [-80, -65, -45, -20, 0]) {
            expect(Math.abs(iceSaturationPressure(celsius) / ice(celsius) - 1)).toBeLessThan(0.01);
        }
        // Over 60 °C, against the steam tables (IAPWS-95): 474.2 hPa at 80 °C (Wagner and Pruss 2002).
        expect(Math.abs(waterSaturationPressure(80) / 474.2 - 1)).toBeLessThan(0.015);
    });

    it("gives a frost point as a number for any air with some vapour, under a dry air", () => {
        for (const temperature of TEMPERATURES) {
            for (const humidity of HUMIDITIES.filter((value) => value > 0)) {
                const point = frostPoint(temperature, humidity);
                finite(point);
                if (humidity <= 30) expect(point).toBeLessThan(temperature);
            }
        }
        // An air saturated over water at -80 °C is supersaturated over ice: its frost point is over its temperature.
        expect(frostPoint(-80, 100)).toBeGreaterThan(-80);
    });
});

describe("hoar frost at the extremes", () => {
    it("stays between 0 and 1, a number, for every air", () => {
        for (const temperature of TEMPERATURES) {
            for (const humidity of HUMIDITIES) {
                for (const windSpeed of WINDS) {
                    const frost = hoarFrost({ temperature, humidity, windSpeed });
                    finite(frost);
                    expect(frost).toBeGreaterThanOrEqual(0);
                    expect(frost).toBeLessThanOrEqual(1);
                    const ratio = iceSaturationRatio({ temperature, humidity, windSpeed });
                    expect(ratio === undefined || Number.isFinite(ratio)).toBe(true);
                    finite(surfaceTemperature(temperature, windSpeed));
                }
            }
        }
    });

    it("whitens a ground at -80 °C only in an air saturated over its ice, never in a dry one", () => {
        expect(hoarFrost({ temperature: -80, humidity: 100, windSpeed: 0 })).toBeGreaterThan(0);
        expect(hoarFrost({ temperature: -80, humidity: 30, windSpeed: 0 })).toBe(0);
        expect(hoarFrost({ temperature: -80, humidity: 0, windSpeed: 0 })).toBe(0);
    });

    it("is swept away by a storm: whole up to 120 km/h as before, less and less over it, none at 250 km/h", () => {
        const at = (windSpeed: number) => hoarFrost({ temperature: -10, humidity: 100, windSpeed });
        expect(at(120)).toBeGreaterThan(0.9);
        expect(at(120)).toBe(at(60));
        expect(at(185)).toBeCloseTo(at(120) / 2, 6);
        expect(at(STRONGEST)).toBe(0);
        expect(hoarFrost({ temperature: COLDEST, humidity: 100, windSpeed: STRONGEST })).toBe(0);
    });

    it("is none in a great heat", () => {
        for (const humidity of HUMIDITIES) expect(hoarFrost({ temperature: WARMEST, humidity, windSpeed: 0 })).toBe(0);
    });
});

describe("the soil at the extremes", () => {
    it("is all frozen in a great cold, not at all in a great heat", () => {
        expect(soilFrost(COLDEST)).toBe(1);
        expect(soilFrost(-40)).toBe(1);
        expect(soilFrost(WARMEST)).toBe(0);
    });
});

describe("the snow at the extremes", () => {
    it("melts fast in a hot storm, as a number, and not at all in a great cold", () => {
        for (const humidity of HUMIDITIES) {
            for (const windSpeed of WINDS) {
                expect(snowMeltMmPerHour({ temperature: COLDEST, humidity, windSpeed })).toBe(0);
                const melt = snowMeltMmPerHour({ temperature: WARMEST, humidity, windSpeed });
                finite(melt);
                expect(melt).toBeGreaterThan(0);
                const going = snowSublimationMmPerHour({ temperature: COLDEST, humidity, windSpeed });
                finite(going);
                expect(going).toBeGreaterThanOrEqual(0);
            }
        }
        // 80 °C, a damp air and a wind of 250 km/h: 324 mm of water an hour of the real clock; on a map 600 times
        // faster, about 108 mm a step of 2 s: a deep snow (600 mm) is gone in some twenty seconds, not in one step.
        const THAW_SPEED = 600;
        const hottest = snowMeltMmPerHour({ temperature: WARMEST, humidity: 100, windSpeed: STRONGEST });
        expect(hottest).toBeCloseTo(324, 6);
        expect((hottest * 2 * THAW_SPEED) / 3600).toBeCloseTo(108, 6);
        expect(rainMeltMm(10, WARMEST)).toBe(80);
        expect(rainMeltMm(10, COLDEST)).toBe(0);
    });
});

describe("the push of the wind on a fire at the extremes", () => {
    it("stays between nothing and three times the calm, however strong the wind", () => {
        for (const speed of [0, 100, 180, STRONGEST]) {
            for (const along of [-1, -0.5, 0, 0.5, 1]) {
                const push = fireWindPush(along, speed);
                finite(push);
                expect(push).toBeGreaterThan(0);
                expect(push).toBeLessThanOrEqual(3);
            }
        }
        expect(fireWindPush(1, STRONGEST)).toBe(3);
        // The flanks and the back of a fire in a storm hardly move.
        expect(fireWindPush(0, STRONGEST)).toBeLessThan(0.05);
        expect(fireWindPush(-1, STRONGEST)).toBeLessThan(0.01);
    });
});

describe("the embers of a tree at the extremes", () => {
    it("fly no further in a storm of 250 km/h than at 120: forty tiles at most", () => {
        expect(emberReachTiles(STRONGEST)).toBe(emberReachTiles(120));
        expect(emberReachTiles(STRONGEST)).toBeLessThanOrEqual(40);
        finite(emberReachTiles(STRONGEST));
    });
});

describe("the ice of the water at the extremes", () => {
    it("thickens as a number in a polar storm, not at all in a great heat, and thaws fast there", () => {
        for (const humidity of HUMIDITIES) {
            for (const windSpeed of WINDS) {
                for (const thickness of [0, 10, ICE_MAX_MM]) {
                    const growth = iceGrowthMmPerDay(thickness, { temperature: COLDEST, humidity, windSpeed }, 0);
                    finite(growth);
                    expect(growth).toBeGreaterThan(0);
                    expect(iceGrowthMmPerDay(thickness, { temperature: WARMEST, humidity, windSpeed }, 0)).toBe(0);
                }
                expect(iceThawMmPerHour({ temperature: COLDEST, humidity, windSpeed })).toBe(0);
                finite(iceThawMmPerHour({ temperature: WARMEST, humidity, windSpeed }));
            }
        }
    });
});
