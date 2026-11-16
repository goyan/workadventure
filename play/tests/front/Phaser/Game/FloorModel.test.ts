import { describe, expect, it } from "vitest";
import {
    FloorModel,
    slabImagePosition,
    stairFootFromImage,
    stairImagePosition,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import {
    MAP_LAYER_FLOOR_SLAB_COLLECTION,
    slabPrefabName,
    stairPrefabName,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
import type { StairShape } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

const placed = (name: string, x: number, y: number, elevation?: number) => ({
    collectionName: MAP_LAYER_FLOOR_SLAB_COLLECTION,
    prefabId: `${MAP_LAYER_FLOOR_SLAB_COLLECTION}:${name}:Default:Down`,
    x,
    y,
    elevation,
});

describe("FloorModel", () => {
    it("draws a slab its altitude further north than the tile it covers", () => {
        expect(slabImagePosition({ x: 5, y: 6 }, 52)).toEqual({ x: 160, y: 192 - 52 });
    });

    it("reads the slabs back on the tile they cover, at their altitude", () => {
        const model = FloorModel.fromPlaced([
            placed(slabPrefabName("parquet-clair"), 160, 140, 52),
            placed(slabPrefabName("moquette-grise"), 192, 140, 52),
            placed(slabPrefabName("parquet-clair"), 160, 192 - 116, 116),
        ]);
        expect(model.slabAt(52, 5, 6)).toBe("parquet-clair");
        expect(model.slabAt(52, 6, 6)).toBe("moquette-grise");
        expect(model.hasSlab(116, 5, 6)).toBe(true);
        expect(model.hasSlab(52, 7, 6)).toBe(false);
        expect(model.hasSlab(84, 5, 6)).toBe(false);
        expect(model.getLevels()).toEqual([52, 116]);
    });

    it("ignores a slab on the ground, off the grid, or another object", () => {
        const model = FloorModel.fromPlaced([
            placed(slabPrefabName("parquet-clair"), 160, 192),
            placed(slabPrefabName("parquet-clair"), 160, 192, 0),
            placed(slabPrefabName("parquet-clair"), 163, 140, 52),
            { collectionName: "Carte Sols", prefabId: "Carte Sols:sol-parquet-clair-uni:Default:Down", x: 160, y: 140 },
        ]);
        expect(model.getLevels()).toEqual([]);
    });

    it.each<StairShape["direction"]>(["n", "e", "s", "o"])("finds the foot of a stair going %s back", (direction) => {
        const shape: StairShape = { direction, width: 2, rise: 84, open: false };
        for (const base of [0, 52]) {
            const image = stairImagePosition(shape, { x: 10, y: 20 }, base);
            expect(stairFootFromImage(shape, image.x, image.y, base)).toEqual({ x: 10, y: 20 });
        }
    });

    it("places the image of a stair where it shows on the screen", () => {
        // Going north from the ground, 2 tiles of run: the image starts its rise above the top of its run.
        expect(stairImagePosition({ direction: "n", width: 1, rise: 52, open: false }, { x: 10, y: 20 }, 0)).toEqual({
            x: 320,
            y: 608 - 52,
        });
        // The same stair standing on a floor at 52 px is drawn 52 px higher.
        expect(stairImagePosition({ direction: "n", width: 1, rise: 52, open: false }, { x: 10, y: 20 }, 52)).toEqual({
            x: 320,
            y: 608 - 52 - 52,
        });
        expect(stairImagePosition({ direction: "s", width: 1, rise: 52, open: false }, { x: 10, y: 20 }, 0)).toEqual({
            x: 320,
            y: 640,
        });
    });

    it("reads the stairs back with the floors they join", () => {
        const shape: StairShape = { direction: "e", width: 1, rise: 52, open: true };
        const image = stairImagePosition(shape, { x: 3, y: 4 }, 52);
        const model = FloorModel.fromPlaced([placed(stairPrefabName(shape), image.x, image.y, 52)]);
        expect(model.getStairs()).toEqual([
            {
                shape,
                foot: { x: 3, y: 4 },
                base: 52,
                top: 104,
                ground: { x: 96, y: 128, width: 64, height: 32 },
            },
        ]);
    });

    it("ignores a stair off the grid", () => {
        const shape: StairShape = { direction: "n", width: 1, rise: 52, open: false };
        expect(FloorModel.fromPlaced([placed(stairPrefabName(shape), 320, 600, 0)]).getStairs()).toEqual([]);
    });
});
