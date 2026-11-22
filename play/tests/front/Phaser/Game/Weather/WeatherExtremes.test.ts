import { FIRE_CONDITION_BOUNDS } from "@workadventure/map-editor";
import type { FireConditionsMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { quantizeWind } from "@wa/front/Phaser/Game/Autumn/LeafDensity";
import { flameOf, smokeOf } from "@wa/front/Phaser/Game/Fire/FlameShape";
import { leafActivity } from "@wa/front/Phaser/Game/Nature/TreeLeafFall";
import { swayAmplitude, treePose, treeSwayAngle } from "@wa/front/Phaser/Game/Nature/TreePoses";
import { cloudDrift } from "@wa/front/Phaser/Game/Weather/Clouds";
import { frostOf, iceAt, iceOf, isFrozen } from "@wa/front/Phaser/Game/Weather/Frost";
import { nowCellWithConditions, withManualWind } from "@wa/front/Phaser/Game/Weather/ManualConditions";
import { rainLean } from "@wa/front/Phaser/Game/Weather/Rain";

/**
 * What the browser draws from the conditions of a room at the edges of what they may be set to by hand
 * (FIRE_CONDITION_BOUNDS: -80 to +80 °C, a wind up to 250 km/h): numbers, within what each drawing may take.
 */
const [COLDEST, WARMEST] = FIRE_CONDITION_BOUNDS.temperature;
const STRONGEST = FIRE_CONDITION_BOUNDS.windSpeed[1];
const WINDS = [0, 80, 100, 180, STRONGEST];
const finite = (value: number): void => {
    expect(Number.isFinite(value)).toBe(true);
};

describe("the ice and the frost at the extremes", () => {
    it("freezes all the water, the deepest too, at -80 °C, and none at +80 °C", () => {
        expect(iceAt(COLDEST)).toBe(1);
        expect(isFrozen(1000, iceAt(COLDEST))).toBe(true);
        expect(iceAt(WARMEST)).toBe(0);
        expect(iceOf({ temperature: WARMEST, humidity: 50, windSpeed: 0 })).toBe(0);
    });

    it("frosts the ground between 0 and 1, never in a great heat", () => {
        for (const temperature of [COLDEST, -40, 0, WARMEST]) {
            for (const humidity of [0, 50, 100]) {
                for (const windSpeed of WINDS) {
                    const frost = frostOf({ temperature, humidity, windSpeed });
                    finite(frost);
                    expect(frost).toBeGreaterThanOrEqual(0);
                    expect(frost).toBeLessThanOrEqual(1);
                }
            }
            expect(frostOf({ temperature: WARMEST, humidity: 100, windSpeed: 0 })).toBe(0);
        }
    });
});

describe("the wind at the extremes", () => {
    it("drives the clouds no faster than 180 px a second", () => {
        for (const windSpeed of WINDS) {
            const drift = cloudDrift(270, windSpeed);
            finite(drift.x);
            expect(Math.hypot(drift.x, drift.y)).toBeLessThanOrEqual(180 + 1e-9);
        }
        expect(Math.hypot(cloudDrift(270, STRONGEST).x, cloudDrift(270, STRONGEST).y)).toBeCloseTo(180, 9);
    });

    it("lays the trees as far as from 80 km/h, no further: four pixels at most at the top", () => {
        for (const windSpeed of WINDS) {
            expect(swayAmplitude(windSpeed)).toBe(swayAmplitude(Math.min(windSpeed, 80)));
            for (const seconds of [0, 1.3, 7.7, 1e9]) {
                finite(treeSwayAngle(seconds, windSpeed, 0.3));
                const pose = treePose(seconds, windSpeed, 270, 0.3);
                expect(Math.abs(pose)).toBeLessThanOrEqual(4);
            }
        }
        // Bent over by a storm, the tree keeps leaning where the wind goes.
        for (const seconds of [0, 1.3, 7.7]) expect(treePose(seconds, STRONGEST, 270, 0.3)).toBeGreaterThan(0);
        expect(leafActivity(STRONGEST)).toBe(1);
    });

    it("leans the rain no more than one pixel sideways for one down, and the leaves at their strongest", () => {
        for (const windSpeed of WINDS) {
            const lean = rainLean(270, windSpeed);
            finite(lean);
            expect(Math.abs(lean)).toBeLessThanOrEqual(1);
        }
        expect(quantizeWind(STRONGEST, 270).level).toBe(4);
        expect(quantizeWind(STRONGEST, 270).level).toBe(quantizeWind(50, 270).level);
    });

    it("lays the flames and carries their smoke no further than at the strongest wind they know", () => {
        const flame = (windSpeed: number) =>
            flameOf({ intensity: 1, windFrom: 270, windSpeed, seconds: 3, seed: 0.4, reducedMotion: false });
        expect(flame(STRONGEST)).toEqual(flame(80));
        finite(flame(STRONGEST).tip.x);
        const smoke = (windSpeed: number) =>
            smokeOf({ intensity: 1, windFrom: 270, windSpeed, seconds: 3, seed: 0.4, reducedMotion: false });
        expect(smoke(STRONGEST)).toEqual(smoke(60));
        for (const puff of smoke(STRONGEST)) finite(puff.x);
    });
});

describe("the conditions set by hand at the extremes", () => {
    const conditions = (temperature: number, windSpeed: number): FireConditionsMessage => ({
        manual: true,
        temperature,
        humidity: 50,
        windSpeed,
        windFrom: 270,
        thresholdTemperature: 30,
        thresholdHumidity: 30,
        thresholdWindSpeed: 30,
    });

    it("give the sky their wind and the banner their cold, their heat and their wind", () => {
        expect(withManualWind({ windSpeed: 10, windFrom: 0 }, conditions(COLDEST, STRONGEST))).toEqual({
            windSpeed: STRONGEST,
            windFrom: 270,
        });
        const cold = nowCellWithConditions(
            { at: 0, weather: undefined, temperature: 2 },
            conditions(COLDEST, STRONGEST),
        );
        expect(cold.cell).toMatchObject({ temperature: COLDEST, windSpeed: STRONGEST, windFrom: 270 });
        const hot = nowCellWithConditions({ at: 0, weather: undefined, temperature: 2 }, conditions(WARMEST, 0));
        expect(hot.cell.temperature).toBe(WARMEST);
        expect(hot.cell.windFrom).toBeUndefined();
    });
});
