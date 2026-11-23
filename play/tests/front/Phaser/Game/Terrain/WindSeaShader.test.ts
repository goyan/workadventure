import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { whitecapShare, whitecapWhite } from "@wa/front/Phaser/Game/Terrain/Whitecaps";
import {
    BREAKING_SLOPE,
    effectiveFetchGrid,
    ENVELOPE_COMPONENTS,
    fetchByte,
    FETCH_REFRESH_MS,
    REFERENCE_FETCH_M,
    SEA_COMPONENTS,
    SeaFetch,
} from "@wa/front/Phaser/Game/Terrain/WindSea";
import {
    breakingFactorFor,
    foamDriftPx,
    seaDrawing,
    seaWhite,
    streakDrift,
    WIND_SEA_GLSL,
    windSeaUniforms,
} from "@wa/front/Phaser/Game/Terrain/WindSeaShader";

const EAST = { x: 1, y: 0 };

describe("the white of the wind sea against the law of the whitecaps", () => {
    // The CPU twin of the shader, on a coarser grid than the measure of the table (every 8 px, three instants).
    const white = (kmh: number): number => {
        const sea = seaDrawing(kmh, EAST);
        return sea ? seaWhite(sea, REFERENCE_FETCH_M, 512, 8, 3) : 0;
    };

    it("whitens the share of the law from 25 to 90 km/h (within a fifth, or 0.1 % of the water)", () => {
        for (const kmh of [25, 40, 60, 82, 90]) {
            const wanted = whitecapShare(kmh);
            expect(Math.abs(white(kmh) - wanted), `${kmh} km/h: ${white(kmh)} against ${wanted}`).toBeLessThanOrEqual(
                Math.max(0.001, wanted * 0.2),
            );
        }
    }, 60_000);

    it("never more than 45 % past the law, the water seen through", () => {
        for (const kmh of [110, 150, 200]) {
            const wanted = whitecapWhite(whitecapShare(kmh));
            expect(white(kmh), `${kmh} km/h`).toBeLessThanOrEqual(0.45 * 1.05);
            expect(Math.abs(white(kmh) - wanted), `${kmh} km/h`).toBeLessThanOrEqual(wanted * 0.2);
        }
    }, 60_000);

    it("breaks the crests at the physical slope, give or take 12 %, from 25 to 82 km/h", () => {
        for (let kmh = 25; kmh <= 82; kmh += 1) {
            expect(breakingFactorFor(kmh), `${kmh} km/h`).toBeGreaterThan(0.88);
            expect(breakingFactorFor(kmh), `${kmh} km/h`).toBeLessThan(1.12);
        }
        // Never lower than at 20 km/h in a breeze: no foam where the waves are not steep.
        expect(breakingFactorFor(11)).toBe(breakingFactorFor(20));
        expect(seaDrawing(30, EAST)?.breakingSlope).toBeCloseTo(BREAKING_SLOPE * breakingFactorFor(30), 9);
    });

    it("draws no foam where the law has none, and no sea at all under 10 km/h", () => {
        expect(seaDrawing(9, EAST)).toBeUndefined();
        expect(seaDrawing(10.5, EAST)?.breakingSlope).toBe(Number.POSITIVE_INFINITY);
        expect(white(10.5)).toBe(0);
    });

    it("makes the foam patches larger and the streaks longer as the wind rises", () => {
        // The foam drifts at 3 % of the wind: the streak an aging foam leaves grows with it.
        expect(foamDriftPx(80 / 3.6)).toBeGreaterThan(foamDriftPx(40 / 3.6) * 1.9);
        expect(white(60)).toBeGreaterThan(white(40) * 2);
    }, 60_000);
});

describe("a wind that wavers", () => {
    it("keeps the same waves, so that they go on without a jump; only their height follows it", () => {
        const sea = seaDrawing(40, EAST);
        const wavering = seaDrawing(40.3, { x: Math.cos(0.03), y: Math.sin(0.03) });
        expect(wavering?.components).toEqual(sea?.components);
        expect(wavering?.windMs).toBeCloseTo(40.3 / 3.6, 9);
        // Past its step (5 km/h, 10°), the waves are drawn anew, once.
        expect(seaDrawing(46, EAST)?.components).not.toEqual(sea?.components);
    });
});

describe("the uniforms of the wind sea", () => {
    it("tell the shader no sea under 10 km/h, and every wave over it", () => {
        const none = new Map(windSeaUniforms(undefined, 10));
        expect(none.get("uSea")?.[2]).toBe(0);
        const sea = seaDrawing(40, EAST);
        const uniforms = new Map(windSeaUniforms(sea, 10));
        expect(uniforms.get("uSea")?.[2]).toBe(1);
        expect(uniforms.get("uSea")?.[0]).toBeCloseTo(40 / 3.6, 9);
        for (let at = 0; at < SEA_COMPONENTS; at++) expect(uniforms.has(`uSeaA${at}`)).toBe(true);
        for (let at = 0; at < SEA_COMPONENTS / 2; at++) expect(uniforms.has(`uSeaB${at}`)).toBe(true);
    });

    it("keep the phases and the drift of the streaks small after days of an open page", () => {
        const sea = seaDrawing(60, EAST);
        for (const seconds of [0, 86_399, 40 * 86_400]) {
            const uniforms = new Map(windSeaUniforms(sea, seconds));
            for (let at = 0; at < SEA_COMPONENTS; at++) {
                const phase = uniforms.get(`uSeaA${at}`)?.[2] ?? Number.NaN;
                expect(phase).toBeGreaterThanOrEqual(0);
                expect(phase).toBeLessThan(1);
            }
            const drift = streakDrift(60 / 3.6, seconds);
            expect(drift).toBeGreaterThanOrEqual(0);
            expect(drift).toBeLessThan(4096);
        }
    });
});

describe("the GLSL of the wind sea", () => {
    const splat = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../src/front/Phaser/Game/Terrain/GroundSplat.ts"),
        "utf8",
    );

    it("takes the sine and cosine of 2 pi x fract only: under 2 pi, however far the map and however long the page", () => {
        const trig = WIND_SEA_GLSL.match(/\b(sin|cos)\(([^()]*)\)/g) ?? [];
        const sums = SEA_COMPONENTS + ENVELOPE_COMPONENTS.length;
        expect(trig.length).toBe(2 * sums);
        for (const call of trig) expect(call).toMatch(/^(sin|cos)\(turn\)$/);
        const turns = WIND_SEA_GLSL.match(/turn = [^;]*;/g) ?? [];
        expect(turns).toHaveLength(sums);
        for (const turn of turns) expect(turn).toMatch(/^turn = 6\.2831853 \* fract\(/);
    });

    it("draws its noise with the hash without sine only", () => {
        expect(WIND_SEA_GLSL).not.toMatch(/[^a-zA-Z]hash\(/);
        expect(WIND_SEA_GLSL).not.toMatch(/vnoise|fbm/);
        expect(WIND_SEA_GLSL).toMatch(/hashWide\(/);
    });

    it("replaces the grid of whitecaps drawn by chance, compiled only where the graphics card can", () => {
        expect(splat).not.toMatch(/whitecapsAt|capHash|uniform vec3 uWind/);
        expect(splat).toMatch(/#ifdef WIND_SEA\n\$\{WIND_SEA_GLSL\}\n#endif/);
        expect(splat).toMatch(/seaWhite = seaFoam\(world\)/);
        expect(splat).toMatch(/MAX_FRAGMENT_UNIFORM_VECTORS/);
        // Only on open water outdoors, at least 8 px deep, as the whitecaps were.
        expect(splat).toMatch(/if \(uSea\.z > 0\.5 && open > 0\.5\)/);
    });
});

describe("SeaFetch: the fetch of the map, made again when it should", () => {
    const water = (depth: number, width = 20) => ({
        x: 2,
        y: 3,
        width,
        height: 4,
        depths: new Float32Array(width * 4).fill(depth),
    });
    const finish = (fetch: SeaFetch): number => {
        let images = 0;
        while (!fetch.advance()) images++;
        return images + 1;
    };

    it("is made a ray at each image, never all at once", () => {
        const fetch = new SeaFetch();
        expect(fetch.update(water(10), 1, EAST, 0)).toBe(true);
        expect(fetch.version).toBe(0);
        expect(finish(fetch)).toBe(5);
        expect(fetch.version).toBe(1);
        expect(fetch.advance()).toBe(false);
    });

    it("again when the wind turns over 5°, or when the shores moved; not when only the water moved", () => {
        const fetch = new SeaFetch();
        fetch.update(water(10), 1, EAST, 0);
        finish(fetch);
        expect(fetch.update(water(10), 1, EAST, 100)).toBe(false);
        const slightly = { x: Math.cos(0.05), y: Math.sin(0.05) };
        expect(fetch.update(water(10), 1, slightly, 200)).toBe(false);
        const turned = { x: Math.cos(0.2), y: Math.sin(0.2) };
        expect(fetch.update(water(10), 1, turned, 300)).toBe(true);
        finish(fetch);
        // The water rose a little: the same open water, the same shores, no fetch to make again.
        expect(fetch.update(water(12), 2, turned, 300 + FETCH_REFRESH_MS)).toBe(false);
        // Half of it dried: the shores moved, but only every few seconds.
        const dried = water(10);
        dried.depths.fill(1, 0, 40);
        expect(fetch.update(dried, 3, turned, 400 + FETCH_REFRESH_MS)).toBe(false);
        expect(fetch.update(dried, 3, turned, 300 + 2 * FETCH_REFRESH_MS)).toBe(true);
    });

    it("does not move its shores for water that wavers about the edge of open water", () => {
        const fetch = new SeaFetch();
        fetch.update(water(10), 1, EAST, 0);
        finish(fetch);
        // A wave or a source makes the water of the edge go from 5 to 3 px and back: the shores stay.
        let version = 2;
        for (const depth of [3, 5, 3, 2.5, 5]) {
            expect(fetch.update(water(depth), version++, EAST, version * FETCH_REFRESH_MS)).toBe(false);
        }
        // Dry under 2 px: the shores moved.
        expect(fetch.update(water(1), version++, EAST, version * FETCH_REFRESH_MS)).toBe(true);
    });

    it("once made anew, is told to the shader alone: the ground is not drawn again", () => {
        const view = readFileSync(
            resolve(
                dirname(fileURLToPath(import.meta.url)),
                "../../../../../src/front/Phaser/Game/Terrain/TerrainView.ts",
            ),
            "utf8",
        );
        expect(view).not.toMatch(/advance\(\)\)\s*this\.lastKey/);
        expect(view).toMatch(/this\.seaFetch\.advance\(\) && this\.drawnCanvas\) this\.splat\.setFetch\(/);
    });

    it("reads the fetch of the cells of the map, nothing off the water nor on water too thin to open", () => {
        const fetch = new SeaFetch();
        fetch.update(water(10), 1, EAST, 0);
        finish(fetch);
        const out = fetch.over(0, 3, 30, 1, new Uint8Array(30));
        expect(out[0]).toBe(0);
        expect(out[1]).toBe(0);
        // The cells of the grid where they are on the map: its last cell, 2 + 20 - 1, holds its fetch.
        const lake = new Uint8Array(80).fill(1);
        expect(out[21]).toBe(fetchByte(effectiveFetchGrid(lake, 20, 4, EAST)[19]));
        expect(out[21]).toBeGreaterThan(0);
        expect(out[25]).toBe(0);
        const shallow = new SeaFetch();
        shallow.update(water(3), 1, EAST, 0);
        finish(shallow);
        expect(shallow.over(2, 3, 20, 1, new Uint8Array(20)).every((byte) => byte === 0)).toBe(true);
    });
});
