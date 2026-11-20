import { describe, expect, it } from "vitest";
import { poolSoilCode, TERRAIN_CELL, withSoils } from "@workadventure/map-editor";
import { poolAt, poolShapeChanges, shapeCells, toggledLadders } from "@wa/front/Phaser/Game/Terrain/PoolShapes";

const at = (cellX: number, cellY: number) => ({ x: (cellX + 0.5) * TERRAIN_CELL, y: (cellY + 0.5) * TERRAIN_CELL });
const everywhere = () => true;

describe("PoolShapes", () => {
    it("takes every cell of a rectangle dragged either way, both corners included", () => {
        expect(shapeCells("rectangle", at(2, 3), at(0, 1)).sort()).toEqual(
            ["0,1", "1,1", "2,1", "0,2", "1,2", "2,2", "0,3", "1,3", "2,3"].sort(),
        );
    });

    it("leaves the corners out of an ellipse", () => {
        const cells = shapeCells("ellipse", at(0, 0), at(5, 5));
        expect(cells).toContain("2,0");
        expect(cells).toContain("0,2");
        expect(cells).not.toContain("0,0");
        expect(cells).not.toContain("5,5");
    });

    it("paints a pool on the allowed cells only, and leaves alone those already of that pool", () => {
        const code = poolSoilCode(1);
        const terrain = withSoils(undefined, new Map([["0,0", code]]));
        const changes = poolShapeChanges(terrain, ["0,0", "1,0", "2,0"], code, false, (x) => x !== 2);
        expect([...changes]).toEqual([["1,0", code]]);
    });

    it("erases only the cells of a pool, the ground around keeps its soil", () => {
        const terrain = withSoils(
            undefined,
            new Map([
                ["0,0", poolSoilCode(0)],
                ["1,0", 1],
            ]),
        );
        expect([...poolShapeChanges(terrain, ["0,0", "1,0"], 0, true, everywhere)]).toEqual([["0,0", 0]]);
    });

    it("picks a pool whole by a side, not the pool of another style beside it", () => {
        const terrain = withSoils(
            undefined,
            new Map([
                ["0,0", poolSoilCode(0)],
                ["1,0", poolSoilCode(0)],
                ["1,1", poolSoilCode(0)],
                ["2,1", poolSoilCode(2)],
                ["5,5", poolSoilCode(0)],
            ]),
        );
        const pool = poolAt(terrain, 0, 0);
        expect(pool?.style).toBe(0);
        expect(pool?.cells.sort()).toEqual(["0,0", "1,0", "1,1"]);
        expect(poolAt(terrain, 3, 3)).toBeUndefined();
    });

    it("puts a ladder on the top edge of the pool, in the column clicked, and takes it off with a second click", () => {
        const code = poolSoilCode(0);
        const terrain = withSoils(
            undefined,
            new Map([
                ["4,2", code],
                ["4,3", code],
                ["4,4", code],
            ]),
        );
        const placed = toggledLadders(terrain, 4, 4, ["9,9"]);
        expect(placed).toEqual(["9,9", "4,2"]);
        expect(toggledLadders(terrain, 4, 3, placed)).toEqual(["9,9"]);
        expect(toggledLadders(terrain, 0, 0, placed)).toBeUndefined();
    });
});
