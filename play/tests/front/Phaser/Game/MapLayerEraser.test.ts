import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import {
    ERASER_VERTICAL_HIT_WIDTH,
    eraseFloorsAlong,
    eraseTargetAt,
    eraseWallsAlong,
    wallEdgesToErase,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

/** A horizontal wall on the line 2 (its facades fill the tile row 2, y 64 to 96), segments 0 to 4, with floors under. */
function room(): MapLayerModel {
    const model = new MapLayerModel();
    for (let x = 0; x < 5; x++) {
        model.setWall("h", x, 2, "blanc");
        for (let y = 2; y < 5; y++) model.setFloor(x, y, "parquet-clair");
    }
    // A vertical wall on the line x = 6, segments 2 to 4.
    for (let y = 2; y < 5; y++) model.setWall("v", 6, y, "gris");
    return model;
}

describe("the walls a wall eraser drag removes", () => {
    it("follows the row of the horizontal wall it starts on, from the start tile to the end tile", () => {
        const model = room();
        // From segment 1 to segment 3, the end drifting off the row: still the row of the start.
        expect(wallEdgesToErase(model, { x: 40, y: 80 }, { x: 110, y: 150 })).toEqual([
            { orientation: "h", x: 1, y: 2 },
            { orientation: "h", x: 2, y: 2 },
            { orientation: "h", x: 3, y: 2 },
        ]);
    });

    it("follows the column of the vertical wall it starts on, and skips the segments without a wall", () => {
        const model = room();
        expect(wallEdgesToErase(model, { x: 6 * 32 + 3, y: 2 * 32 + 20 }, { x: 6 * 32 - 20, y: 7 * 32 })).toEqual([
            { orientation: "v", x: 6, y: 2 },
            { orientation: "v", x: 6, y: 3 },
            { orientation: "v", x: 6, y: 4 },
        ]);
    });

    it("starts nowhere on a floor: that drag erases floors", () => {
        expect(wallEdgesToErase(room(), { x: 40, y: 130 }, { x: 110, y: 130 })).toBeUndefined();
    });

    it("hits a vertical wall up to 10 px on each side of its line", () => {
        const model = room();
        expect(ERASER_VERTICAL_HIT_WIDTH).toBe(10);
        expect(wallEdgesToErase(model, { x: 6 * 32 + 10, y: 3 * 32 + 20 }, { x: 6 * 32 + 10, y: 3 * 32 + 20 })).toEqual(
            [{ orientation: "v", x: 6, y: 3 }],
        );
        expect(eraseTargetAt(model, 6 * 32 - 10, 3 * 32 + 20, ERASER_VERTICAL_HIT_WIDTH)).toEqual({
            kind: "wall",
            wall: { orientation: "v", x: 6, y: 3 },
        });
        expect(
            wallEdgesToErase(model, { x: 6 * 32 + 13, y: 3 * 32 + 20 }, { x: 6 * 32 + 13, y: 3 * 32 + 20 }),
        ).toBeUndefined();
    });
});

describe("erasing along a drag", () => {
    it("removes the walls of the line with their doors and windows, never a floor", () => {
        const model = room();
        model.setWindow(1, 2);
        model.setDoor({ orientation: "h", x: 3, y: 2 });
        eraseWallsAlong(model, { x: 40, y: 80 }, { x: 140, y: 80 });
        for (const x of [1, 2, 3, 4]) expect(model.hasWall("h", x, 2)).toBe(false);
        expect(model.hasWall("h", 0, 2)).toBe(true);
        expect(model.hasWindow(1, 2)).toBe(false);
        expect(model.getDoorOn("h", 2, 2)).toBeUndefined();
        for (let x = 0; x < 5; x++) expect(model.getFloor(x, 2)).toBeDefined();
    });

    it("removes only the floors a floor drag passes over, never a wall it crosses", () => {
        const model = room();
        eraseFloorsAlong(model, { x: 40, y: 130 }, { x: 40, y: 40 }, [
            { x: 1, y: 4 },
            { x: 1, y: 3 },
        ]);
        expect(model.getFloor(1, 4)).toBeUndefined();
        expect(model.getFloor(1, 3)).toBeUndefined();
        expect(model.hasWall("h", 1, 2)).toBe(true);
        expect(model.getFloor(0, 3)).toBeDefined();
    });
});
