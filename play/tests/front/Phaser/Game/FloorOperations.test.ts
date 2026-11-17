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
    reachableLevels,
    removeStairAt,
    stairArrivalCells,
    stairHasArrival,
    stairTarget,
    stairTargets,
    stepLevel,
    steppableLevels,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorOperations";
import type { StairShape } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

const BOUNDS = { columns: 40, rows: 40 };
const north: StairShape = { direction: "n", width: 1, rise: 52, open: false };

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
        placeStair(model, { direction: "o", width: 2, rise: 84, open: true }, { x: 9, y: 2 }, 0, BOUNDS);
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

    it("offers the floors of the walls of 2, 3 and 4, and the ones already on the map", () => {
        const model = new FloorModel();
        expect(availableLevels(model)).toEqual([52, 84, 116]);
        model.setSlab(104, 1, 1, "parquet-clair");
        expect(availableLevels(model)).toEqual([52, 84, 104, 116]);
        // The tops of walls standing on a floor are offered too: a floor over the floor.
        expect(availableLevels(new FloorModel(), [136, 52])).toEqual([52, 84, 116, 136]);
    });

    it("sends a stair to the floor asked, else to one that has slabs, else to the first in reach", () => {
        // From the top of walls of 2 tiles, the floors of the walls of 3 and 4 are in reach.
        expect(stairTarget([84, 116], [52, 116], 84)).toBe(84);
        // Nothing asked (or a floor out of reach): the floor that is built, not the first of the list.
        expect(stairTarget([84, 116], [52, 116], undefined)).toBe(116);
        expect(stairTarget([84, 116], [52, 116], 52)).toBe(116);
        expect(stairTarget([84, 116], [52], undefined)).toBe(84);
        expect(stairTarget([], [52], undefined)).toBeUndefined();
    });

    it("tells the tiles one steps onto at the top of a stair, and whether a slab is there", () => {
        const model = new FloorModel();
        // Going north from the tile (5, 6), 2 tiles of run: the top is the tile (5, 4).
        const up = model.addStair(north, { x: 5, y: 6 }, 0);
        expect(stairArrivalCells(up)).toEqual([{ x: 5, y: 4 }]);
        expect(stairHasArrival(model, up)).toBe(false);
        model.setSlab(52, 5, 4, "parquet-clair");
        expect(stairHasArrival(model, up)).toBe(true);
        // Going south (3 tiles of run from the tile (9, 3)), 2 tiles wide: the two tiles south of its last ones.
        const south = model.addStair({ direction: "s", width: 2, rise: 52, open: false }, { x: 9, y: 3 }, 0);
        expect(stairArrivalCells(south)).toEqual([
            { x: 9, y: 6 },
            { x: 10, y: 6 },
        ]);
        // East and west: the tiles beyond its top end, on its rows.
        const east = model.addStair({ direction: "e", width: 1, rise: 52, open: false }, { x: 20, y: 3 }, 0);
        expect(stairArrivalCells(east)).toEqual([{ x: 22, y: 3 }]);
        const west = model.addStair({ direction: "o", width: 1, rise: 52, open: false }, { x: 30, y: 3 }, 0);
        expect(stairArrivalCells(west)).toEqual([{ x: 28, y: 3 }]);
        // One slab among the tiles of the top is enough to step off.
        model.setSlab(52, 10, 6, "parquet-clair");
        expect(stairHasArrival(model, south)).toBe(true);
    });

    it("steps from a level to the next one up or down, the ground first, without going round", () => {
        const levels = [52, 84, 116];
        expect(stepLevel(levels, 0, 1)).toBe(52);
        expect(stepLevel(levels, 52, 1)).toBe(84);
        expect(stepLevel(levels, 116, 1)).toBe(116);
        expect(stepLevel(levels, 52, -1)).toBe(0);
        expect(stepLevel(levels, 0, -1)).toBe(0);
        // A level that is no longer offered: from the ground.
        expect(stepLevel(levels, 104, 1)).toBe(52);
    });

    it("lists the levels one steps through with Level + and Level -: one per tile above the walls of 2 tiles", () => {
        const levels = steppableLevels([52, 84, 104, 116]);
        // The tops of walls of 2, 3, 4 tiles, the levels of the map between them, then one more tile each time.
        expect(levels.slice(0, 6)).toEqual([52, 84, 104, 116, 148, 180]);
        expect(levels.at(-1)).toBe(372);
        expect(stepLevel(levels, 116, 1)).toBe(148);
        expect(stepLevel(levels, 52, -1)).toBe(0);
    });

    it("tells the floors a stair can reach from a floor", () => {
        const levels = [52, 84, 116];
        expect(reachableLevels(0, levels)).toEqual([52, 84, 116]);
        // From the top of walls of 2 tiles: 32 px up to the walls of 3, 64 px up to the walls of 4.
        expect(reachableLevels(52, levels)).toEqual([84, 116]);
        expect(reachableLevels(84, levels)).toEqual([116]);
        expect(reachableLevels(116, levels)).toEqual([]);
        // No stair goes up 20 px.
        expect(reachableLevels(84, [104, 116])).toEqual([116]);
    });

    it("offers a stair the levels one or two tiles up from any floor, built or not", () => {
        const levels = [52, 84, 116];
        // From the highest wall top, a stair still goes up: to the levels 5 and 6, whose slabs come after.
        expect(stairTargets(116, levels)).toEqual([148, 180]);
        expect(stairTargets(148, levels)).toEqual([180, 212]);
        // From the ground, only the tops of walls, as before.
        expect(stairTargets(0, levels)).toEqual([52, 84, 116]);
        // A level that walls standing on a floor give (116 + 52) is offered with them.
        expect(stairTargets(116, [...levels, 168])).toEqual([148, 168, 180]);
    });
});
