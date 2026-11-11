import { describe, expect, it } from "vitest";
import {
    danceFloorBounds,
    danceFloorTiles,
    lampSizeOf,
    lampSource,
    planLamps,
} from "../../../../../src/front/Phaser/Game/Lamps/LampReconcile";

describe("planLamps", () => {
    it("creates a lamp for each object of the map that has one", () => {
        const plan = planLamps(new Map(), [
            { id: "a", kind: "spot" },
            { id: "b", kind: "neon" },
        ]);
        expect(plan.create).toEqual([
            { id: "a", kind: "spot" },
            { id: "b", kind: "neon" },
        ]);
        expect(plan.remove).toEqual([]);
    });

    it("ignores the objects that are not lamps", () => {
        expect(planLamps(new Map(), [{ id: "chair", kind: undefined }]).create).toEqual([]);
    });

    it("keeps a lamp that is still there, as it is", () => {
        const plan = planLamps(new Map([["a", "spot" as const]]), [{ id: "a", kind: "spot" }]);
        expect(plan).toEqual({ create: [], remove: [] });
    });

    it("removes the lamp of an object that was deleted", () => {
        const plan = planLamps(new Map([["a", "spot" as const]]), []);
        expect(plan.remove).toEqual(["a"]);
    });

    it("removes the lamp of an object that is not a lamp any more", () => {
        const plan = planLamps(new Map([["a", "spot" as const]]), [{ id: "a", kind: undefined }]);
        expect(plan.remove).toEqual(["a"]);
        expect(plan.create).toEqual([]);
    });

    it("replaces a lamp whose kind changed", () => {
        const plan = planLamps(new Map([["a", "spot" as const]]), [{ id: "a", kind: "neon" }]);
        expect(plan.remove).toEqual(["a"]);
        expect(plan.create).toEqual([{ id: "a", kind: "neon" }]);
    });
});

describe("lampSource", () => {
    // An object drawn from (100, 50), 32 by 64 pixels on the screen, from an image of 32 by 64 pixels.
    const object = { x: 100, y: 50, displayWidth: 32, displayHeight: 64, width: 32, height: 64 };

    it("lights from the centre of the object when the catalog names no point", () => {
        expect(lampSource(object, undefined)).toEqual({ x: 116, y: 82 });
    });

    it("lights from the point of the image the catalog names", () => {
        expect(lampSource(object, { x: 16, y: 4 })).toEqual({ x: 116, y: 54 });
    });

    it("follows an object that was resized: the point scales with the image", () => {
        // Twice as big on the screen: a point 16 pixels along the image is 32 along the object.
        const resized = { ...object, displayWidth: 64, displayHeight: 128 };
        expect(lampSource(resized, { x: 16, y: 4 })).toEqual({ x: 132, y: 58 });
    });

    it("follows an object that was moved", () => {
        expect(lampSource({ ...object, x: 300, y: 10 }, { x: 16, y: 4 })).toEqual({ x: 316, y: 14 });
    });

    it("does not divide by an image without size", () => {
        expect(lampSource({ ...object, width: 0, height: 0 }, { x: 16, y: 4 })).toEqual({ x: 116, y: 54 });
    });
});

describe("lampSizeOf", () => {
    it("reads the size of the light set for the lamp, in tiles", () => {
        const properties = [
            { id: "a", type: "openWebsite" },
            { id: "b", type: "lampPropertyData", width: 20, height: 6 },
        ] as never;
        expect(lampSizeOf(properties)).toEqual({ width: 20, height: 6 });
    });

    it("is undefined when no size was set: the light fills its zone", () => {
        expect(lampSizeOf([{ id: "a", type: "openWebsite" }] as never)).toBeUndefined();
        expect(lampSizeOf([])).toBeUndefined();
    });
});

describe("danceFloorBounds", () => {
    const object = { x: 320, y: 96, displayWidth: 128, displayHeight: 128, width: 128, height: 128 };

    it("covers the object itself when no size was set: the tiles of its image", () => {
        expect(danceFloorBounds(object, undefined)).toEqual({ x: 320, y: 96, width: 128, height: 128 });
    });

    it("covers the size set in the editor, in tiles of 32 px, from the top-left corner of the object", () => {
        expect(danceFloorBounds(object, { width: 12, height: 8 })).toEqual({ x: 320, y: 96, width: 384, height: 256 });
    });

    it("follows the object when it is moved", () => {
        expect(danceFloorBounds({ ...object, x: 64, y: 32 }, { width: 3, height: 2 })).toEqual({
            x: 64,
            y: 32,
            width: 96,
            height: 64,
        });
    });
});

describe("danceFloorTiles", () => {
    it("counts a size in pixels in whole tiles", () => {
        expect(danceFloorTiles({ width: 384, height: 256 })).toEqual({ width: 12, height: 8 });
        expect(danceFloorTiles({ width: 270, height: 150 })).toEqual({ width: 8, height: 5 });
    });

    it("stays within what the size of a lamp can be: 2 to 60 tiles", () => {
        expect(danceFloorTiles({ width: 1, height: 40 })).toEqual({ width: 2, height: 2 });
        expect(danceFloorTiles({ width: 4096, height: 1920 })).toEqual({ width: 60, height: 60 });
    });
});
