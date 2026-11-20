import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { FloorModel, stairImagePosition } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import { buildHeightPicker } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerHeightEdit";
import { stairScreenBox } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
import type { StairShape } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
import {
    applyErase,
    erasePlan,
    eraseTargetUnder,
    stairImageUnderPoint,
    windowTargetUnder,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerTarget";
import type { TargetScene } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerTarget";

const north: StairShape = { direction: "n", width: 1, rise: 52, open: false };
const ramp: StairShape = { direction: "e", width: 1, rise: 20, open: true, ramp: true };

function sceneOf(walls: MapLayerModel, floors: FloorModel, level = 0): TargetScene {
    return { walls, picker: buildHeightPicker(walls), floors, level };
}

/** The box of a stair image on the screen. */
function stairBox(shape: StairShape, foot: { x: number; y: number }, base: number) {
    const image = stairImagePosition(shape, foot, base);
    const box = stairScreenBox(shape, foot);
    return { x: image.x, y: image.y, width: box.width, height: box.height };
}

describe("what the eraser of the map tool picks", () => {
    it("picks a whole stair, outlined by its image, even by the top of its image", () => {
        const floors = new FloorModel();
        floors.addStair(north, { x: 5, y: 10 }, 0);
        const box = stairBox(north, { x: 5, y: 10 }, 0);
        const target = eraseTargetUnder(sceneOf(new MapLayerModel(), floors), { x: box.x + 10, y: box.y + 2 });
        expect(target?.ref).toEqual({ kind: "stair", base: 0, foot: { x: 5, y: 10 } });
        expect(target?.outline).toEqual([box]);
    });

    it("picks a ramp of a bridge like a stair", () => {
        const floors = new FloorModel();
        floors.addStair(ramp, { x: 3, y: 4 }, 0);
        const box = stairBox(ramp, { x: 3, y: 4 }, 0);
        const target = eraseTargetUnder(sceneOf(new MapLayerModel(), floors), {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
        });
        expect(target?.ref).toEqual({ kind: "stair", base: 0, foot: { x: 3, y: 4 } });
        expect(target?.outline).toEqual([box]);
    });

    it("picks the stair that stands on a raised floor before the slab under it, and erasing it keeps the slab", () => {
        const floors = new FloorModel();
        for (let x = 2; x < 9; x++) for (let y = 2; y < 14; y++) floors.setSlab(52, x, y, "parquet-clair");
        floors.addStair(north, { x: 5, y: 10 }, 52);
        // The tile of its first step, on the floor 52: drawn 52 px further north.
        const point = { x: 5 * 32 + 10, y: 10 * 32 + 10 - 52 };
        const scene = sceneOf(new MapLayerModel(), floors, 52);
        expect(eraseTargetUnder(scene, point)?.ref).toEqual({ kind: "stair", base: 52, foot: { x: 5, y: 10 } });
        const plan = erasePlan(scene, point, point, []);
        applyErase(plan.refs, undefined, floors);
        expect(floors.getStairs()).toEqual([]);
        expect(floors.hasSlab(52, 5, 10)).toBe(true);
    });

    it("picks a slab of the floor edited, outlined where it is drawn", () => {
        const floors = new FloorModel();
        floors.setSlab(52, 4, 6, "parquet-clair");
        const target = eraseTargetUnder(sceneOf(new MapLayerModel(), floors, 52), {
            x: 4 * 32 + 5,
            y: 6 * 32 - 52 + 5,
        });
        expect(target?.ref).toEqual({ kind: "slab", level: 52, cell: { x: 4, y: 6 } });
        expect(target?.outline).toEqual([{ x: 128, y: 6 * 32 - 52, width: 32, height: 32 }]);
    });

    it("picks a high wall by its raised top, outlined by its whole image, never by a tile at its foot", () => {
        const walls = new MapLayerModel();
        for (let x = 0; x < 4; x++) walls.setWall("h", x, 3, "blanc", 3);
        const scene = sceneOf(walls, new FloorModel());
        // The facades of the line 3 are drawn from y = 32 (raised by 64) to their foot at y = 128.
        const target = eraseTargetUnder(scene, { x: 40, y: 40 });
        expect(target?.ref).toEqual({ kind: "wall", edge: { orientation: "h", x: 1, y: 3 } });
        expect(target?.outline).toEqual(scene.picker.rects([{ kind: "wall", edge: { orientation: "h", x: 1, y: 3 } }]));
        expect(target?.outline.some((rect) => rect.y < 96)).toBe(true);
    });

    it("picks a window before its wall, by its lintel too", () => {
        const walls = new MapLayerModel();
        for (let x = 2; x < 6; x++) walls.setWall("h", x, 3, "gris", 2);
        walls.setWindow(4, 3, 1);
        const scene = sceneOf(walls, new FloorModel());
        const pane = { kind: "window", edge: { orientation: "h", x: 4, y: 3 } };
        expect(eraseTargetUnder(scene, { x: 4 * 32 + 10, y: 110 })?.ref).toEqual(pane);
        expect(eraseTargetUnder(scene, { x: 4 * 32 + 10, y: 70 })?.ref).toEqual(pane);
        expect(windowTargetUnder(scene, { x: 4 * 32 + 10, y: 70 })?.ref).toEqual(pane);
    });

    it("picks a door before its wall", () => {
        const walls = new MapLayerModel();
        for (let x = 0; x < 4; x++) walls.setWall("h", x, 2, "blanc");
        walls.setDoor({ orientation: "h", x: 2, y: 2 });
        const target = eraseTargetUnder(sceneOf(walls, new FloorModel()), { x: 40, y: 80 });
        expect(target?.ref).toMatchObject({ kind: "door", door: { orientation: "h", x: 2, y: 2 } });
        applyErase(target ? [target.ref] : [], walls, undefined);
        expect(walls.getDoorOn("h", 1, 2)).toBeUndefined();
        expect(walls.hasWall("h", 1, 2)).toBe(true);
    });

    it("picks a floor of the ground last, and nothing in the void", () => {
        const walls = new MapLayerModel();
        walls.setFloor(1, 4, "parquet-clair");
        const scene = sceneOf(walls, new FloorModel());
        expect(eraseTargetUnder(scene, { x: 40, y: 140 })?.ref).toEqual({ kind: "floor", cell: { x: 1, y: 4 } });
        expect(eraseTargetUnder(scene, { x: 200, y: 200 })).toBeUndefined();
    });
});

describe("what an eraser gesture of the map tool removes", () => {
    it("removes the slabs of a rectangle on a raised floor, and outlines only the slabs that are there", () => {
        const floors = new FloorModel();
        floors.setSlab(52, 2, 3, "parquet-clair");
        floors.setSlab(52, 3, 3, "parquet-clair");
        floors.setSlab(52, 9, 9, "parquet-clair");
        const scene = sceneOf(new MapLayerModel(), floors, 52);
        // From the void west of the slabs to the tile (4, 3), on the floor 52.
        const plan = erasePlan(scene, { x: 1 * 32 + 5, y: 3 * 32 - 52 + 5 }, { x: 4 * 32 + 5, y: 3 * 32 - 52 + 5 }, []);
        expect(plan.refs).toEqual([
            { kind: "slab", level: 52, cell: { x: 2, y: 3 } },
            { kind: "slab", level: 52, cell: { x: 3, y: 3 } },
        ]);
        expect(plan.outline).toHaveLength(2);
        applyErase(plan.refs, undefined, floors);
        expect(floors.getSlabs().map((slab) => [slab.x, slab.y])).toEqual([[9, 9]]);
    });

    it("removes the walls along the line of the wall it starts on, a high wall picked by its top too", () => {
        const walls = new MapLayerModel();
        for (let x = 0; x < 5; x++) walls.setWall("h", x, 3, "blanc", 3);
        const plan = erasePlan(sceneOf(walls, new FloorModel()), { x: 40, y: 40 }, { x: 110, y: 50 }, []);
        expect(plan.refs).toEqual([
            { kind: "wall", edge: { orientation: "h", x: 1, y: 3 } },
            { kind: "wall", edge: { orientation: "h", x: 2, y: 3 } },
            { kind: "wall", edge: { orientation: "h", x: 3, y: 3 } },
        ]);
    });

    it("removes the floors of the ground passed over, never the wall it crosses", () => {
        const walls = new MapLayerModel();
        walls.setWall("h", 1, 2, "blanc");
        for (const y of [2, 3, 4]) walls.setFloor(1, y, "parquet-clair");
        const plan = erasePlan(sceneOf(walls, new FloorModel()), { x: 40, y: 140 }, { x: 40, y: 100 }, []);
        expect(plan.refs).toEqual([
            { kind: "floor", cell: { x: 1, y: 4 } },
            { kind: "floor", cell: { x: 1, y: 3 } },
        ]);
    });
});

describe("a stair under a point, whatever the floor it starts from", () => {
    it("finds the stair whose image is under the point, the last placed first", () => {
        const floors = new FloorModel();
        floors.addStair(north, { x: 5, y: 10 }, 52);
        const box = stairBox(north, { x: 5, y: 10 }, 52);
        expect(stairImageUnderPoint(floors, box.x + 3, box.y + 3)?.base).toBe(52);
        expect(stairImageUnderPoint(floors, box.x - 3, box.y + 3)).toBeUndefined();
    });
});
