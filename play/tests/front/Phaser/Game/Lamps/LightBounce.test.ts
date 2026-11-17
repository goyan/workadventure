import { describe, expect, it } from "vitest";
import { MAX_BOUNCES_PER_LIGHT, bounceSources } from "../../../../../src/front/Phaser/Game/Lamps/LightBounce";
import {
    litPolygon,
    rectangleSegments,
    type LightCone,
} from "../../../../../src/front/Phaser/Game/Lamps/RgbLampGeometry";

const light: LightCone = { x: 0, y: 0, radius: 200, direction: 0, angle: 360 };
const wallAt = (x: number) => [{ ax: x, ay: -60, bx: x, by: 60 }];
const bouncesOff = (segments: { ax: number; ay: number; bx: number; by: number }[], strength = 1, from = light) =>
    bounceSources(from, litPolygon(from, segments), strength);

describe("bounceSources", () => {
    it("sends light back from a wall the light falls on: a half-turn, just in front of the wall, facing the lamp", () => {
        const bounces = bouncesOff(wallAt(100));

        expect(bounces.length).toBeGreaterThan(0);
        for (const bounce of bounces) {
            expect(bounce.x).toBeGreaterThan(90);
            expect(bounce.x).toBeLessThan(100);
            expect(Math.abs(bounce.y)).toBeLessThanOrEqual(60);
            expect(bounce.angle).toBe(180);
            // Facing west, back towards the lamp.
            expect(Math.abs(bounce.direction)).toBeCloseTo(180);
            expect(bounce.intensity).toBeGreaterThan(0);
            expect(bounce.intensity).toBeLessThan(1);
        }
    });

    it("sends nothing back in the open, where the light meets no wall", () => {
        expect(bouncesOff([])).toEqual([]);
    });

    it("follows the strength set, and sends nothing back at zero", () => {
        const full = bouncesOff(wallAt(100), 1);
        const half = bouncesOff(wallAt(100), 0.5);
        expect(half).toHaveLength(full.length);
        expect(half[0].intensity).toBeCloseTo(full[0].intensity / 2);
        expect(bouncesOff(wallAt(100), 0)).toEqual([]);
    });

    it("sends back less from a wall further from the lamp", () => {
        const near = bouncesOff(wallAt(60));
        const far = bouncesOff(wallAt(170));
        expect(Math.max(...far.map((bounce) => bounce.intensity))).toBeLessThan(
            Math.max(...near.map((bounce) => bounce.intensity)),
        );
    });

    it("keeps to a few bounces per light, the strongest, all inside a closed room", () => {
        const room = rectangleSegments({ x: -150, y: -90, width: 300, height: 180 });
        const bounces = bouncesOff(room);

        expect(bounces.length).toBeGreaterThan(1);
        expect(bounces.length).toBeLessThanOrEqual(MAX_BOUNCES_PER_LIGHT);
        for (const bounce of bounces) {
            expect(Math.abs(bounce.x)).toBeLessThan(150);
            expect(Math.abs(bounce.y)).toBeLessThan(90);
        }
        const intensities = bounces.map((bounce) => bounce.intensity);
        expect(intensities).toEqual([...intensities].sort((a, b) => b - a));
    });

    it("does not take the sides of a beam for walls", () => {
        const beam: LightCone = { ...light, direction: 0, angle: 40 };
        expect(bouncesOff([], 1, beam)).toEqual([]);
    });
});
