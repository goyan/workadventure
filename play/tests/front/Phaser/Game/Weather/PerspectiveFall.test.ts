import { describe, expect, it } from "vitest";
import {
    dropShares,
    EXPOSURE_S,
    perspectiveCamera,
    perspectiveDrops,
    perspectiveFlakes,
    project,
    TOP_SHARE,
    uprightTail,
} from "@wa/front/Phaser/Game/Weather/PerspectiveFall";
import { RAIN_FALL_SPEEDS, rainDropsExpected, rainLeanOf } from "@wa/front/Phaser/Game/Weather/Rain";
import {
    FLAKE_KINDS,
    flakeCapacity,
    FLAKES_PER_CAPACITY,
    groundWind,
    PX_PER_METRE,
} from "@wa/front/Phaser/Game/Weather/Snowfall";

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

    // It lay along the line to the middle of the screen, across it near the sides (see uprightTail): in still air it now
    // stands above its head, as long as it was.
    it("streak above its head in still air, as long as along the line to the middle", () => {
        const drops = perspectiveDrops(1_234_567, SCREEN, CAMERA, 1, STILL_AIR);
        expect(drops.length).toBeGreaterThan(100);
        for (const drop of drops.slice(0, 200)) {
            expect(Math.abs(drop.tailX - drop.headX)).toBeLessThan(1e-6);
            expect(drop.tailY).toBeLessThanOrEqual(drop.headY + 1e-9);
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

// Seen from above the drops near the sides of the screen fall across it: with no wind at all a streak lay at 45 degrees
// and more (median 61 degrees from the vertical, measured at the usual zoom). The lean with the wind is all it keeps.
describe("the lean of the rain seen from above", () => {
    const EPOCH = 1_763_700_000_000;
    const angle = (drop: { headX: number; headY: number; tailX: number; tailY: number }) =>
        Math.atan(Math.abs(drop.tailX - drop.headX) / Math.max(1e-9, Math.abs(drop.tailY - drop.headY)));

    it("turns a streak that leans more than the slant to it, keeping its length", () => {
        const head = { x: 100, y: 100 };
        const tail = uprightTail(head, { x: 130, y: 90 }, 0.25);
        expect(Math.hypot(tail.x - head.x, tail.y - head.y)).toBeCloseTo(Math.hypot(30, 10));
        expect((tail.x - head.x) / Math.abs(tail.y - head.y)).toBeCloseTo(0.25);
        expect(tail.y).toBeLessThan(head.y);
        expect(uprightTail(head, { x: 101, y: 80 }, 0.25)).toEqual({ x: 101, y: 80 });
        expect(uprightTail(head, { x: 130, y: 90 }, 0)).toEqual({ x: 100, y: 100 - Math.hypot(30, 10) });
    });

    it("lies upright without wind, and leans no more than the flat rain does with it", () => {
        const calm = perspectiveDrops(EPOCH, SCREEN, CAMERA, 0.6, STILL_AIR);
        expect(calm.length).toBeGreaterThan(500);
        for (const drop of calm) expect(angle(drop)).toBeLessThan(1e-6);
        const wind = groundWind(270, 41, rainLeanOf(1));
        const leaning = perspectiveDrops(EPOCH, SCREEN, CAMERA, 0.6, { shift: { x: 0, y: 0 }, wind });
        expect(leaning.length).toBeGreaterThan(500);
        const most = Math.atan(Math.abs(wind.x) / (RAIN_FALL_SPEEDS[0] * PX_PER_METRE));
        for (const drop of leaning)
            expect(angle(drop)).toBeLessThanOrEqual(
                Math.atan(Math.abs(wind.x) / (RAIN_FALL_SPEEDS[drop.size] * PX_PER_METRE)) + 1e-6,
            );
        expect(most).toBeLessThan(Math.PI / 4);
    });
});
