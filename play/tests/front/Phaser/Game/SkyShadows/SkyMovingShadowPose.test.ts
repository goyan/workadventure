import { describe, expect, it } from "vitest";
import { cloudShadowOffset } from "../../../../../src/front/Phaser/Game/Weather/Clouds";
import { fallenShadowPose, ovalShadowPose } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyMovingShadowPose";

const light = (azimuth: number, elevation: number, max = 128, min = 0) => ({
    azimuth,
    elevation,
    shadowLength: { min, max },
});

describe("fallenShadowPose", () => {
    it("lays the silhouette away from the light: a sun in the south throws it straight north, unturned", () => {
        const pose = fallenShadowPose(32, light(180, 45));
        expect(pose?.rotation).toBeCloseTo(0, 5);
        // At 45° a shadow is as long as what throws it is high.
        expect(pose?.stretch).toBeCloseTo(1, 5);
    });

    it("turns it a quarter turn clockwise for a sun in the west (shadow towards the east)", () => {
        expect(fallenShadowPose(32, light(270, 45))?.rotation).toBeCloseTo(Math.PI / 2, 5);
    });

    it("points the same way as the shadows of the clouds", () => {
        const sun = { azimuth: 201, elevation: 19.5 };
        const cloud = cloudShadowOffset(sun);
        const pose = fallenShadowPose(32, light(sun.azimuth, sun.elevation));
        if (!cloud || !pose) throw new Error("a shadow was expected");
        // The top of an unturned image points to (0, -1); turned, to (sin, -cos).
        const along = { x: Math.sin(pose.rotation), y: -Math.cos(pose.rotation) };
        const length = Math.hypot(cloud.x, cloud.y);
        expect(along.x).toBeCloseTo(cloud.x / length, 5);
        expect(along.y).toBeCloseTo(cloud.y / length, 5);
    });

    it("keeps the length within the limits of the light", () => {
        // A low sun: 32 / tan(5°) = 366 px, kept to the longest shadow.
        expect(fallenShadowPose(32, light(180, 5, 128))?.stretch).toBeCloseTo(4, 5);
        // A high sun: 32 / tan(80°) = 5.6 px, brought up to the shortest shadow.
        expect(fallenShadowPose(32, light(180, 80, 128, 16))?.stretch).toBeCloseTo(0.5, 5);
    });

    it("gives nothing with the light at or under the horizon", () => {
        expect(fallenShadowPose(32, light(180, 0))).toBeUndefined();
        expect(fallenShadowPose(32, light(180, -10))).toBeUndefined();
    });
});

describe("ovalShadowPose", () => {
    it("puts an oval at the feet, stretched away from the light", () => {
        // 24 px high at 45°: a shadow of 24 px towards the north; the oval starts at the feet.
        const pose = ovalShadowPose({ x: 100, y: 200, width: 32, height: 24 }, light(180, 45));
        expect(pose?.rotation).toBeCloseTo(0, 5);
        expect(pose?.x).toBeCloseTo(100, 5);
        expect(pose?.length).toBeGreaterThanOrEqual(24);
        // Centred half its length away from the feet, less the part under the body.
        expect(pose?.y).toBeLessThan(200);
        expect(pose?.width).toBeLessThanOrEqual(32);
        expect(pose?.width).toBeGreaterThan(8);
    });

    it("stays a small oval under the body with the light overhead", () => {
        const pose = ovalShadowPose({ x: 100, y: 200, width: 32, height: 24 }, light(180, 89));
        expect(pose?.length).toBeGreaterThanOrEqual(8);
        expect(Math.abs((pose?.y ?? 0) - 200)).toBeLessThan(8);
    });

    it("gives nothing with the light under the horizon", () => {
        expect(ovalShadowPose({ x: 0, y: 0, width: 32, height: 24 }, light(180, -1))).toBeUndefined();
    });
});
