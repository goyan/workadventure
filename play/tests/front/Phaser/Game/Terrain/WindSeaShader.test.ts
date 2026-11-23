import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    BREAKING_SLOPE,
    effectiveFetchGrid,
    fetchByte,
    FETCH_REFRESH_MS,
    FOAM_DECAY_S,
    REFERENCE_FETCH_M,
    SEA_COMPONENTS,
    SeaFetch,
    seaAmplitudes,
    seaPhase,
    seaSurface,
} from "@wa/front/Phaser/Game/Terrain/WindSea";
import {
    breakingAt,
    breakingFactorFor,
    crestAt,
    foamDriftPx,
    groupAt,
    groupDrift,
    leftFoamFor,
    lineDrift,
    seaDrawing,
    WIND_SEA_FOAM_GLSL,
    WIND_SEA_GLSL,
    WIND_SEA_WATER_GLSL,
    windSeaUniforms,
} from "@wa/front/Phaser/Game/Terrain/WindSeaShader";
import {
    COARSE_FOAM_HZ,
    FOAM_HZ,
    FOAM_STEPS_PX,
    FOAM_TEXELS,
    foamArea,
    foamIsDue,
    foamStepSeconds,
} from "@wa/front/Phaser/Game/Terrain/WindSeaFoam";

const EAST = { x: 1, y: 0 };

describe("where a crest of the wind sea breaks", () => {
    const sea = seaDrawing(82, EAST);
    if (!sea) throw new Error("A wind of 82 km/h raises a sea");
    const amplitudes = seaAmplitudes(sea.components, sea.windMs, REFERENCE_FETCH_M, 10);
    const phases = sea.components.map((component) => seaPhase(component, 40));
    const groups = groupDrift(sea, 40);

    it("only on the upper front of a wave steeper than the breaking slope, give or take 10 %, along part of the crest", () => {
        let broke = 0;
        for (let y = 0; y < 400; y += 3) {
            for (let x = 0; x < 400; x += 3) {
                const at = breakingAt(sea, amplitudes, phases, groups, x, y);
                const point = seaSurface(sea.components, amplitudes, phases, x, y);
                const slope = groupAt(sea, groups, x, y) * Math.hypot(point.sx, point.sy);
                const front = point.sx * sea.heading.x + point.sy * sea.heading.y <= 0;
                if (slope < sea.breakingSlope * 0.9 || point.eta < 0 || !front) expect(at).toBe(0);
                if (slope > sea.breakingSlope * 1.1 && point.eta >= 0 && front) {
                    expect(at).toBeCloseTo(crestAt(sea, x, y), 12);
                }
                if (at > 0) broke++;
            }
        }
        // Some crests break at 82 km/h; most of the water does not.
        expect(broke).toBeGreaterThan(0);
        expect(broke / (134 * 134)).toBeLessThan(0.3);
    });

    it("at the physical slope of Michell, within 15 % from 20 to 60 km/h, by the measure of the white on the GPU", () => {
        for (let kmh = 20; kmh <= 60; kmh += 1) {
            expect(breakingFactorFor(kmh), `${kmh} km/h`).toBeGreaterThan(0.85);
            expect(breakingFactorFor(kmh), `${kmh} km/h`).toBeLessThan(1.15);
        }
        // Over, lower: the wind tears foam off crests not yet steep enough; never under a fifth of Michell.
        for (let kmh = 60; kmh <= 200; kmh += 1) {
            expect(breakingFactorFor(kmh), `${kmh} km/h`).toBeGreaterThan(0.2);
            expect(breakingFactorFor(kmh), `${kmh} km/h`).toBeLessThanOrEqual(breakingFactorFor(60));
        }
        // Never lower than at 20 km/h in a breeze: no foam where the waves are not steep.
        expect(breakingFactorFor(11)).toBe(breakingFactorFor(20));
        expect(seaDrawing(30, EAST)?.breakingSlope).toBeCloseTo(BREAKING_SLOPE * breakingFactorFor(30), 9);
    });

    it("nowhere where the law has no foam, and no sea at all under 10 km/h", () => {
        expect(seaDrawing(9, EAST)).toBeUndefined();
        const calm = seaDrawing(10.5, EAST);
        expect(calm?.breakingSlope).toBe(Number.POSITIVE_INFINITY);
        if (calm) expect(breakingAt(calm, amplitudes, phases, 0, 10, 10)).toBe(0);
    });

    it("breaks a crest along part of its length, more of it as the wind rises", () => {
        const share = (kmh: number): number => {
            const each = seaDrawing(kmh, EAST);
            if (!each) return 0;
            let sum = 0;
            for (let y = 0; y < 2000; y += 3) sum += crestAt(each, 100, y);
            return sum / Math.ceil(2000 / 3);
        };
        let lowest = 1;
        let highest = 0;
        for (let y = 0; y < 2000; y += 3) {
            lowest = Math.min(lowest, crestAt(sea, 100, y));
            highest = Math.max(highest, crestAt(sea, 100, y));
        }
        expect(lowest).toBe(0);
        expect(highest).toBe(1);
        expect(share(40)).toBeLessThan(share(82));
        expect(share(82)).toBeLessThan(share(110));
    });

    it("draws the waves higher or lower by their groups, the sea of the law on the whole", () => {
        let sum = 0;
        let lowest = Infinity;
        let highest = 0;
        const count = 200 * 50;
        for (let at = 0; at < count; at++) {
            const value = groupAt(sea, groups, (at % 200) * 37, Math.floor(at / 200) * 53);
            sum += value * value;
            lowest = Math.min(lowest, value);
            highest = Math.max(highest, value);
        }
        expect(Math.sqrt(sum / count)).toBeGreaterThan(0.9);
        expect(Math.sqrt(sum / count)).toBeLessThan(1.15);
        // Calmer and wilder groups, never a sea flat nor twice its height.
        expect(lowest).toBeGreaterThanOrEqual(0.3);
        expect(highest).toBeLessThanOrEqual(1.7);
    });
});

describe("the foam the crests leave", () => {
    it("drifts with the wind, faster as it rises, more opaque and laid more densely past force 7", () => {
        // The foam drifts at 3 % of the wind: the trail a breaking crest leaves behind it grows with it.
        expect(foamDriftPx(80 / 3.6)).toBeGreaterThan(foamDriftPx(40 / 3.6) * 1.9);
        expect(leftFoamFor(30).opacity).toBeLessThan(leftFoamFor(60).opacity);
        expect(leftFoamFor(60).opacity).toBeLessThan(leftFoamFor(100).opacity);
        expect(leftFoamFor(100).opacity).toBeLessThan(1);
        expect(leftFoamFor(40).cutShift).toBe(0);
        expect(leftFoamFor(100).cutShift).toBeGreaterThan(leftFoamFor(60).cutShift);
        // Thicker in a gale, it lasts longer; as long as Callaghan's in a breeze.
        expect(leftFoamFor(40).life).toBe(1);
        expect(leftFoamFor(100).life).toBeGreaterThan(leftFoamFor(60).life);
    });

    it("differs from a trail to the next: width, whiteness and life drawn from a slow noise drifting with it", () => {
        expect(WIND_SEA_FOAM_GLSL).toMatch(/float width = mix\(/);
        expect(WIND_SEA_FOAM_GLSL).toMatch(/float white = mix\(/);
        expect(WIND_SEA_FOAM_GLSL).toMatch(/float life = mix\(/);
        // In the frame of the foam: the noise of a trail goes down the wind with it.
        expect(WIND_SEA_FOAM_GLSL).toMatch(/float down = dot\(world, heading\) - uSeaDir\.w \*/);
    });

    it("is kept moved upwind by the drift, faded in FOAM_DECAY_S, and laid only where a crest breaks", () => {
        expect(WIND_SEA_FOAM_GLSL).toMatch(/world - uSeaDir\.xy \* uSeaDir\.z \* dt/);
        expect(WIND_SEA_FOAM_GLSL).toContain(`exp(-dt / (${FOAM_DECAY_S.toPrecision(8)} * uFoamLife * life))`);
        expect(WIND_SEA_FOAM_GLSL).toMatch(/float breaking = seaBreaking\(world\);\n\s*if \(breaking > 0\.0\)/);
        expect(WIND_SEA_FOAM_GLSL).toMatch(/max\(kept, laid\)/);
        // Rounded at random to the bytes of its picture: a fading foam never sticks at its last step.
        expect(WIND_SEA_FOAM_GLSL).toMatch(/kept \+= \(hashWide\(/);
        // Starts from nothing when told to, and reads nothing off the picture before.
        expect(WIND_SEA_FOAM_GLSL).toMatch(/uFoamStep\.w < 0\.5 && uv\.x > 0\.0/);
    });

    it("is read by the water, over the crest breaking at the pixel", () => {
        expect(WIND_SEA_WATER_GLSL).toMatch(/texture2D\(uSeaFoam, uv\)/);
        expect(WIND_SEA_WATER_GLSL).toMatch(/max\(breaking, left \* uSea\.w\)/);
    });
});

describe("the picture of the foam around the camera", () => {
    const view = { x: 1000.3, y: 4000.7, width: 1097, height: 617 };

    it("holds the view and a margin, at the finest step that can, on whole texels of that step", () => {
        const area = foamArea(view, false);
        expect(area.step).toBe(2);
        expect(area.x).toBeLessThanOrEqual(view.x - 64);
        expect(area.y).toBeLessThanOrEqual(view.y - 64);
        expect(area.x + area.width).toBeGreaterThanOrEqual(view.x + view.width + 64);
        expect(area.y + area.height).toBeGreaterThanOrEqual(view.y + view.height + 64);
        expect(area.x % area.step).toBe(0);
        expect(area.y % area.step).toBe(0);
        expect(area.width).toBe(area.step * FOAM_TEXELS.across);
        // Zoomed out: coarser, never more texels.
        const wide = foamArea({ x: 0, y: 0, width: 4000, height: 2500 }, false);
        expect(wide.step).toBeGreaterThan(4);
        expect(wide.width).toBeGreaterThanOrEqual(4000 + 128);
        expect(FOAM_STEPS_PX).toContain(wide.step);
    });

    it("is coarser and made less often on a modest graphics card (Medium)", () => {
        expect(foamArea(view, true).step).toBeGreaterThanOrEqual(4);
        expect(foamIsDue(1000 + 1000 / FOAM_HZ, 1000, false)).toBe(true);
        expect(foamIsDue(1000 + 1000 / FOAM_HZ, 1000, true)).toBe(false);
        expect(foamIsDue(1000 + 1000 / COARSE_FOAM_HZ, 1000, true)).toBe(true);
        expect(foamIsDue(5, undefined, true)).toBe(true);
    });

    it("moves and fades the foam over the real time between two pictures, a stall counting as a second", () => {
        expect(foamStepSeconds(1000, undefined)).toBe(0);
        expect(foamStepSeconds(1100, 1000)).toBeCloseTo(0.1, 9);
        expect(foamStepSeconds(60_000, 1000)).toBe(1);
    });
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
        expect(uniforms.get("uSea")?.[3]).toBeCloseTo(leftFoamFor(40).opacity, 9);
        for (let at = 0; at < SEA_COMPONENTS; at++) expect(uniforms.has(`uSeaA${at}`)).toBe(true);
        for (let at = 0; at < SEA_COMPONENTS / 2; at++) expect(uniforms.has(`uSeaB${at}`)).toBe(true);
    });

    it("keep the phases and the drifts small after days of an open page", () => {
        const sea = seaDrawing(60, EAST);
        if (!sea) throw new Error("A wind of 60 km/h raises a sea");
        for (const seconds of [0, 86_399, 40 * 86_400]) {
            const uniforms = new Map(windSeaUniforms(sea, seconds));
            for (let at = 0; at < SEA_COMPONENTS; at++) {
                const phase = uniforms.get(`uSeaA${at}`)?.[2] ?? Number.NaN;
                expect(phase).toBeGreaterThanOrEqual(0);
                expect(phase).toBeLessThan(1);
            }
            for (const drift of [lineDrift(60 / 3.6, seconds), groupDrift(sea, seconds)]) {
                expect(drift).toBeGreaterThanOrEqual(0);
                expect(drift).toBeLessThan(4096);
            }
        }
    });
});

describe("the GLSL of the wind sea", () => {
    const splat = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../src/front/Phaser/Game/Terrain/GroundSplat.ts"),
        "utf8",
    );
    const all = `${WIND_SEA_GLSL}${WIND_SEA_WATER_GLSL}${WIND_SEA_FOAM_GLSL}`;

    it("takes the sine and cosine of 2 pi x fract only: under 2 pi, however far the map and however long the page", () => {
        const trig = all.match(/\b(sin|cos)\(([^()]*)\)/g) ?? [];
        expect(trig.length).toBe(2 * SEA_COMPONENTS);
        for (const call of trig) expect(call).toMatch(/^(sin|cos)\(turn\)$/);
        const turns = all.match(/turn = [^;]*;/g) ?? [];
        expect(turns).toHaveLength(SEA_COMPONENTS);
        for (const turn of turns) expect(turn).toMatch(/^turn = 6\.2831853 \* fract\(/);
    });

    it("draws its noise with the hash without sine only", () => {
        expect(all).not.toMatch(/[^a-zA-Z]hash\(/);
        expect(all).not.toMatch(/vnoise|fbm/);
        expect(all).toMatch(/hashWide\(/);
    });

    it("replaces the grid of whitecaps drawn by chance, compiled only where the graphics card can", () => {
        expect(splat).not.toMatch(/whitecapsAt|capHash|uniform vec3 uWind/);
        expect(splat).toMatch(/#ifdef WIND_SEA\n\$\{WIND_SEA_GLSL\}\n\$\{WIND_SEA_WATER_GLSL\}\n#endif/);
        expect(splat).toMatch(/seaWhite = seaFoam\(world\)/);
        expect(splat).toMatch(/MAX_FRAGMENT_UNIFORM_VECTORS/);
        // Only on open water outdoors, at least 8 px deep, as the whitecaps were; the foam pass reads the same.
        expect(splat).toMatch(/if \(uSea\.z > 0\.5 && open > 0\.5\)/);
        expect(splat).toMatch(/return outdoors \* step\(\$\{WHITECAP_MIN_DEPTH_PX\}\.0, depthPx\) \* depthPx;/);
        expect(splat).toMatch(/if \(canSea\) \{\n\s*this\.seaFoam = new WindSeaFoam\(/);
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
