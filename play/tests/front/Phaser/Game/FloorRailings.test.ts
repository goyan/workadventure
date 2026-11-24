import { describe, expect, it } from "vitest";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import {
    floorRailings,
    railingClosers,
    railingDepthY,
    railingShapes,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorRailings";
import type { RailingEdge } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorRailings";

function slabs(model: FloorModel, elevation: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) model.setSlab(elevation, x, y, "parquet-clair");
}
const sidesOf = (edges: RailingEdge[], x: number, y: number, level = 52): string =>
    edges
        .filter((edge) => edge.level === level && edge.x === x && edge.y === y)
        .map((edge) => edge.side)
        .sort()
        .join("");

describe("floorRailings", () => {
    it("rails the four sides of a lone slab, and no side shared by two slabs of the same floor", () => {
        const lone = new FloorModel();
        lone.setSlab(52, 5, 5, "parquet-clair");
        expect(sidesOf(floorRailings(lone), 5, 5)).toBe("enos");

        const pair = new FloorModel();
        slabs(pair, 52, 5, 5, 6, 5);
        const edges = floorRailings(pair);
        expect(sidesOf(edges, 5, 5)).toBe("nos");
        expect(sidesOf(edges, 6, 5)).toBe("ens");
    });

    it("rails the side of a slab next to a slab of another floor", () => {
        const model = new FloorModel();
        model.setSlab(52, 5, 5, "parquet-clair");
        model.setSlab(116, 6, 5, "parquet-clair");
        expect(sidesOf(floorRailings(model), 5, 5)).toBe("enos");
        expect(sidesOf(floorRailings(model), 6, 5, 116)).toBe("enos");
    });

    it("leaves the way open where a stair arrives, and rails the other sides of its well", () => {
        // A floor over x 2..4, y 4..6. A stair going north from the ground, foot on the tile (3, 8): it covers the
        // tiles (3, 7) and (3, 8) and arrives on the tile (3, 6), by its south side.
        const model = new FloorModel();
        slabs(model, 52, 2, 4, 4, 6);
        model.addStair({ direction: "n", width: 1, rise: 52, open: false }, { x: 3, y: 8 }, 0);
        const edges = floorRailings(model);
        expect(sidesOf(edges, 3, 6)).toBe("");
        expect(sidesOf(edges, 2, 6)).toBe("os");
        expect(sidesOf(edges, 4, 6)).toBe("es");
    });

    it("leaves both lanes of a stair two tiles wide open", () => {
        const model = new FloorModel();
        slabs(model, 52, 2, 4, 5, 6);
        model.addStair({ direction: "n", width: 2, rise: 52, open: false }, { x: 3, y: 8 }, 0);
        const edges = floorRailings(model);
        expect(sidesOf(edges, 3, 6)).toBe("");
        expect(sidesOf(edges, 4, 6)).toBe("");
        expect(sidesOf(edges, 2, 6)).toBe("os");
    });

    it("leaves the way open at the foot of a stair that goes up from the floor", () => {
        // A stair going east from the floor at 52 px: its first step is the tile (5, 5), reached from the tile (4, 5).
        const model = new FloorModel();
        slabs(model, 52, 2, 5, 4, 5);
        model.addStair({ direction: "e", width: 1, rise: 64, open: false }, { x: 5, y: 5 }, 52);
        expect(sidesOf(floorRailings(model), 4, 5)).toBe("ns");
    });

    it("puts no railing where a wall closes the side", () => {
        const model = new FloorModel();
        model.setSlab(52, 5, 5, "parquet-clair");
        // A wall along the north side of the slab.
        const closed = (level: number, from: { x: number; y: number }, to: { x: number; y: number }): boolean =>
            level === 52 && from.x === 5 && from.y === 5 && to.y === 4;
        expect(sidesOf(floorRailings(model, closed), 5, 5)).toBe("eos");
    });
});

describe("railingClosers", () => {
    // A horizontal wall between the tiles (5, 4) and (5, 5): along the north side of the tile (5, 5).
    const wall = (height: 1 | 2 | 3 | 4, base = 0) => ({ orientation: "h" as const, x: 5, y: 4, height, base });
    const north = [
        { x: 5, y: 5 },
        { x: 5, y: 4 },
    ] as const;

    it("closes the side of a floor along a wall standing on that floor", () => {
        expect(railingClosers([wall(1, 52)])(52, ...north)).toBe(true);
    });

    it("closes the side of a mezzanine along a wall of its room that rises above it", () => {
        // A floor at 52 px (the top of walls of 2) in a room whose walls are 4 tiles high.
        expect(railingClosers([wall(4)])(52, ...north)).toBe(true);
    });

    it("leaves a railing along a wall whose top is level with the floor, and along a lower one", () => {
        expect(railingClosers([wall(2)])(52, ...north)).toBe(false);
        expect(railingClosers([wall(1)])(52, ...north)).toBe(false);
    });

    it("does not close a side with a wall of a floor above", () => {
        expect(railingClosers([wall(2, 116)])(52, ...north)).toBe(false);
    });
});

describe("railingShapes and railingDepthY", () => {
    it("draws the railing of a floor its altitude further north, rising above the edge", () => {
        const south = railingShapes({ level: 52, x: 2, y: 3, side: "s" });
        // The south edge of the tile (2, 3) is at y = 4 * 32 = 128 on the ground, 76 on the screen.
        expect(south.find((shape) => shape.part === "glass")).toEqual({
            x: 64,
            y: 64,
            width: 32,
            height: 12,
            part: "glass",
        });
        const north = railingShapes({ level: 52, x: 2, y: 3, side: "n" });
        expect(north.find((shape) => shape.part === "glass")).toEqual({
            x: 64,
            y: 32,
            width: 32,
            height: 12,
            part: "glass",
        });
    });

    it("sorts a north railing behind whoever stands on its tile, the others in front", () => {
        // On the tile (2, 3) of a floor at 52 px, feet are drawn between y = 44 and y = 76.
        expect(railingDepthY({ level: 52, x: 2, y: 3, side: "n" })).toBeLessThan(44);
        for (const side of ["s", "e", "o"] as const) {
            expect(railingDepthY({ level: 52, x: 2, y: 3, side })).toBeGreaterThan(76);
        }
    });
});
