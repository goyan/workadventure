import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";

function wallRow(model: MapLayerModel, from: number, to: number, y: number): void {
    for (let x = from; x < to; x++) model.setWall("h", x, y, "blanc");
}

describe("window model", () => {
    it("sets a window on a horizontal wall", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 3, 2);
        expect(model.setWindow(1, 2)).toBe(true);
        expect(model.hasWindow(1, 2)).toBe(true);
        expect(Array.from(model.getWindows())).toEqual([{ orientation: "h", x: 1, y: 2 }]);
    });

    it("refuses a window without a horizontal wall, twice, or on a door", () => {
        const model = new MapLayerModel();
        expect(model.setWindow(0, 0)).toBe(false);
        model.setWall("v", 0, 0, "blanc");
        expect(model.setWindow(0, 0)).toBe(false);
        wallRow(model, 0, 4, 1);
        expect(model.setWindow(0, 1)).toBe(true);
        expect(model.setWindow(0, 1)).toBe(false);
        expect(model.setDoor({ orientation: "h", x: 3, y: 1 })).toBe(true);
        expect(model.canSetWindow(2, 1)).toBe(false);
        expect(model.setWindow(3, 1)).toBe(false);
    });

    it("refuses a door over a window", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 4, 1);
        model.setWindow(1, 1);
        expect(model.canSetDoor({ orientation: "h", x: 2, y: 1 })).toBe(false);
        expect(model.canSetDoor({ orientation: "h", x: 3, y: 1 })).toBe(true);
    });

    it("removes the window with its wall, and keeps the wall when the window is removed", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 2, 0);
        model.setWindow(0, 0);
        model.setWindow(1, 0);
        expect(model.removeWindow(0, 0)).toBe(true);
        expect(model.hasWall("h", 0, 0)).toBe(true);
        expect(model.hasWindow(0, 0)).toBe(false);
        model.removeWall("h", 1, 0);
        expect(model.hasWindow(1, 0)).toBe(false);
    });

    it("copies the windows with the model", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 2, 0);
        model.setWindow(0, 0);
        const copy = model.clone();
        expect(copy.hasWindow(0, 0)).toBe(true);
        copy.removeWindow(0, 0);
        expect(model.hasWindow(0, 0)).toBe(true);
    });
});
