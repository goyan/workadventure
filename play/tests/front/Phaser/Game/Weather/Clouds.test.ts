import { describe, expect, it } from "vitest";
import {
    CLOUD_DRIFT_PER_SECOND,
    CLOUD_PUFFS,
    cloudAlpha,
    cloudLightStep,
    cloudPalette,
    cloudPatches,
    cloudTones,
    cloudZoomFade,
    rainPalette,
    shownCloudiness,
    shownRainCover,
    cloudShadowOffset,
    cloudBlockSize,
    cloudDrift,
    cloudSunlight,
    cloudTint,
    NIGHT_CLOUD_COLOR,
    overcastVeil,
    shadowPatches,
    SkyDrift,
} from "../../../../../src/front/Phaser/Game/Weather/Clouds";
import { FOG_LEVELS, fieldLevels, fogBlocks } from "../../../../../src/front/Phaser/Game/Weather/WeatherFrame";
import { sunForClouds } from "../../../../../src/front/Phaser/Game/Night/NightClock";

const TILE = 32;
const view = { x: 0, y: 0, width: 800, height: 600 };

describe("cloudZoomFade and the height of the clouds", () => {
    it("passes under low clouds from 1.4 screen pixels a map pixel, under higher ones only closer, never at the top", () => {
        expect(cloudZoomFade(0.8)).toBe(1);
        expect(cloudZoomFade(1.4)).toBe(0);
        // Twice as high: whole up to 1.6, gone from 2.8.
        expect(cloudZoomFade(1.4, 0.5)).toBe(1);
        expect(cloudZoomFade(2.8, 0.5)).toBe(0);
        expect(cloudZoomFade(10, 1)).toBe(1);
    });
});

describe("cloudShadowOffset (north up, y down)", () => {
    it("casts the shadow away from the sun, three tiles of height, six tiles at most", () => {
        // Paris, 2026-11-14 at solar noon: the sun is south, 22.9° high; 3 / tan(22.9°) = 7.1 tiles, kept to 6.
        const noon = cloudShadowOffset({ elevation: 22.9, azimuth: 180 });
        expect(noon?.x).toBeCloseTo(0, 6);
        expect(noon?.y).toBeCloseTo(-6 * TILE, 6);
        // A high sun in the north (southern hemisphere): a short shadow southwards, 3 / tan(64°) tiles.
        const sydney = cloudShadowOffset({ elevation: 64, azimuth: 0 });
        expect(sydney?.x).toBeCloseTo(0, 6);
        expect(sydney?.y).toBeCloseTo((3 / Math.tan((64 * Math.PI) / 180)) * TILE, 6);
        // Morning sun in the east: the shadow goes west.
        const morning = cloudShadowOffset({ elevation: 45, azimuth: 90 });
        expect(morning?.x).toBeCloseTo(-3 * TILE, 6);
        expect(morning?.y).toBeCloseTo(0, 6);
    });

    it("casts no shadow with the sun under 2°", () => {
        expect(cloudShadowOffset({ elevation: 1.9, azimuth: 240 })).toBeUndefined();
        expect(cloudShadowOffset(undefined)).toBeUndefined();
    });
});

describe("cloudSunlight", () => {
    it("darkens the clouds from 2° to the end of dusk (-6°), and fades their shadows from 6° to 2°", () => {
        expect(cloudSunlight(30)).toEqual({ night: 0, shadows: 1 });
        expect(cloudSunlight(4).shadows).toBeCloseTo(0.5, 6);
        expect(cloudSunlight(2)).toEqual({ night: 0, shadows: 0 });
        expect(cloudSunlight(-2).night).toBeCloseTo(0.5, 6);
        expect(cloudSunlight(-10)).toEqual({ night: 1, shadows: 0 });
        // Without a sun (no clock yet, or the night turned off at night): daylight clouds, no shadow.
        expect(cloudSunlight(undefined)).toEqual({ night: 0, shadows: 0 });
    });
});

describe("cloudTint", () => {
    it("keeps a cloud as it is by day and turns it dark grey-blue and lighter at night", () => {
        expect(cloudTint(0xffffff, 0.45, 0)).toEqual({ color: 0xffffff, alpha: 0.45 });
        expect(cloudTint(0xffffff, 0.45, 1)).toEqual({ color: NIGHT_CLOUD_COLOR, alpha: 0.45 * 0.7 });
        const dusk = cloudTint(0xffffff, 0.45, 0.5);
        expect(dusk.color).not.toBe(0xffffff);
        expect(dusk.color).not.toBe(NIGHT_CLOUD_COLOR);
    });
});

describe("cloudPatches", () => {
    it("shows more clouds for a cloudier sky, one after the other", () => {
        const weight = (cloudiness: number) =>
            // Over a view bigger than the repeated square of the sky, every cloud is there.
            cloudPatches(0, { x: 0, y: 0, width: 2100, height: 2100 }, cloudiness, false).reduce(
                (sum, patch) => sum + (patch.weight ?? 1),
                0,
            );
        expect(weight(0)).toBe(0);
        expect(weight(0.2)).toBeLessThan(weight(0.5));
        expect(weight(0.5)).toBeLessThan(weight(0.9));
    });

    it("grows the clouds with the cloudiness, so a cloudy sky is a mass of clouds and not a field of dots", () => {
        const biggest = (cloudiness: number) =>
            Math.max(
                ...cloudPatches(0, { x: 0, y: 0, width: 2100, height: 2100 }, cloudiness, false).map((p) => p.radius),
            );
        expect(biggest(0.9)).toBeGreaterThan(1.4 * biggest(0.2));
    });

    it("mixes small and big clouds", () => {
        // The main puff of each cloud comes first, before the puffs around it.
        const sky = { x: 0, y: 0, width: 2100, height: 2100 };
        const mains = cloudPatches(0, sky, 1, true)
            .filter((_, index) => index % CLOUD_PUFFS === 0)
            .map((patch) => patch.radius);
        expect(Math.max(...mains)).toBeGreaterThan(2.5 * Math.min(...mains));
    });

    it("puts the share of the map given by the cloud cover under clouds: 90 % of cover, about 90 % of the map", () => {
        // Nine squares of the sky, wide enough for the average of the map. A block counts as cloud from a quarter of
        // the thickest, the faint edge left out; averaged over a few moments of the drift.
        const sky = { x: 0, y: 0, width: 6300, height: 6300 };
        const covered = (cloudiness: number) =>
            [0, 7_000, 19_000, 33_000].reduce((sum, epoch) => {
                const blocks = fogBlocks([sky], cloudPatches(epoch, sky, cloudiness, false), 32);
                const area = blocks
                    .filter((block) => block.level >= FOG_LEVELS / 4)
                    .reduce((total, block) => total + block.width * block.height, 0);
                return sum + area / (sky.width * sky.height) / 4;
            }, 0);
        for (const cloudiness of [0.35, 0.5, 0.7, 0.9]) expect(covered(cloudiness)).toBeCloseTo(cloudiness, 1);
        expect(covered(1)).toBeGreaterThan(0.97);
    });

    it("never repeats the same sky side by side: each copy of a cloud is moved and sized its own way", () => {
        // The same view 32 periods of the sky further (on the same grid of blocks): most of its clouds must not be those
        // here moved over.
        const levels = (x: number) => {
            const view = { x, y: 0, width: 2100, height: 2100 };
            const grid = new Map<string, number>();
            for (const block of fogBlocks([view], cloudPatches(0, view, 0.6, true), 64)) {
                for (let left = block.x; left < block.x + block.width; left += 64) {
                    grid.set(`${Math.round(left - x)},${Math.round(block.y)}`, block.level);
                }
            }
            return grid;
        };
        const here = levels(0);
        const there = levels(32 * 2100);
        let differing = 0;
        for (let x = 0; x < 2100; x += 64) {
            for (let y = 0; y < 2100; y += 64) {
                if ((here.get(`${x},${y}`) ?? 0) !== (there.get(`${x},${y}`) ?? 0)) differing++;
            }
        }
        expect(differing / (33 * 33)).toBeGreaterThan(0.3);
    });

    it("are fixed to the map: zooming or moving the camera never moves nor resizes them", () => {
        const near = (patches: ReturnType<typeof cloudPatches>) =>
            patches
                .filter((patch) => patch.x > 300 && patch.x < 500 && patch.y > 200 && patch.y < 400)
                .map((patch) => [Math.round(patch.x * 1000), Math.round(patch.y * 1000), patch.radius, patch.weight])
                .sort();
        const zoomedOut = { x: -2000, y: -1500, width: 4800, height: 3600 };
        const zoomedIn = { x: 350, y: 250, width: 100, height: 100 };
        expect(near(cloudPatches(42_000, zoomedIn, 0.9, false))).toEqual(
            near(cloudPatches(42_000, zoomedOut, 0.9, false)),
        );
        expect(near(cloudPatches(42_000, view, 0.9, false))).toEqual(near(cloudPatches(42_000, zoomedOut, 0.9, false)));
    });

    it("cover a big view as a small one: clouds all over the map", () => {
        const big = { x: 0, y: 0, width: 4800, height: 3600 };
        expect(cloudPatches(0, big, 0.9, false).length).toBeGreaterThan(cloudPatches(0, view, 0.9, false).length);
    });

    it("drift with the wind, and stand still when motion is reduced", () => {
        const before = cloudPatches(10_000, view, 0.5, false);
        const after = cloudPatches(11_000, view, 0.5, false);
        // Most patches are found again moved by the drift, the same size; a few left or entered the margin.
        const drifted = before.filter((patch) =>
            after.some(
                (later) =>
                    later.radius === patch.radius &&
                    Math.abs(Math.hypot(later.x - patch.x, later.y - patch.y) - CLOUD_DRIFT_PER_SECOND) < 0.01,
            ),
        );
        expect(drifted.length).toBeGreaterThan(before.length / 2);
        expect(cloudPatches(10_000, view, 0.5, true)).toEqual(cloudPatches(99_000, view, 0.5, true));
    });

    it("casts shadows that are the same clouds, moved by the offset", () => {
        const offset = { x: -100, y: 60 };
        const shadows = shadowPatches(5_000, view, 0.5, false, offset);
        const shifted = cloudPatches(5_000, { ...view, x: view.x - offset.x, y: view.y - offset.y }, 0.5, false);
        expect(shadows).toEqual(shifted.map((patch) => ({ ...patch, x: patch.x + offset.x, y: patch.y + offset.y })));
    });

    it("cuts the blocks on a grid fixed to the map: moving the view never shifts them", () => {
        const patches = [{ x: 400, y: 300, radius: 200 }];
        const inside = (blocks: ReturnType<typeof fogBlocks>) =>
            blocks
                .filter((b) => b.x >= 320 && b.x + b.width <= 480 && b.y >= 240 && b.y + b.height <= 360)
                .map((b) => `${b.x},${b.y},${b.width},${b.height},${b.level}`)
                .sort();
        const a = fogBlocks([{ x: 0, y: 0, width: 800, height: 600 }], patches, 16);
        const b = fogBlocks([{ x: 7, y: 3, width: 800, height: 600 }], patches, 16);
        expect(inside(b)).toEqual(inside(a));
    });

    it("changes the size of the blocks only at a few steps of zoom", () => {
        expect(cloudBlockSize(1)).toBe(cloudBlockSize(1.1));
        expect(cloudBlockSize(0.9)).toBe(cloudBlockSize(1));
        expect(cloudBlockSize(0.25)).toBeGreaterThan(cloudBlockSize(1));
        expect(cloudBlockSize(4)).toBeLessThan(cloudBlockSize(1));
    });

    it("weighs a fading cloud less in the blocks", () => {
        const run = [{ x: 0, y: 0, width: 64, height: 64 }];
        const full = fogBlocks(run, [{ x: 32, y: 32, radius: 64, weight: 1 }], 16);
        const half = fogBlocks(run, [{ x: 32, y: 32, radius: 64, weight: 0.5 }], 16);
        const levels = (blocks: typeof full) => blocks.reduce((sum, block) => sum + block.level * block.width, 0);
        expect(levels(half)).toBeLessThan(levels(full));
        expect(levels(half)).toBeGreaterThan(0);
    });
});

describe("overcastVeil", () => {
    it("greys an overcast sky only, rising from 0.6 to 0.9 of cloudiness", () => {
        expect(overcastVeil(0.5)).toBe(0);
        expect(overcastVeil(0.75)).toBeCloseTo(0.04, 6);
        expect(overcastVeil(0.9)).toBeCloseTo(0.08, 6);
        expect(overcastVeil(1)).toBeCloseTo(0.08, 6);
    });

    it("fades out at dusk with the clouds: no grey veil over the night", () => {
        expect(overcastVeil(0.9, 0)).toBe(0);
        expect(overcastVeil(0.9, 0.5)).toBeCloseTo(0.04, 6);
    });
});

describe("sunForClouds", () => {
    it("gives the sun as it is while the night is drawn", () => {
        expect(sunForClouds({ elevation: -10, azimuth: 270 }, false)).toEqual({ elevation: -10, azimuth: 270 });
    });

    it("keeps the clouds, without shadows, through a night that is turned off (the map stays in daylight)", () => {
        expect(sunForClouds({ elevation: -10, azimuth: 270 }, true)).toBeUndefined();
        expect(sunForClouds({ elevation: 1, azimuth: 250 }, true)).toBeUndefined();
        expect(sunForClouds({ elevation: 30, azimuth: 180 }, true)).toEqual({ elevation: 30, azimuth: 180 });
    });
});

describe("cloudDrift (north up, y down)", () => {
    it("pushes the clouds away from where the wind comes from, at the usual speed", () => {
        const round = (v: { x: number; y: number }) => ({ x: Math.round(v.x) + 0, y: Math.round(v.y) + 0 });
        // A west wind (270°) blows the clouds east; a north wind (0°) south; an east wind (90°) west.
        expect(round(cloudDrift(270))).toEqual({ x: CLOUD_DRIFT_PER_SECOND, y: 0 });
        expect(round(cloudDrift(0))).toEqual({ x: 0, y: CLOUD_DRIFT_PER_SECOND });
        expect(round(cloudDrift(90))).toEqual({ x: -CLOUD_DRIFT_PER_SECOND, y: 0 });
    });

    it("keeps the usual direction without a wind (Automatic, or no wind given)", () => {
        expect(cloudDrift(undefined)).toEqual({ x: 48, y: 36 });
    });
});

describe("SkyDrift", () => {
    it("places the sky by the server time while the wind holds, the same for everyone", () => {
        const drift = { x: 60, y: 0 };
        const late = new SkyDrift();
        const early = new SkyDrift();
        early.at(1_000, drift);
        expect(early.at(50_000, drift)).toEqual(late.at(50_000, drift));
        expect(late.at(50_000, drift)).toEqual({ x: 3_000, y: 0 });
    });

    it("never jumps when the wind turns: the sky goes on from where it was", () => {
        const sky = new SkyDrift();
        const before = sky.at(10_000, { x: 60, y: 0 });
        expect(sky.at(10_000, { x: 0, y: 60 })).toEqual(before);
        expect(sky.at(11_000, { x: 0, y: 60 })).toEqual({ x: before.x, y: before.y + 60 });
    });
});

describe("cumulus clouds", () => {
    const sky = { x: 0, y: 0, width: 2100, height: 2100 };
    const brightness = (color: number) => ((color >> 16) & 0xff) + ((color >> 8) & 0xff) + (color & 0xff);

    it("makes each cloud of a main puff and puffs around it, wider than tall", () => {
        // One cloud only, standing still.
        const puffs = cloudPatches(0, sky, 1 / 12, true);
        expect(CLOUD_PUFFS).toBeGreaterThanOrEqual(6);
        expect(puffs.length % CLOUD_PUFFS).toBe(0);
        const cloud = puffs.slice(0, CLOUD_PUFFS);
        const main = cloud[0];
        const across = Math.max(...cloud.map((puff) => Math.abs(puff.x - main.x)));
        const down = Math.max(...cloud.map((puff) => Math.abs(puff.y - main.y)));
        expect(across).toBeGreaterThan(1.4 * down);
        expect(Math.max(...cloud.slice(1).map((puff) => puff.radius))).toBeLessThan(main.radius);
    });

    it("keeps the ground in sight: the clouds of a very cloudy sky cover a little over half the map", () => {
        expect(shownCloudiness(0)).toBe(0);
        expect(shownCloudiness(0.2)).toBe(0.2);
        expect(shownCloudiness(0.35)).toBeCloseTo(0.35);
        expect(shownCloudiness(0.9)).toBeGreaterThan(shownCloudiness(0.6));
        expect(shownCloudiness(1)).toBeLessThanOrEqual(0.55);
    });

    it("greys the clouds of a very cloudy sky, lit side light, far side dark", () => {
        const clear = cloudPalette(0.3);
        expect(clear.lit).toBe(0xffffff);
        expect(brightness(clear.lit)).toBeGreaterThan(brightness(clear.mid));
        expect(brightness(clear.mid)).toBeGreaterThan(brightness(clear.shade));
        const grey = cloudPalette(1);
        expect(brightness(grey.lit)).toBeLessThan(brightness(clear.lit));
        expect(brightness(grey.shade)).toBeLessThan(brightness(clear.shade));
    });

    it("gives a cloud a sharp edge: a faint rim, then the body", () => {
        expect(cloudAlpha(0, 0.8)).toBe(0);
        expect(cloudAlpha(1, 0.8)).toBeGreaterThan(0);
        expect(cloudAlpha(1, 0.8)).toBeLessThan(cloudAlpha(2, 0.8));
        expect(cloudAlpha(2, 0.8)).toBeLessThan(0.8);
        expect(cloudAlpha(4, 0.8)).toBe(0.8);
        expect(cloudAlpha(8, 0.8)).toBe(0.8);
    });

    it("never flickers at the edge: between two images of a drifting sky, no cell jumps by more than a quarter", () => {
        const size = 16;
        const area = { x: 0, y: 0, columns: 120, rows: 120 };
        const view = { x: 0, y: 0, width: 1920, height: 1920 };
        const sky = (seconds: number) => ({ x: seconds * 48, y: seconds * 36 });
        let biggest = 0;
        for (let frame = 0; frame < 6; frame++) {
            const before = fieldLevels(area, size, cloudPatches(0, view, 0.5, false, sky(frame / 15)));
            const after = fieldLevels(area, size, cloudPatches(0, view, 0.5, false, sky((frame + 1) / 15)));
            for (let cell = 0; cell < before.length; cell++) {
                biggest = Math.max(biggest, Math.abs(cloudAlpha(before[cell], 1) - cloudAlpha(after[cell], 1)));
            }
        }
        expect(biggest).toBeLessThanOrEqual(0.25);
    });

    it("keeps the middle tone where the neighbour towards the light is thinner by one level only (no checkerboard)", () => {
        // An edge across the light: thicknesses differ by a rounding, not by the shape of the cloud.
        // (Both ends lie against the clear sky: real edges, lit and shaded.)
        const levels = Uint8Array.from([3, 4, 3, 4, 3, 4, 3, 4, 3]);
        const tones = cloudTones(levels, 9, 1, { columns: -1, rows: 0 });
        expect(Array.from(tones.mid.slice(1, 8))).toEqual(Array.from(levels.slice(1, 8)));
        expect(tones.lit.slice(1, 8).some(Boolean)).toBe(false);
        expect(tones.shade.slice(1, 8).some(Boolean)).toBe(false);
    });

    it("lights the side of a cloud facing the light and darkens the other, the middle in between", () => {
        // A cloud across one row, the light from the west (one cell to the left).
        const levels = Uint8Array.from([0, 2, 5, 8, 8, 8, 5, 2, 0]);
        const tones = cloudTones(levels, 9, 1, { columns: -1, rows: 0 });
        // A cell is lit when its neighbour towards the light is thinner, shaded when the one away from it is.
        expect(Array.from(tones.lit)).toEqual([0, 2, 5, 8, 0, 0, 0, 0, 0]);
        expect(Array.from(tones.mid)).toEqual([0, 0, 0, 0, 8, 0, 0, 0, 0]);
        expect(Array.from(tones.shade)).toEqual([0, 0, 0, 0, 0, 8, 5, 2, 0]);
    });

    it("lights the clouds from the north-west, a few map pixels away whatever the zoom: they read as puffs, not dents", () => {
        expect(cloudLightStep(48)).toEqual({ columns: -1, rows: -1 });
        expect(cloudLightStep(16)).toEqual({ columns: -2, rows: -2 });
        expect(cloudLightStep(64)).toEqual({ columns: -1, rows: -1 });
    });

    it("fades the clouds out as the camera comes down under them, by the scale on the screen", () => {
        // A map pixel over 0.8 screen pixel or less: whole; over 1.4 or more (the zoom a map opens with is 1.5): gone.
        expect(cloudZoomFade(0.17)).toBe(1);
        expect(cloudZoomFade(0.8)).toBe(1);
        expect(cloudZoomFade(1.1)).toBeGreaterThan(0);
        expect(cloudZoomFade(1.1)).toBeLessThan(1);
        expect(cloudZoomFade(1.4)).toBe(0);
        expect(cloudZoomFade(1.5)).toBe(0);
    });
});

describe("rain and storm clouds", () => {
    const brightness = (color: number) => ((color >> 16) & 0xff) + ((color >> 8) & 0xff) + (color & 0xff);

    it("cover more of the map than fine weather clouds, never a sheet: the ground shows between them", () => {
        expect(shownRainCover(0.6)).toBeCloseTo(0.45);
        expect(shownRainCover(0.3)).toBeCloseTo(0.45);
        expect(shownRainCover(0.9)).toBeGreaterThan(shownRainCover(0.6));
        expect(shownRainCover(1)).toBeCloseTo(0.65);
        expect(shownRainCover(0.9)).toBeGreaterThan(shownCloudiness(0.9));
    });

    it("keep their colour in the middle, lighter on the lit side and darker on the other", () => {
        const rain = rainPalette(0x7d8794);
        expect(rain.mid).toBe(0x7d8794);
        expect(brightness(rain.lit)).toBeGreaterThan(brightness(rain.mid));
        expect(brightness(rain.mid)).toBeGreaterThan(brightness(rain.shade));
        expect(rainPalette(0x2b3240).mid).toBe(0x2b3240);
    });
});
