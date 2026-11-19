import { describe, expect, it } from "vitest";
import { clampAreaCorner, clampAreaTopLeft } from "../../../../src/front/Phaser/Components/MapEditor/AreaMapBounds";

const map = { width: 640, height: 480 };

describe("clampAreaCorner", () => {
    it("leaves a corner of the map where it is", () => {
        expect(clampAreaCorner({ x: 320, y: 96 }, 0, map)).toEqual({ x: 320, y: 96 });
        expect(clampAreaCorner({ x: 640, y: 480 }, 0, map)).toEqual({ x: 640, y: 480 });
    });

    it("brings a corner past an edge of the map back onto that edge", () => {
        expect(clampAreaCorner({ x: -64, y: -32 }, 0, map)).toEqual({ x: 0, y: 0 });
        expect(clampAreaCorner({ x: 704, y: 512 }, 0, map)).toEqual({ x: 640, y: 480 });
    });

    it("reads the corner of a raised floor on the ground under it", () => {
        // A floor 64 px high is drawn 64 px further north: its northern edge is drawn at -64.
        expect(clampAreaCorner({ x: 32, y: -64 }, 64, map)).toEqual({ x: 32, y: -64 });
        expect(clampAreaCorner({ x: 32, y: -96 }, 64, map)).toEqual({ x: 32, y: -64 });
        expect(clampAreaCorner({ x: 32, y: 448 }, 64, map)).toEqual({ x: 32, y: 416 });
    });
});

describe("clampAreaTopLeft", () => {
    const size = { width: 96, height: 64 };

    it("leaves an area of the map where it is", () => {
        expect(clampAreaTopLeft({ x: 32, y: 32 }, size, 0, map)).toEqual({ x: 32, y: 32 });
        expect(clampAreaTopLeft({ x: 544, y: 416 }, size, 0, map)).toEqual({ x: 544, y: 416 });
    });

    it("keeps the whole area on the map", () => {
        expect(clampAreaTopLeft({ x: -32, y: -32 }, size, 0, map)).toEqual({ x: 0, y: 0 });
        expect(clampAreaTopLeft({ x: 608, y: 448 }, size, 0, map)).toEqual({ x: 544, y: 416 });
    });

    it("keeps the area of a raised floor over the map", () => {
        expect(clampAreaTopLeft({ x: 32, y: -128 }, size, 64, map)).toEqual({ x: 32, y: -64 });
        expect(clampAreaTopLeft({ x: 32, y: 448 }, size, 64, map)).toEqual({ x: 32, y: 352 });
    });

    it("starts an area larger than the map at its first corner", () => {
        expect(clampAreaTopLeft({ x: 64, y: 64 }, { width: 800, height: 600 }, 0, map)).toEqual({ x: 0, y: 0 });
    });
});
