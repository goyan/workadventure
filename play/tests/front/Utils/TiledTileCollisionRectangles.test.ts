import { describe, expect, it } from "vitest";
import type { ITiledMapObject } from "@workadventure/tiled-map-type-guard";
import { getTiledTileCollisionRectangles } from "../../../src/front/Utils/TiledTileCollisionRectangles";

// 32px Modern Office tile, with the 6px wall band discussed for the POC.
const wall: ITiledMapObject = {
    id: 1,
    name: "",
    visible: true,
    x: 0,
    y: 0,
    width: 6,
    height: 32,
};

function tile(objects: ITiledMapObject[]): Parameters<typeof getTiledTileCollisionRectangles>[0] {
    return {
        getCollisionGroup: () => ({ objects }),
        width: 32,
        height: 32,
        flipX: false,
        flipY: false,
        rotation: 0,
        getLeft: () => 64,
        getTop: () => 96,
    };
}

describe("Tiled collision rectangles", () => {
    it("keeps only the wall band solid, translated to world coordinates", () => {
        expect(getTiledTileCollisionRectangles(tile([wall]))).toEqual([{ x: 64, y: 96, width: 6, height: 32 }]);
    });

    it("respects horizontal and vertical tile flips", () => {
        expect(getTiledTileCollisionRectangles({ ...tile([wall]), flipX: true })).toEqual([
            { x: 90, y: 96, width: 6, height: 32 },
        ]);
        expect(getTiledTileCollisionRectangles({ ...tile([{ ...wall, width: 32, height: 6 }]), flipY: true })).toEqual([
            { x: 64, y: 122, width: 32, height: 6 },
        ]);
    });

    it("turns a vertical band into a horizontal band with a quarter turn", () => {
        expect(getTiledTileCollisionRectangles({ ...tile([wall]), rotation: Math.PI / 2 })).toEqual([
            { x: 64, y: 96, width: 32, height: 6 },
        ]);
    });

    it("supports multiple rectangles for wall corners", () => {
        expect(getTiledTileCollisionRectangles(tile([wall, { ...wall, id: 2, width: 32, height: 6 }]))).toEqual([
            { x: 64, y: 96, width: 6, height: 32 },
            { x: 64, y: 96, width: 32, height: 6 },
        ]);
    });

    it.each([
        { ...wall, ellipse: true },
        { ...wall, polygon: [{ x: 0, y: 0 }] },
        { ...wall, rotation: 45 },
        { ...wall, x: -3 },
        { ...wall, width: 33 },
        { ...wall, width: 0 },
        { ...wall, x: Number.NaN },
    ])("keeps the full-tile fallback for unsupported or out-of-tile geometry: %j", (object) => {
        expect(getTiledTileCollisionRectangles(tile([object]))).toBeUndefined();
    });

    it("keeps the full-tile fallback for legacy tiles and empty collision groups", () => {
        expect(getTiledTileCollisionRectangles({ ...tile([]), getCollisionGroup: () => null })).toBeUndefined();
        expect(getTiledTileCollisionRectangles(tile([]))).toBeUndefined();
    });
});
