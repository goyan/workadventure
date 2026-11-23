import {
    HURRICANE_RMAX_M,
    HURRICANE_RMAX_PX,
    hurricaneCrossing,
    hurricaneHere,
    WeatherType,
} from "@workadventure/map-editor";
import type { Hurricane } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { withHurricane } from "../../../../../src/front/Phaser/Game/Weather/HurricaneSky";

const START = 1_800_000_000_000;
const MAP = { width: 7680, height: 5120 };
/** Northwards over the middle of the map, in five minutes. */
const storm: Hurricane = {
    id: 4,
    startedAt: START,
    category: 4,
    durationMs: 5 * 60_000,
    heading: 0,
    southern: false,
    ...hurricaneCrossing(MAP.width, MAP.height, MAP.width / 2, MAP.height / 2, 0),
};
/** When the eye is in the middle of the map. */
const middle = new Date(START + storm.durationMs / 2);
const clear = { weather: WeatherType.Clear, cloudiness: 0.2, windFrom: 315, windSpeed: 10 };
const x = MAP.width / 2;
const y = MAP.height / 2;

describe("withHurricane", () => {
    it("leaves the weather of the map as it is without a hurricane, before it and once it ended", () => {
        expect(withHurricane(clear, undefined, middle, x, y)).toBe(clear);
        expect(withHurricane(clear, storm, new Date(START - 1), x, y)).toBe(clear);
        expect(withHurricane(clear, storm, new Date(START + storm.durationMs), x, y)).toBe(clear);
        expect(withHurricane(clear, storm, undefined, x, y)).toBe(clear);
    });

    it("rains as hard as the storm where one looks, in its wind there, under its own spiral of clouds", () => {
        const wall = { x: x + HURRICANE_RMAX_PX, y };
        const here = hurricaneHere(storm, middle.getTime(), wall.x, wall.y);
        const shown = withHurricane(clear, storm, middle, wall.x, wall.y);
        expect(shown?.weather).toBe(WeatherType.Rain);
        expect(shown?.rainRate).toBeCloseTo(here?.rainRate ?? NaN, 6);
        expect(shown?.windSpeed).toBeCloseTo(here?.windSpeed ?? NaN, 6);
        expect(shown?.windFrom).toBeCloseTo(here?.windFrom ?? NaN, 6);
        expect(shown?.hurricaneSky).toBe(true);
        // Elsewhere on the map, another wind.
        const far = withHurricane(clear, storm, middle, x - 4 * HURRICANE_RMAX_PX, y);
        expect(far?.windSpeed).toBeLessThan((shown?.windSpeed ?? 0) * 0.7);
    });

    it("clears the sky in the eye, whatever the map says", () => {
        const shown = withHurricane({ ...clear, weather: WeatherType.Rain, rainRate: 5 }, storm, middle, x, y);
        expect(shown?.weather).toBe(WeatherType.Clear);
        expect(shown?.rainRate).toBe(0);
    });

    it("thunders in the outer rain bands only, never in the wall", () => {
        const kinds = new Set<WeatherType | undefined>();
        for (let radii = 7.05; radii < 10; radii += 0.05) {
            for (let turn = 0; turn < 8; turn++) {
                const angle = (turn * Math.PI) / 4;
                const px = ((radii * HURRICANE_RMAX_M) / HURRICANE_RMAX_M) * HURRICANE_RMAX_PX;
                const shown = withHurricane(clear, storm, middle, x + px * Math.cos(angle), y + px * Math.sin(angle));
                if ((shown?.rainRate ?? 0) >= 0.1) kinds.add(shown?.weather);
            }
        }
        expect([...kinds]).toEqual([WeatherType.Storm]);
        expect(withHurricane(clear, storm, middle, x + HURRICANE_RMAX_PX, y)?.weather).toBe(WeatherType.Rain);
    });

    it("turns the weather of the map into that of the storm without a jump at its start", () => {
        const first = withHurricane(clear, storm, new Date(START), x, y);
        expect(first?.windSpeed).toBeCloseTo(10, 6);
        expect(first?.weather).toBe(WeatherType.Clear);
    });
});
