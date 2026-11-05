import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import {
    snapRectToFloors,
    snapRectToGrid,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAreaSnap";
import { MAP_LAYER_FLOOR_FAMILIES } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";

const family = MAP_LAYER_FLOOR_FAMILIES[0];

function room(model: MapLayerModel, x0: number, y0: number, w: number, h: number): void {
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) model.setFloor(x, y, family);
}

describe("area snap", () => {
    it("snaps to every tile the rectangle touches", () => {
        expect(snapRectToGrid({ x: 40, y: 10, width: 30, height: 20 })).toEqual({
            x: 32,
            y: 0,
            width: 64,
            height: 32,
        });
    });

    it("takes the size of the floor under a rectangle that spills over the walls", () => {
        const model = new MapLayerModel();
        room(model, 2, 2, 4, 3);
        expect(snapRectToFloors(model, { x: 0, y: 0, width: 400, height: 400 })).toEqual({
            x: 64,
            y: 64,
            width: 128,
            height: 96,
        });
    });

    it("keeps the grid outside of the floors, with or without floors on the map", () => {
        const model = new MapLayerModel();
        expect(snapRectToFloors(model, { x: 5, y: 5, width: 10, height: 10 })).toEqual({
            x: 0,
            y: 0,
            width: 32,
            height: 32,
        });
        room(model, 5, 5, 2, 2);
        // Outside of the rooms (grass), the area stays on the grid.
        expect(snapRectToFloors(model, { x: 0, y: 0, width: 40, height: 40 })).toEqual({
            x: 0,
            y: 0,
            width: 64,
            height: 64,
        });
    });
});
