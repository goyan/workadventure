import { describe, expect, it } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    TORCH_GUST_SLOT_MS,
    torchGust,
    torchGustAt,
    torchWind,
} from "../../../../../src/front/Phaser/Game/Torch/TorchGust";
import { torchFlickerSeed } from "../../../../../src/front/Phaser/Game/Torch/TorchFlicker";

const EPOCH = Date.UTC(2026, 10, 14, 18, 0, 0);
const seeds = ["1", "42", "1337", "7", "99"].map(torchFlickerSeed);

/** The gusts of a torch over `slots` slots: when each starts, and how deep it goes. */
function gusts(seed: number, wind: number, slots: number) {
    const list: { start: number; drop: number }[] = [];
    const first = Math.floor(EPOCH / TORCH_GUST_SLOT_MS);
    for (let slot = first; slot < first + slots; slot++) {
        const gust = torchGustAt(slot, seed, wind);
        if (gust) list.push(gust);
    }
    return list;
}

describe("torchWind", () => {
    it("blows only outdoors, more with rain, most with a storm", () => {
        for (const weather of Object.values(WeatherType)) expect(torchWind(weather, false)).toBe(0);
        const breeze = torchWind(WeatherType.Clear, true);
        expect(breeze).toBeGreaterThan(0);
        expect(torchWind(WeatherType.Rain, true)).toBeGreaterThan(breeze);
        expect(torchWind(WeatherType.Storm, true)).toBe(1);
        // A fog is still air.
        expect(torchWind(WeatherType.Fog, true)).toBeLessThan(breeze);
    });

    it("takes a wind of its own when one is known (the real wind, later): from 0 to 1", () => {
        expect(torchWind(WeatherType.Clear, true, 0.8)).toBe(0.8);
        expect(torchWind(WeatherType.Clear, true, 3)).toBe(1);
        // Indoors there is still no wind.
        expect(torchWind(WeatherType.Storm, false, 1)).toBe(0);
    });
});

describe("torchGust", () => {
    it("never comes without wind", () => {
        for (const seed of seeds) expect(gusts(seed, 0, 200)).toEqual([]);
        for (let ms = 0; ms < 60_000; ms += 50) expect(torchGust(EPOCH + ms, seeds[0], 0, false)).toBe(1);
    });

    it("is the same on every browser, and each torch has its own", () => {
        expect(gusts(seeds[0], 1, 50)).toEqual(gusts(seeds[0], 1, 50));
        expect(gusts(seeds[0], 1, 50)).not.toEqual(gusts(seeds[1], 1, 50));
    });

    it("comes at most once every 5 seconds, more often in a storm than in a breeze", () => {
        for (const seed of seeds) {
            for (const wind of [0.25, 0.6, 1]) {
                const list = gusts(seed, wind, 400);
                for (let index = 1; index < list.length; index++) {
                    expect(list[index].start - list[index - 1].start).toBeGreaterThanOrEqual(5000);
                }
            }
        }
        const count = (wind: number) => seeds.reduce((sum, seed) => sum + gusts(seed, wind, 400).length, 0);
        expect(count(1)).toBeGreaterThan(count(0.6));
        expect(count(0.6)).toBeGreaterThan(count(0.25));
        // A storm: about one gust every 8 to 10 seconds.
        expect(count(1) / seeds.length / (400 * 8)).toBeGreaterThan(1 / 10);
    });

    it("drops by 30 % in a breeze to 35 % in a storm", () => {
        for (const seed of seeds) {
            for (const gust of gusts(seed, 0.25, 200)) expect(gust.drop).toBeCloseTo(0.3125);
            for (const gust of gusts(seed, 1, 200)) expect(gust.drop).toBeCloseTo(0.35);
        }
    });

    it("drops fast, then comes back slowly, as a flame pushed by the wind", () => {
        const [gust] = gusts(seeds[0], 1, 50);
        const at = (ms: number) => torchGust(gust.start + ms, seeds[0], 1, false);
        expect(at(-1)).toBe(1);
        expect(at(0)).toBe(1);
        // Down to its lowest in 150 ms.
        expect(at(150)).toBeCloseTo(1 - gust.drop);
        expect(at(75)).toBeCloseTo(1 - gust.drop / 2);
        // Up again over 1.7 s, the quickest first: past halfway within half a second, whole at the end.
        expect(at(150 + 500)).toBeGreaterThan(1 - gust.drop / 2);
        expect(at(150 + 1000)).toBeLessThan(1);
        expect(at(150 + 1700)).toBeCloseTo(1);
        expect(at(150 + 2500)).toBe(1);
        // Only down, then only up.
        let previous = 1;
        for (let ms = 0; ms <= 150; ms += 10) {
            expect(at(ms)).toBeLessThanOrEqual(previous);
            previous = at(ms);
        }
        for (let ms = 150; ms <= 1850; ms += 10) {
            expect(at(ms)).toBeGreaterThanOrEqual(previous - 1e-12);
            previous = at(ms);
        }
    });

    it("is steady when the system asks for less motion", () => {
        for (let ms = 0; ms < 60_000; ms += 50) expect(torchGust(EPOCH + ms, seeds[0], 1, true)).toBe(1);
    });
});
