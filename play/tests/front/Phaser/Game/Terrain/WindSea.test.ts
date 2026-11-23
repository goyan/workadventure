import { describe, expect, it } from "vitest";
import {
    BREAKING_SLOPE,
    effectiveFetchGrid,
    fetchByte,
    fetchGrid,
    fetchSea,
    FETCH_MOST_METRES,
    jonswapDensity,
    MAP_PX_METRES,
    SEA_COMPONENTS,
    seaAmplitudes,
    seaComponents,
    seaPhase,
    seaSurface,
    SHORTEST_WAVE_PX,
} from "@wa/front/Phaser/Game/Terrain/WindSea";

const EAST = { x: 1, y: 0 };

describe("fetchSea: the sea a wind raises over a stretch of water (JONSWAP 1973)", () => {
    it("gives the peak and the height of the report's laws", () => {
        // Hasselmann et al. 1973, eq. 2.4.3 and 2.4.7: f_p U / g = 3.5 x^-0.33, E g² / U⁴ = 1.6e-7 x, x = g X / U².
        // 40 km/h over 200 m: x = 15.9, T_p = 0.81 s, L_p = 1.01 m, Hs = 8.0 cm (study of the swell, table 1.2).
        const sea = fetchSea(40 / 3.6, 200);
        expect(sea.x).toBeCloseTo(15.9, 1);
        expect(sea.tp).toBeCloseTo(0.81, 2);
        expect(sea.lp).toBeCloseTo(1.01, 2);
        expect(sea.hs).toBeCloseTo(0.08, 3);
        // 80 km/h over 142 m, the longest fetch of Antoine's map: L_p = 1.30 m, Hs = 13.5 cm.
        const gale = fetchSea(80 / 3.6, 142);
        expect(gale.lp).toBeCloseTo(1.3, 2);
        expect(gale.hs).toBeCloseTo(0.135, 3);
    });

    it("grows with the wind and with the fetch, and stops growing once the sea is fully grown", () => {
        expect(fetchSea(20 / 3.6, 100).hs).toBeLessThan(fetchSea(40 / 3.6, 100).hs);
        expect(fetchSea(40 / 3.6, 50).hs).toBeLessThan(fetchSea(40 / 3.6, 200).hs);
        expect(fetchSea(40 / 3.6, 50).lp).toBeLessThan(fetchSea(40 / 3.6, 200).lp);
        // Pierson-Moskowitz: f_p U / g about 0.13 however far the wind blows.
        const open = fetchSea(10, 1e9);
        expect((open.fp * 10) / 9.81).toBeCloseTo(0.13, 3);
    });

    it("the JONSWAP spectrum holds the energy of the law (Hs = 4 √m0)", () => {
        const sea = fetchSea(40 / 3.6, 200);
        let m0 = 0;
        for (let f = 0.2; f < 20; f += 0.0005) m0 += jonswapDensity(f, sea.fp, sea.alpha) * 0.0005;
        // The JONSWAP fit (alpha, gamma) and the energy law are two fits of the same data: within 15 %.
        expect(4 * Math.sqrt(m0)).toBeGreaterThan(sea.hs * 0.85);
        expect(4 * Math.sqrt(m0)).toBeLessThan(sea.hs * 1.15);
    });
});

describe("seaComponents: the waves the shader sums", () => {
    it("are none under 10 km/h: the water is drawn as it always was", () => {
        expect(seaComponents(undefined, EAST)).toEqual([]);
        expect(seaComponents(9.9, EAST)).toEqual([]);
        expect(seaComponents(Number.NaN, EAST)).toEqual([]);
        expect(seaComponents(10, EAST)).toHaveLength(SEA_COMPONENTS);
    });

    it("go downwind, spread around it like a wind sea, and none is shorter than the pixels can draw", () => {
        for (const kmh of [10, 20, 40, 60, 82, 110, 150]) {
            const components = seaComponents(kmh, EAST);
            let downwind = 0;
            for (const component of components) {
                // Deep water: the wave number of its frequency (Airy).
                const k = Math.hypot(component.kx, component.ky);
                expect(k).toBeCloseTo((2 * Math.PI * component.f) ** 2 / 9.81, 6);
                expect(Math.hypot(component.cx, component.cy)).toBeCloseTo((k * MAP_PX_METRES) / (2 * Math.PI), 9);
                if (component.kx > 0) downwind++;
                if (component.lengthPx < SHORTEST_WAVE_PX) expect(component.fade, `${kmh} km/h`).toBe(0);
            }
            expect(downwind, `${kmh} km/h`).toBeGreaterThanOrEqual(SEA_COMPONENTS - 1);
        }
    });

    it("carry the height of the sea: Hs from their amplitudes as the law, where the pixels show them all", () => {
        for (const [kmh, fetch] of [
            [40, 200],
            [60, 100],
            [82, 140],
            [110, 200],
        ]) {
            const u = kmh / 3.6;
            const amplitudes = seaAmplitudes(seaComponents(kmh, EAST), u, fetch, 10);
            let m0 = 0;
            for (const a of amplitudes) m0 += (a * a) / 2;
            const hs = fetchSea(u, fetch).hs;
            // Only the waves under 8 px fade: a few % of the energy at these fetches.
            expect(4 * Math.sqrt(m0), `${kmh} km/h over ${fetch} m`).toBeGreaterThan(hs * 0.95);
            expect(4 * Math.sqrt(m0), `${kmh} km/h over ${fetch} m`).toBeLessThanOrEqual(hs * 1.0001);
        }
    });

    it("are no higher than 0.8 of the depth over the shallows (Dean & Dalrymple)", () => {
        const u = 80 / 3.6;
        const deep = seaAmplitudes(seaComponents(80, EAST), u, 140, 10);
        const shallow = seaAmplitudes(seaComponents(80, EAST), u, 140, 0.05);
        let m0 = 0;
        for (const a of shallow) m0 += (a * a) / 2;
        expect(4 * Math.sqrt(m0)).toBeLessThanOrEqual(0.8 * 0.05 * 1.2);
        expect(shallow[0]).toBeLessThan(deep[0]);
    });
});

describe("the clock of the waves", () => {
    it("keeps every phase in [0, 1) and exact after days of an open page", () => {
        const [component] = seaComponents(40, EAST);
        const days = 9 * 86_400;
        for (const seconds of [0, 1.25, 3600, days]) {
            const phase = seaPhase(component, seconds);
            expect(phase).toBeGreaterThanOrEqual(0);
            expect(phase).toBeLessThan(1);
            // A twentieth of a second later the wave has gone on by f / 20 of a cycle, to the millionth.
            const later = seaPhase(component, seconds + 0.05);
            const step = (later - phase + 1) % 1;
            expect(step).toBeCloseTo((component.f * 0.05) % 1, 6);
        }
    });
});

describe("breaking", () => {
    it("is at the steepness of the highest wave (H / L = 0.142, Michell 1893): a slope of pi x 0.142", () => {
        expect(BREAKING_SLOPE).toBeCloseTo(0.4461, 4);
    });

    it("a sum of waves reaches that slope somewhere in a strong wind, not in a breeze", () => {
        const count = (kmh: number): number => {
            const u = kmh / 3.6;
            const components = seaComponents(kmh, EAST);
            const amplitudes = seaAmplitudes(components, u, 200, 10);
            const phases = components.map((component) => seaPhase(component, 100));
            let steep = 0;
            for (let y = 0; y < 400; y += 2) {
                for (let x = 0; x < 400; x += 2) {
                    const point = seaSurface(components, amplitudes, phases, x, y);
                    if (Math.hypot(point.sx, point.sy) > BREAKING_SLOPE) steep++;
                }
            }
            return steep / 40_000;
        };
        expect(count(15)).toBeLessThan(count(40));
        expect(count(40)).toBeLessThan(count(82));
        expect(count(82)).toBeGreaterThan(0.005);
    });

    it("the envelope of the slope is never under the slope itself", () => {
        const components = seaComponents(60, EAST);
        const amplitudes = seaAmplitudes(components, 60 / 3.6, 120, 10);
        const phases = components.map((component) => seaPhase(component, 7));
        for (let x = 0; x < 300; x += 7) {
            const point = seaSurface(components, amplitudes, phases, x, x * 0.37, 1.5);
            expect(point.envelope + 1e-12).toBeGreaterThanOrEqual(Math.hypot(point.sx, point.sy));
        }
    });
});

describe("fetchGrid: how far the wind has blown over the water", () => {
    const cell = 0.5;

    it("grows downwind from the shore, cell by cell, and starts again behind an island", () => {
        const width = 40;
        const height = 10;
        const open = new Uint8Array(width * height).fill(1);
        // An island across the lake, columns 20 and 21.
        for (let row = 0; row < height; row++) {
            open[row * width + 20] = 0;
            open[row * width + 21] = 0;
        }
        const fetch = fetchGrid(open, width, height, EAST, cell);
        expect(fetch[5 * width]).toBeCloseTo(0.5, 6);
        expect(fetch[5 * width + 19]).toBeCloseTo(10, 6);
        expect(fetch[5 * width + 20]).toBe(0);
        expect(fetch[5 * width + 22]).toBeCloseTo(0.5, 6);
        expect(fetch[5 * width + 39]).toBeCloseTo(9, 6);
        // From the west the shore is at the east.
        const back = fetchGrid(open, width, height, { x: -1, y: 0 }, cell);
        expect(back[5 * width + 39]).toBeCloseTo(0.5, 6);
        expect(back[5 * width + 22]).toBeCloseTo(9, 6);
    });

    it("follows a slanting wind: the shadow of a rock lies downwind of it, not beside it", () => {
        const width = 60;
        const height = 60;
        const open = new Uint8Array(width * height).fill(1);
        open[20 * width + 20] = 0;
        const heading = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
        const fetch = fetchGrid(open, width, height, heading, cell);
        // Five cells along the wind behind the rock: shorter than the same distance beside it.
        expect(fetch[25 * width + 25]).toBeLessThan(fetch[25 * width + 15]);
        // Far from the rock: about the distance to the shore upwind, along the wind.
        expect(fetch[50 * width + 10]).toBeGreaterThan(8 * cell);
    });

    it("averaged over the directions around the wind, the calm behind an island narrows downwind", () => {
        const width = 120;
        const height = 60;
        const lake = new Uint8Array(width * height).fill(1);
        const island = lake.slice();
        for (let row = 25; row < 35; row++)
            for (let column = 30; column < 36; column++) island[row * width + column] = 0;
        const straight = fetchGrid(island, width, height, EAST, cell);
        const straightLake = fetchGrid(lake, width, height, EAST, cell);
        const effective = effectiveFetchGrid(island, width, height, EAST, cell);
        const effectiveLake = effectiveFetchGrid(lake, width, height, EAST, cell);
        // Right behind the island: calm in both.
        expect(effective[30 * width + 37]).toBeLessThan(0.3 * effectiveLake[30 * width + 37]);
        // Far behind it, the straight fetch stays as short as the island left it; the effective one has grown back
        // much nearer to that of the open lake, waves coming in from the sides.
        const far = 30 * width + 110;
        expect(straight[far] / straightLake[far]).toBeLessThan(0.7);
        expect(effective[far] / effectiveLake[far]).toBeGreaterThan(straight[far] / straightLake[far] + 0.1);
    });

    it("is told to the shader in bytes of 1.1 m, at most 280 m", () => {
        expect(fetchByte(0)).toBe(0);
        expect(fetchByte(Number.NaN)).toBe(0);
        expect(fetchByte(FETCH_MOST_METRES * 3)).toBe(255);
        expect(FETCH_MOST_METRES).toBeGreaterThan(275);
        expect(FETCH_MOST_METRES).toBeLessThan(285);
    });
});
