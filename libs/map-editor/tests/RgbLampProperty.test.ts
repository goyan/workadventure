import { describe, expect, it } from "vitest";
import {
    EntityDataProperty,
    EntityRawPrefab,
    RGB_LAMP_DEFAULT_ROTATION_SPEED,
    RGB_LAMP_MAX_ROTATION_SPEED,
    RGB_LAMP_MIN_ROTATION_SPEED,
    RgbLampPropertyData,
} from "../src";

describe("RgbLampPropertyData", () => {
    const base = { id: "rgb-1", type: "rgbLampPropertyData" as const };

    it("is a warm white light of 6 tiles, shining all around, turned downwards by default", () => {
        const parsed = RgbLampPropertyData.parse(base);
        expect(parsed.color).toBe("#ffd9a0");
        expect(parsed.radius).toBe(6);
        expect(parsed.direction).toBe(90);
        expect(parsed.angle).toBe(360);
    });

    it("keeps the colour, the reach, the direction and the opening that were set", () => {
        const parsed = RgbLampPropertyData.parse({ ...base, color: "#00ff80", radius: 20, direction: 270, angle: 10 });
        expect(parsed).toMatchObject({ color: "#00ff80", radius: 20, direction: 270, angle: 10 });
    });

    it("rejects a colour that is not #rrggbb", () => {
        expect(RgbLampPropertyData.safeParse({ ...base, color: "red" }).success).toBe(false);
        expect(RgbLampPropertyData.safeParse({ ...base, color: "#fff" }).success).toBe(false);
        expect(RgbLampPropertyData.safeParse({ ...base, color: "#gggggg" }).success).toBe(false);
    });

    it("rejects a reach out of 1 to 20 tiles", () => {
        expect(RgbLampPropertyData.safeParse({ ...base, radius: 0 }).success).toBe(false);
        expect(RgbLampPropertyData.safeParse({ ...base, radius: 21 }).success).toBe(false);
    });

    it("rejects an opening out of 10 to 360 degrees, and a direction out of the circle", () => {
        expect(RgbLampPropertyData.safeParse({ ...base, angle: 9 }).success).toBe(false);
        expect(RgbLampPropertyData.safeParse({ ...base, angle: 361 }).success).toBe(false);
        expect(RgbLampPropertyData.safeParse({ ...base, direction: -1 }).success).toBe(false);
        expect(RgbLampPropertyData.safeParse({ ...base, direction: 360 }).success).toBe(false);
    });

    it("is a property an object of the map can carry", () => {
        const parsed = EntityDataProperty.parse({ ...base, color: "#112233" });
        expect(parsed.type).toBe("rgbLampPropertyData");
    });
});

describe("catalog entry of an RGB lamp and of a tall piece of furniture", () => {
    const prefab = {
        id: "p",
        name: "p",
        tags: [],
        imagePath: "p.png",
        direction: "Down" as const,
        color: "",
    };

    it("knows the rgb kind of lamp", () => {
        expect(EntityRawPrefab.parse({ ...prefab, lamp: { kind: "rgb" } }).lamp?.kind).toBe("rgb");
    });

    it("marks a tall object that casts a shadow", () => {
        expect(EntityRawPrefab.parse({ ...prefab, castsShadow: true }).castsShadow).toBe(true);
        expect(EntityRawPrefab.parse(prefab).castsShadow).toBeUndefined();
    });

    it("fails open: an invalid castsShadow leaves the object as a plain one", () => {
        expect(EntityRawPrefab.parse({ ...prefab, castsShadow: "yes" }).castsShadow).toBeUndefined();
    });
});

describe("rotation of an RGB lamp", () => {
    const base = { id: "rgb-1", type: "rgbLampPropertyData" as const };

    it("fails open: a lamp saved without the rotation fields stays a still lamp", () => {
        const parsed = RgbLampPropertyData.parse(base);
        expect(parsed.rotation).toBeUndefined();
        expect(parsed.rotationSpeed).toBeUndefined();
        expect(parsed.rotationClockwise).toBeUndefined();
    });

    it("keeps the rotation, its speed in turns a minute and its sense that were set", () => {
        const parsed = RgbLampPropertyData.parse({
            ...base,
            rotation: true,
            rotationSpeed: 120,
            rotationClockwise: false,
        });
        expect(parsed).toMatchObject({ rotation: true, rotationSpeed: 120, rotationClockwise: false });
    });

    it("drops a rotation field that is not valid instead of refusing the whole map", () => {
        for (const rotationSpeed of [9, 121, "fast"]) {
            const parsed = RgbLampPropertyData.safeParse({ ...base, rotation: true, rotationSpeed });
            expect(parsed.success).toBe(true);
            expect(parsed.data?.rotationSpeed).toBeUndefined();
            expect(parsed.data?.rotation).toBe(true);
        }
        const parsed = RgbLampPropertyData.parse({ ...base, rotation: "yes", rotationClockwise: 1 });
        expect(parsed.rotation).toBeUndefined();
        expect(parsed.rotationClockwise).toBeUndefined();
    });

    it("is never faster than 2 turns a second: a single beam passes a still observer at most 2 times a second (WCAG 2.3.1: 3 flashes)", () => {
        expect(RGB_LAMP_MAX_ROTATION_SPEED / 60).toBeLessThanOrEqual(2);
        expect(RGB_LAMP_MIN_ROTATION_SPEED).toBe(10);
        expect(RGB_LAMP_DEFAULT_ROTATION_SPEED).toBe(30);
    });
});
