import { describe, expect, it } from "vitest";
import { bridgesOf } from "@workadventure/map-editor";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import {
    BRIDGE_HEIGHTS,
    layBridge,
    planBridge,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/BridgeBuilder";
import type { BridgeSpec } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/BridgeBuilder";
import {
    computeFloorPlacements,
    placeStair,
    stairHasArrival,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorOperations";

import {
    LOW_FLOOR_ELEVATION,
    floorElevation,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

const BOUNDS = { columns: 40, rows: 40 };
const wood = (from: { x: number; y: number }, to: { x: number; y: number }, width = 1): BridgeSpec => ({
    from,
    to,
    width,
    style: "wood",
    height: 20,
});

describe("a bridge laid in one gesture", () => {
    it("is as high as the low floor, or as walls of 2 tiles", () => {
        expect([...BRIDGE_HEIGHTS]).toEqual([LOW_FLOOR_ELEVATION, floorElevation(2)]);
    });

    it("goes east-west on the row of its start: a ramp at each end, a deck of sleepers between them", () => {
        const model = new FloorModel();
        expect(layBridge(model, wood({ x: 5, y: 10 }, { x: 12, y: 11 }), BOUNDS)).toBeUndefined();
        expect(model.getStairs().map((stair) => [stair.shape.direction, stair.foot.x, stair.foot.y])).toEqual([
            ["e", 5, 10],
            ["o", 12, 10],
        ]);
        expect(model.getStairs().every((stair) => stair.shape.ramp && stair.shape.rise === 20)).toBe(true);
        expect(
            model
                .getSlabs()
                .map((slab) => slab.x)
                .sort((a, b) => a - b),
        ).toEqual([6, 7, 8, 9, 10, 11]);
        expect(model.getSlabs().every((slab) => slab.y === 10 && slab.elevation === 20 && slab.family === "bois")).toBe(
            true,
        );
        expect(model.getStairs().every((stair) => stairHasArrival(model, stair))).toBe(true);
    });

    it("is laid the same from either end", () => {
        const there = new FloorModel();
        const back = new FloorModel();
        layBridge(there, wood({ x: 5, y: 10 }, { x: 12, y: 10 }), BOUNDS);
        layBridge(back, wood({ x: 12, y: 10 }, { x: 5, y: 10 }), BOUNDS);
        const keys = (model: FloorModel): string[] =>
            computeFloorPlacements(model)
                .map((item) => item.key)
                .sort();
        expect(keys(back)).toEqual(keys(there));
    });

    it("goes north-south along the longer side, the way up from the north one tile longer", () => {
        const model = new FloorModel();
        expect(layBridge(model, wood({ x: 8, y: 3 }, { x: 9, y: 12 }), BOUNDS)).toBeUndefined();
        expect(model.getStairs().map((stair) => [stair.shape.direction, stair.foot.x, stair.foot.y])).toEqual([
            ["s", 8, 3],
            ["n", 8, 12],
        ]);
        expect(
            model
                .getSlabs()
                .map((slab) => slab.y)
                .sort((a, b) => a - b),
        ).toEqual([5, 6, 7, 8, 9, 10, 11]);
        expect(model.getStairs().every((stair) => stairHasArrival(model, stair))).toBe(true);
    });

    it("is as wide as asked, centred on its start, its ways up side by side", () => {
        const plan = planBridge(wood({ x: 5, y: 10 }, { x: 12, y: 10 }, 5));
        if (plan === "tooShort") throw new Error("refused");
        expect(plan.deck).toEqual({ a: { x: 6, y: 8 }, b: { x: 11, y: 12 } });
        expect(
            plan.ways.filter((item) => item.shape.direction === "e").map((item) => [item.shape.width, item.foot.y]),
        ).toEqual([
            [2, 8],
            [2, 10],
            [1, 12],
        ]);
        const model = new FloorModel();
        expect(layBridge(model, wood({ x: 5, y: 10 }, { x: 12, y: 10 }, 5), BOUNDS)).toBeUndefined();
        expect(model.getSlabs()).toHaveLength(30);
        expect(model.getStairs().every((stair) => stairHasArrival(model, stair))).toBe(true);
    });

    it("of concrete is made of slabs of grey stone and full stairs, high on walls of 2 tiles when asked", () => {
        const model = new FloorModel();
        const spec: BridgeSpec = {
            from: { x: 5, y: 10 },
            to: { x: 14, y: 10 },
            width: 2,
            style: "concrete",
            height: 52,
        };
        expect(layBridge(model, spec, BOUNDS)).toBeUndefined();
        expect(model.getStairs().map((stair) => stair.shape)).toEqual([
            { direction: "e", width: 2, rise: 52, open: false },
            { direction: "o", width: 2, rise: 52, open: false },
        ]);
        // Each way up is 2 tiles long: the deck goes from 7 to 12.
        expect(model.getSlabs()).toHaveLength(12);
        expect(model.getSlabs().every((slab) => slab.family === "pierre-grise" && slab.elevation === 52)).toBe(true);
    });

    it("is refused whole when its ways up leave no room for a deck", () => {
        const model = new FloorModel();
        expect(layBridge(model, wood({ x: 5, y: 10 }, { x: 6, y: 10 }), BOUNDS)).toBe("tooShort");
        expect(layBridge(model, wood({ x: 5, y: 10 }, { x: 5, y: 10 }), BOUNDS)).toBe("tooShort");
        expect(layBridge(model, wood({ x: 5, y: 10 }, { x: 7, y: 10 }), BOUNDS)).toBeUndefined();
        expect(model.getSlabs()).toHaveLength(1);
    });

    it("is refused whole out of the map or over a stair of the ground, and lays nothing", () => {
        const model = new FloorModel();
        expect(layBridge(model, wood({ x: 35, y: 10 }, { x: 44, y: 10 }), BOUNDS)).toBe("blocked");
        expect(layBridge(model, wood({ x: 5, y: 0 }, { x: 12, y: 0 }, 3), BOUNDS)).toBe("blocked");
        placeStair(model, { direction: "n", width: 1, rise: 52, open: false }, { x: 12, y: 10 }, 0, BOUNDS);
        expect(layBridge(model, wood({ x: 5, y: 10 }, { x: 12, y: 10 }), BOUNDS)).toBe("blocked");
        expect(model.getSlabs()).toHaveLength(0);
        expect(model.getStairs()).toHaveLength(1);
    });

    it("is a bridge for the server: the tiles under its deck and its ramps are dry for what walks", () => {
        const model = new FloorModel();
        layBridge(model, wood({ x: 5, y: 10 }, { x: 12, y: 10 }, 2), BOUNDS);
        const entities = Object.fromEntries(
            computeFloorPlacements(model).map((item, index) => [
                `e${index}`,
                {
                    x: item.x,
                    y: item.y,
                    elevation: item.elevation,
                    prefabRef: { collectionName: item.collectionName, id: item.prefabId },
                    properties: [],
                },
            ]),
        );
        const bridges = bridgesOf({ entities });
        for (let x = 5; x <= 12; x++) {
            expect(bridges.tiles.has(`${x},10`)).toBe(true);
            expect(bridges.tiles.has(`${x},11`)).toBe(true);
        }
        expect(bridges.tiles.has("4,10")).toBe(false);
        expect(bridges.tiles.has("8,12")).toBe(false);
    });
});
