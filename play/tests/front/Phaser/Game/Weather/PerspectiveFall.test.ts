import { describe, expect, it } from "vitest";
import {
    dropShares,
    EXPOSURE_S,
    perspectiveCamera,
    perspectiveDrops,
    perspectiveFlakes,
    project,
    TOP_SHARE,
} from "@wa/front/Phaser/Game/Weather/PerspectiveFall";
import { RAIN_FALL_SPEEDS, rainDropsExpected } from "@wa/front/Phaser/Game/Weather/Rain";
import { FLAKE_KINDS, flakeCapacity, FLAKES_PER_CAPACITY, PX_PER_METRE } from "@wa/front/Phaser/Game/Weather/Snowfall";

// The usual view: 1097 x 617 map pixels (a 1920 x 1080 screen at zoom 1.75), about 38 x 21 m.
const SCREEN = { x: 4000, y: 2000, width: 1097, height: 617 };
const CAMERA = perspectiveCamera(SCREEN);
const STILL_AIR = { shift: { x: 0, y: 0 }, wind: { x: 0, y: 0 } };

describe("the camera above the map", () => {
    it("is over the middle of the screen, as high as a field of 60° across it: about 33 m at the usual zoom", () => {
        expect(CAMERA.x).toBeCloseTo(SCREEN.x + SCREEN.width / 2, 9);
        expect(CAMERA.y).toBeCloseTo(SCREEN.y + SCREEN.height / 2, 9);
        expect(CAMERA.height / PX_PER_METRE).toBeGreaterThan(31);
        expect(CAMERA.height / PX_PER_METRE).toBeLessThan(34);
    });

    it("draws a point of the ground where it is, one halfway up twice as big and twice as far from the middle", () => {
        const ground = project(CAMERA, CAMERA.x + 100, CAMERA.y - 40, 0);
        expect(ground.x).toBeCloseTo(CAMERA.x + 100, 9);
        expect(ground.y).toBeCloseTo(CAMERA.y - 40, 9);
        expect(ground.scale).toBe(1);
        const half = project(CAMERA, CAMERA.x + 100, CAMERA.y - 40, CAMERA.height / 2);
        expect(half.scale).toBeCloseTo(2, 9);
        expect(half.x).toBeCloseTo(CAMERA.x + 200, 9);
        expect(half.y).toBeCloseTo(CAMERA.y - 80, 9);
    });
});

describe("the drops in perspective", () => {
    const mean = (intensity: number): number => {
        let sum = 0;
        const times = 40;
        for (let at = 0; at < times; at++) {
            sum += perspectiveDrops(1_000_000 + at * 731, SCREEN, CAMERA, intensity, STILL_AIR).length;
        }
        return sum / times;
    };

    it("are as many on the screen as the drops of the flat rain at the same intensity, give or take 15 %", () => {
        for (const intensity of [0.3, 0.6, 1]) {
            const flat = rainDropsExpected(SCREEN, intensity);
            expect(Math.abs(mean(intensity) - flat) / flat, `intensity ${intensity}`).toBeLessThan(0.15);
        }
    });

    it("are mostly small: the big ones come with the downpours (Marshall and Palmer)", () => {
        for (const rate of [1, 5, 20]) {
            const shares = dropShares(rate);
            expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 9);
            expect(shares[0]).toBeGreaterThan(0.9);
        }
        expect(dropShares(20)[1]).toBeGreaterThan(dropShares(1)[1] * 10);
        expect(dropShares(20)[2]).toBeGreaterThan(dropShares(1)[2]);
    });

    it("streak along the line to the middle, the tail farther out (higher), the head where the drop is", () => {
        const drops = perspectiveDrops(1_234_567, SCREEN, CAMERA, 1, STILL_AIR);
        expect(drops.length).toBeGreaterThan(100);
        for (const drop of drops.slice(0, 200)) {
            const head = { x: drop.headX - CAMERA.x, y: drop.headY - CAMERA.y };
            const tail = { x: drop.tailX - CAMERA.x, y: drop.tailY - CAMERA.y };
            // On the same ray from the middle.
            expect(Math.abs(head.x * tail.y - head.y * tail.x)).toBeLessThan(
                1e-6 * (1 + Math.hypot(tail.x, tail.y)) ** 2,
            );
            expect(Math.hypot(tail.x, tail.y) + 1e-9).toBeGreaterThanOrEqual(Math.hypot(head.x, head.y));
        }
    });

    it("fall at their terminal velocity from the top and reach the ground where they land", () => {
        const wind = { x: 30, y: 10 };
        // The air goes on at the speed of the wind.
        const air = (epoch: number) => ({ shift: { x: (wind.x * epoch) / 1000, y: (wind.y * epoch) / 1000 }, wind });
        // Followed over 50 ms, one drop comes down towards where it lands.
        const start = 2_000_000;
        const first = perspectiveDrops(start, SCREEN, CAMERA, 0.6, air(start));
        const watched = first.find((drop) => drop.scale > 1.05 && drop.scale < 1.2);
        expect(watched).toBeDefined();
        if (!watched) return;
        const later = perspectiveDrops(start + 50, SCREEN, CAMERA, 0.6, air(start + 50)).find(
            (drop) => Math.abs(drop.landX - watched.landX) < 1e-6 && Math.abs(drop.landY - watched.landY) < 1e-6,
        );
        expect(later).toBeDefined();
        if (!later) return;
        // Closer to where it lands, and smaller.
        expect(Math.hypot(later.headX - later.landX, later.headY - later.landY)).toBeLessThan(
            Math.hypot(watched.headX - watched.landX, watched.headY - watched.landY),
        );
        expect(later.scale).toBeLessThan(watched.scale);
        // A fall from the top takes the height over the speed: 3 to 5 s for drops of 1.4 to 5 mm.
        const top = TOP_SHARE * CAMERA.height;
        expect(top / (RAIN_FALL_SPEEDS[0] * PX_PER_METRE)).toBeLessThan(6);
        expect(top / (RAIN_FALL_SPEEDS[2] * PX_PER_METRE)).toBeGreaterThan(2.5);
        expect(EXPOSURE_S).toBeLessThanOrEqual(0.1);
    });

    it("draw nothing without rain", () => {
        expect(perspectiveDrops(5, SCREEN, CAMERA, 0, STILL_AIR)).toEqual([]);
    });
});

describe("the flakes in perspective", () => {
    const fall = { level: 0.8, mix: [0.3, 0.6, 0.1] };
    const air = { shift: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };

    it("are as many on the screen as the flakes of the flat snow at the same level, give or take 15 %", () => {
        const flat = FLAKE_KINDS.reduce(
            (sum, kind, index) => sum + fall.level * fall.mix[index] * flakeCapacity(kind) * FLAKES_PER_CAPACITY,
            0,
        );
        let sum = 0;
        for (let at = 0; at < 20; at++)
            sum += perspectiveFlakes(3_000_000 + at * 4_111, SCREEN, CAMERA, fall, air).length;
        expect(Math.abs(sum / 20 - flat) / flat).toBeLessThan(0.15);
    });

    it("fall slowly, about a metre a second: near the camera bigger, never past it", () => {
        const flakes = perspectiveFlakes(3_500_000, SCREEN, CAMERA, fall, air);
        const biggest = Math.max(...flakes.map((flake) => flake.scale));
        expect(biggest).toBeGreaterThan(2);
        expect(biggest).toBeLessThanOrEqual(1 / (1 - TOP_SHARE) + 1e-9);
        for (const kind of FLAKE_KINDS) expect(kind.fallSpeed).toBeGreaterThan(0.6);
    });

    it("stand still when motion is reduced", () => {
        const a = perspectiveFlakes(10_000, SCREEN, CAMERA, fall, air, undefined, true);
        const b = perspectiveFlakes(90_000, SCREEN, CAMERA, fall, air, undefined, true);
        expect(b).toEqual(a);
    });
});
