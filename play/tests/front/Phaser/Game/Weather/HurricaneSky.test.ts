import { hurricaneAt, WeatherType } from "@workadventure/map-editor";
import type { Hurricane } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { withHurricane } from "../../../../../src/front/Phaser/Game/Weather/HurricaneSky";

const START = 1_800_000_000_000;
const storm: Hurricane = {
    id: 4,
    startedAt: START,
    category: 4,
    durationMs: 30 * 60_000,
    offsetKm: 0,
    heading: 290,
    southern: false,
};
const at = (progress: number): Date => new Date(START + progress * storm.durationMs);
const clear = { weather: WeatherType.Clear, cloudiness: 0.2, windFrom: 315, windSpeed: 10 };

describe("withHurricane", () => {
    it("leaves the weather of the map as it is without a hurricane, before it and once it ended", () => {
        expect(withHurricane(clear, undefined, at(0.5))).toBe(clear);
        expect(withHurricane(clear, storm, new Date(START - 1))).toBe(clear);
        expect(withHurricane(clear, storm, at(1))).toBe(clear);
        expect(withHurricane(clear, storm, undefined)).toBe(clear);
    });

    it("rains as hard as the storm, under its whole cloud, in its wind", () => {
        const date = at(0.4);
        const now = hurricaneAt(storm, date.getTime());
        const shown = withHurricane(clear, storm, date);
        expect(shown?.weather).toBe(WeatherType.Rain);
        expect(shown?.rainRate).toBeCloseTo(now?.rainRate ?? NaN, 6);
        expect(shown?.cloudCover).toBe(1);
        expect(shown?.windSpeed).toBeCloseTo(now?.windSpeed ?? NaN, 6);
        expect(shown?.windFrom).toBeCloseTo(now?.windFrom ?? NaN, 6);
    });

    it("clears the sky in the eye, whatever the map says, with a few low clouds", () => {
        const shown = withHurricane({ ...clear, weather: WeatherType.Rain, rainRate: 5 }, storm, at(0.5));
        expect(shown?.weather).toBe(WeatherType.Clear);
        expect(shown?.rainRate).toBe(0);
        expect(shown?.cloudiness).toBeLessThan(0.2);
    });

    it("thunders in the outer rain bands only, where hurricanes have most of their lightning", () => {
        // About 250 km from the centre (Molinari et al. 1999: the strongest maximum of lightning, 210 to 290 km).
        const kinds = new Set<WeatherType | undefined>();
        for (let km = 210; km <= 290; km++) {
            // The centre `km` before the map, coming at 20 km/h over a passage of 36 h.
            const shown = withHurricane(clear, storm, at(0.5 - km / 20 / 36));
            if ((shown?.rainRate ?? 0) >= 0.1) kinds.add(shown?.weather);
        }
        expect([...kinds]).toEqual([WeatherType.Storm]);
        // Never in the wall.
        expect(withHurricane(clear, storm, at(0.47))?.weather).toBe(WeatherType.Rain);
    });

    it("turns the weather of the map into that of the storm without a jump at its start", () => {
        const first = withHurricane(clear, storm, at(0));
        expect(first?.windSpeed).toBeCloseTo(10, 6);
        expect(first?.windFrom).toBeCloseTo(315, 6);
        expect(first?.weather).toBe(WeatherType.Clear);
        const later = withHurricane(clear, storm, new Date(START + 1000));
        expect(Math.abs((later?.windSpeed ?? NaN) - 10)).toBeLessThan(1);
    });
});
