import { describe, expect, it } from "vitest";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import {
    applySlabs,
    availableLevels,
    canPlaceStair,
    computeFloorPlacements,
    diffFloorPlacements,
    eraseSlabs,
    floorCellAt,
    levelUnderPoint,
    placeStair,
    removeStairAt,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorOperations";
import type { StairShape } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

const BOUNDS = { columns: 40, rows: 40 };
const north: StairShape = { direction: "n", width: 1, height: 2, open: false };

describe("floor operations", () => {
    it("places one entity per slab and per stair, at the altitude it stands on", () => {
        const model = new FloorModel();
        model.setSlab(52, 5, 6, "parquet-clair");
        model.addStair(north, { x: 10, y: 20 }, 52);
        expect(computeFloorPlacements(model).map(({ key: _key, ...rest }) => rest)).toEqual([
            {
                collectionName: "Carte Paliers",
                prefabId: "Carte Paliers:dalle-parquet-clair:Default:Down",
                x: 160,
                y: 140,
                elevation: 52,
            },
            {
                collectionName: "Carte Paliers",
                prefabId: "Carte Paliers:escalier-n-l1-h2:Default:Down",
                x: 320,
                y: 608 - 52 - 52,
                elevation: 52,
            },
        ]);
    });

    it("reads its own placements back", () => {
        const model = new FloorModel();
        applySlabs(model, 84, { x: 2, y: 2 }, { x: 4, y: 3 }, "moquette-grise", BOUNDS);
        placeStair(model, { direction: "o", width: 2, height: 3, open: true }, { x: 9, y: 2 }, 0, BOUNDS);
        const read = FloorModel.fromPlaced(computeFloorPlacements(model));
        expect(read.getSlabs()).toEqual(model.getSlabs());
        expect(read.getStairs()).toEqual(model.getStairs());
    });

    it("keeps the entities already there, deletes and creates the others", () => {
        const model = new FloorModel();
        model.setSlab(52, 5, 6, "parquet-clair");
        model.setSlab(52, 6, 6, "parquet-clair");
        const [first, second] = computeFloorPlacements(model);
        const diff = diffFloorPlacements(
            [
                { entityId: "kept", key: first.key },
                { entityId: "twice", key: first.key },
                { entityId: "gone", key: "something else" },
            ],
            [first, second],
        );
        expect(diff.toDelete.sort()).toEqual(["gone", "twice"]);
        expect(diff.toCreate).toEqual([second]);
    });

    it("finds the tile under the pointer at the level being edited", () => {
        // A slab of the level at 52 px over the tile (5, 6) is drawn from y = 140 to y = 172.
        expect(floorCellAt(170, 150, 52)).toEqual({ x: 5, y: 6 });
        expect(floorCellAt(170, 150, 0)).toEqual({ x: 5, y: 4 });
    });

    it("picks the highest level drawn under the pointer, the ground otherwise", () => {
        const model = new FloorModel();
        model.setSlab(52, 5, 6, "parquet-clair");
        expect(levelUnderPoint(model, 170, 150)).toBe(52);
        expect(levelUnderPoint(model, 170, 200)).toBe(0);
        // A slab at 104 px over the tile (5, 7) is drawn from y = 120 to y = 152: over the first one at y = 150.
        model.setSlab(104, 5, 7, "parquet-clair");
        expect(levelUnderPoint(model, 170, 150)).toBe(104);
    });

    it("lays and removes slabs by rectangles, inside the map", () => {
        const model = new FloorModel();
        applySlabs(model, 52, { x: 38, y: 5 }, { x: 41, y: 6 }, "parquet-clair", BOUNDS);
        expect(model.getSlabs().map((slab) => [slab.x, slab.y])).toEqual([
            [38, 5],
            [38, 6],
            [39, 5],
            [39, 6],
        ]);
        eraseSlabs(model, 52, { x: 39, y: 5 }, { x: 39, y: 6 });
        expect(model.getSlabs().map((slab) => [slab.x, slab.y])).toEqual([
            [38, 5],
            [38, 6],
        ]);
    });

    it("cuts the well of a stair in the floor it reaches, and keeps it open", () => {
        const model = new FloorModel();
        applySlabs(model, 52, { x: 4, y: 2 }, { x: 7, y: 6 }, "parquet-clair", BOUNDS);
        expect(placeStair(model, north, { x: 5, y: 6 }, 0, BOUNDS)).toBe(true);
        expect(model.hasSlab(52, 5, 5)).toBe(false);
        expect(model.hasSlab(52, 5, 6)).toBe(false);
        expect(model.hasSlab(52, 5, 4)).toBe(true);
        expect(model.hasSlab(52, 6, 6)).toBe(true);
        // Laying the floor again over the whole rectangle leaves the well.
        applySlabs(model, 52, { x: 4, y: 2 }, { x: 7, y: 6 }, "parquet-clair", BOUNDS);
        expect(model.hasSlab(52, 5, 5)).toBe(false);
    });

    it("refuses a stair out of the map or over another stair of the same floor", () => {
        const model = new FloorModel();
        expect(canPlaceStair(model, north, { x: 5, y: 0 }, 0, BOUNDS)).toBe(false);
        expect(canPlaceStair(model, north, { x: 5, y: 6 }, 0, BOUNDS)).toBe(true);
        placeStair(model, north, { x: 5, y: 6 }, 0, BOUNDS);
        expect(canPlaceStair(model, { ...north, direction: "e" }, { x: 4, y: 5 }, 0, BOUNDS)).toBe(false);
        expect(canPlaceStair(model, { ...north, direction: "e" }, { x: 4, y: 5 }, 52, BOUNDS)).toBe(true);
    });

    it("removes a stair and closes its well with the floor around it", () => {
        const model = new FloorModel();
        applySlabs(model, 52, { x: 4, y: 2 }, { x: 7, y: 6 }, "moquette-olive", BOUNDS);
        placeStair(model, north, { x: 5, y: 6 }, 0, BOUNDS);
        expect(removeStairAt(model, 0, { x: 5, y: 5 })).toBe(true);
        expect(model.getStairs()).toEqual([]);
        expect(model.slabAt(52, 5, 5)).toBe("moquette-olive");
        expect(model.slabAt(52, 5, 6)).toBe("moquette-olive");
        expect(removeStairAt(model, 0, { x: 5, y: 5 })).toBe(false);
    });

    it("offers the floors of the walls of 2, 3 and 4, and the ones over the floors already there", () => {
        const model = new FloorModel();
        expect(availableLevels(model)).toEqual([52, 84, 116]);
        model.setSlab(52, 1, 1, "parquet-clair");
        expect(availableLevels(model)).toEqual([52, 84, 104, 116, 136, 168]);
    });
});
