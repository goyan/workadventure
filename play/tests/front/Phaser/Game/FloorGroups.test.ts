import { describe, expect, it } from "vitest";
import { floorGroups, nearestFloorGroup } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorGroups";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";

function slabs(model: FloorModel, elevation: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) model.setSlab(elevation, x, y, "parquet-clair");
}

describe("floorGroups", () => {
    it("makes one floor of the slabs of an altitude that touch each other", () => {
        const model = new FloorModel();
        slabs(model, 52, 2, 2, 4, 3);
        const groups = floorGroups(model);
        expect(groups).toHaveLength(1);
        expect(groups[0].level).toBe(52);
        expect(groups[0].cells).toHaveLength(6);
        expect(groups[0].key).toBe("52:2:2");
    });

    it("keeps apart the floors of two buildings at the same altitude, and the floors of two altitudes", () => {
        const model = new FloorModel();
        slabs(model, 52, 2, 2, 3, 3);
        // Another building, further east: not a slab in between.
        slabs(model, 52, 6, 2, 7, 3);
        // And a floor above the first one.
        slabs(model, 116, 2, 2, 3, 3);
        const groups = floorGroups(model);
        expect(groups.map((group) => group.key)).toEqual(["52:2:2", "52:6:2", "116:2:2"]);
        expect(groups.map((group) => group.cells.length)).toEqual([4, 4, 4]);
    });

    it("does not join two slabs that only touch by a corner", () => {
        const model = new FloorModel();
        model.setSlab(52, 2, 2, "parquet-clair");
        model.setSlab(52, 3, 3, "parquet-clair");
        expect(floorGroups(model)).toHaveLength(2);
    });
});

describe("nearestFloorGroup", () => {
    it("gives an object that stands over no slab the nearest floor of its altitude, not the first of the map", () => {
        const model = new FloorModel();
        // Two buildings with a floor at the same altitude; the first of the map is the western one.
        slabs(model, 52, 2, 5, 4, 6);
        slabs(model, 52, 20, 5, 22, 6);
        slabs(model, 116, 20, 4, 22, 4);
        const groups = floorGroups(model);
        // A shelf hung on the wall just north of the floor of the eastern building: the tile above its slabs.
        expect(nearestFloorGroup(groups, 52, { x: 21, y: 4 })?.key).toBe("52:20:5");
        expect(nearestFloorGroup(groups, 52, { x: 5, y: 9 })?.key).toBe("52:2:5");
        // Only the floors of its altitude count, and none is none.
        expect(nearestFloorGroup(groups, 116, { x: 3, y: 5 })?.key).toBe("116:20:4");
        expect(nearestFloorGroup(groups, 84, { x: 3, y: 5 })).toBeUndefined();
    });
});
