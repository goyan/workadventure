import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import {
    applyHeight,
    buildHeightPicker,
    selectionHeight,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerHeightEdit";
import type { HeightTarget } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerHeightEdit";

/** A horizontal wall of height 2 on the line 3, columns 2 to 5, with a window of height 1 on the column 4. */
function wallWithWindow(): MapLayerModel {
    const model = new MapLayerModel();
    for (let x = 2; x < 6; x++) model.setWall("h", x, 3, "gris", 2);
    model.setWindow(4, 3, 1);
    return model;
}

const wall = (x: number, y: number, orientation: "h" | "v" = "h"): HeightTarget => ({
    kind: "wall",
    edge: { orientation, x, y },
});
const pane = (x: number, y: number): HeightTarget => ({ kind: "window", edge: { orientation: "h", x, y } });

describe("height mode: what is under the pointer", () => {
    it("picks a high wall anywhere on its image, its raised top included", () => {
        const picker = buildHeightPicker(wallWithWindow());
        // The facade of (2, 3) is drawn from y = 64 (raised by 32) to its foot at y = 128.
        expect(picker.at(70, 70)).toEqual(wall(2, 3));
        expect(picker.at(70, 120)).toEqual(wall(2, 3));
        expect(picker.at(70, 60)).toBeUndefined();
    });

    it("picks the window on its pane and its wall on the lintel above it", () => {
        const picker = buildHeightPicker(wallWithWindow());
        expect(picker.at(4 * 32 + 10, 110)).toEqual(pane(4, 3));
        expect(picker.at(4 * 32 + 10, 70)).toEqual(wall(4, 3));
    });

    it("picks the element whose foot is the farthest south when several are under the pointer", () => {
        const model = new MapLayerModel();
        model.setWall("h", 2, 1, "blanc", 1);
        model.setWall("h", 2, 3, "gris", 4);
        // The wall of the line 1 is drawn on y 32 to 64; the wall of height 4 of the line 3 covers y 0 to 128.
        expect(buildHeightPicker(model).at(70, 40)).toEqual(wall(2, 3));
        model.setWall("h", 2, 3, "gris", 1);
        expect(buildHeightPicker(model).at(70, 40)).toEqual(wall(2, 1));
    });

    it("picks a high vertical wall on its raised strip", () => {
        const model = new MapLayerModel();
        model.setWall("v", 8, 2, "brique", 3);
        // The strip of the row 2 is drawn from y = 2 * 32 + 12 - 64 = 12, 12 px wide around x = 256.
        expect(buildHeightPicker(model).at(256, 20)).toEqual(wall(8, 2, "v"));
    });

    it("picks a horizontal door as a door, a vertical door as its two walls", () => {
        const model = new MapLayerModel();
        for (let x = 2; x < 6; x++) model.setWall("h", x, 3, "gris", 3);
        model.setDoor({ orientation: "h", x: 4, y: 3, height: 2 });
        model.setWall("v", 8, 2, "gris", 2);
        model.setWall("v", 8, 3, "gris", 2);
        model.setDoor({ orientation: "v", x: 8, y: 3 });
        const picker = buildHeightPicker(model);
        // The door of height 2 is drawn from y = 96 - 32 = 64, under its lintel down to y = 76.
        expect(picker.at(3 * 32 + 10, 90)).toEqual({ kind: "door", door: { orientation: "h", x: 4, y: 3 } });
        // The pieces of a vertical door are 64 px wide around their line, raised with their wall of 2 (bas: y 76 to 108).
        expect(picker.select(picker.at(256 - 20, 3 * 32 - 12))).toEqual([wall(8, 2, "v"), wall(8, 3, "v")]);
    });

    it("finds nothing in the void", () => {
        expect(buildHeightPicker(wallWithWindow()).at(400, 400)).toBeUndefined();
    });
});

describe("height mode: a drag along a wall", () => {
    it("selects the segments between the start and the end, with the window they carry", () => {
        const picker = buildHeightPicker(wallWithWindow());
        expect(picker.along({ x: 70, y: 70 }, { x: 5 * 32 + 10, y: 300 })).toEqual([
            wall(2, 3),
            wall(3, 3),
            wall(4, 3),
            pane(4, 3),
            wall(5, 3),
        ]);
        expect(picker.along({ x: 5 * 32 + 10, y: 110 }, { x: 3 * 32 + 5, y: 110 })).toEqual([
            wall(3, 3),
            wall(4, 3),
            pane(4, 3),
            wall(5, 3),
        ]);
    });

    it("selects the element under the pointer when it stays on it, nothing when it starts in the void", () => {
        const picker = buildHeightPicker(wallWithWindow());
        expect(picker.along({ x: 4 * 32 + 10, y: 110 }, { x: 4 * 32 + 12, y: 112 })).toEqual([pane(4, 3)]);
        expect(picker.along({ x: 400, y: 400 }, { x: 70, y: 70 })).toEqual([]);
    });

    it("follows a vertical wall", () => {
        const model = new MapLayerModel();
        for (let y = 1; y < 5; y++) model.setWall("v", 8, y, "gris", 1);
        const picker = buildHeightPicker(model);
        expect(picker.along({ x: 256, y: 32 + 20 }, { x: 300, y: 3 * 32 + 20 })).toEqual([
            wall(8, 1, "v"),
            wall(8, 2, "v"),
            wall(8, 3, "v"),
        ]);
    });

    it("draws the selection over the images of its elements", () => {
        const picker = buildHeightPicker(wallWithWindow());
        expect(picker.rects([wall(2, 3)])).toEqual([{ x: 58, y: 64, width: 38, height: 64 }]);
        expect(picker.rects([pane(4, 3)])).toEqual([{ x: 128, y: 96, width: 32, height: 32 }]);
        expect(picker.rects([wall(4, 3)])).toEqual([{ x: 128, y: 64, width: 32, height: 44 }]);
    });
});

describe("height mode: the height of a selection", () => {
    it("tells the common height, none for a mixed or an empty selection", () => {
        const model = wallWithWindow();
        expect(selectionHeight(model, [wall(2, 3), wall(3, 3)])).toBe(2);
        expect(selectionHeight(model, [pane(4, 3)])).toBe(1);
        expect(selectionHeight(model, [wall(4, 3), pane(4, 3)])).toBeUndefined();
        expect(selectionHeight(model, [])).toBeUndefined();
    });
});

describe("height mode: applying a height", () => {
    it("raises the walls, keeping their tint and the window they carry", () => {
        const model = wallWithWindow();
        applyHeight(model, [wall(3, 3), wall(4, 3)], 4);
        expect(model.getWall("h", 3, 3)).toMatchObject({ tint: "gris", height: 4 });
        expect(model.getWall("h", 4, 3)?.height).toBe(4);
        expect(model.getWall("h", 2, 3)?.height).toBe(2);
        expect(model.getWindowHeight(4, 3)).toBe(1);
    });

    it("lowers a window with its wall, and never lets it above its wall", () => {
        const model = wallWithWindow();
        applyHeight(model, [pane(4, 3)], 4);
        expect(model.getWindowHeight(4, 3)).toBe(2);
        applyHeight(model, [wall(4, 3)], 1);
        expect(model.getWindowHeight(4, 3)).toBe(1);
    });

    it("gives a wall and the window it carries the same height", () => {
        const model = wallWithWindow();
        applyHeight(model, [wall(4, 3), pane(4, 3)], 3);
        expect(model.getWall("h", 4, 3)?.height).toBe(3);
        expect(model.getWindowHeight(4, 3)).toBe(3);
    });

    it("sets the height of a horizontal door, at most the one of its walls", () => {
        const model = new MapLayerModel();
        for (let x = 2; x < 6; x++) model.setWall("h", x, 3, "gris", 2);
        model.setDoor({ orientation: "h", x: 4, y: 3 });
        const door: HeightTarget = { kind: "door", door: { orientation: "h", x: 4, y: 3 } };
        applyHeight(model, [door], 3);
        expect(model.getDoorOn("h", 3, 3)?.height).toBe(2);
        applyHeight(model, [wall(3, 3), wall(4, 3), door], 4);
        expect(model.getDoorOn("h", 3, 3)?.height).toBe(4);
        applyHeight(model, [door], 1);
        expect(model.getDoorOn("h", 3, 3)?.height).toBe(1);
        expect(model.getWall("h", 3, 3)?.height).toBe(4);
    });

    it("ignores what is no longer on the map", () => {
        const model = wallWithWindow();
        applyHeight(model, [wall(9, 9), pane(2, 3), { kind: "door", door: { orientation: "h", x: 3, y: 3 } }], 3);
        expect(Array.from(model.getWalls(), (edge) => edge.height)).toEqual([2, 2, 2, 2]);
        expect(model.getWindowHeight(2, 3)).toBeUndefined();
    });
});
