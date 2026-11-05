import { describe, expect, it } from "vitest";
import {
    moveRectangle,
    resizeRectangle,
} from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/EntityShapeGeometry";

const bounds = { width: 64, height: 48 };
const rectangle = { x: 10, y: 10, width: 20, height: 10 };

describe("EntityShapeGeometry", () => {
    it("moves by whole pixels and stays inside the image", () => {
        expect(moveRectangle(rectangle, 3, -2, bounds)).toEqual({ x: 13, y: 8, width: 20, height: 10 });
        expect(moveRectangle(rectangle, 100, 100, bounds)).toEqual({ x: 44, y: 38, width: 20, height: 10 });
        expect(moveRectangle(rectangle, -100, -100, bounds)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
    });

    it("resizes from a corner without moving the opposite one", () => {
        expect(resizeRectangle(rectangle, "se", 5, 4, bounds)).toEqual({ x: 10, y: 10, width: 25, height: 14 });
        expect(resizeRectangle(rectangle, "nw", -4, -3, bounds)).toEqual({ x: 6, y: 7, width: 24, height: 13 });
    });

    it("resizes from an edge along its axis only", () => {
        expect(resizeRectangle(rectangle, "e", 5, 9, bounds)).toEqual({ x: 10, y: 10, width: 25, height: 10 });
        expect(resizeRectangle(rectangle, "n", 9, -5, bounds)).toEqual({ x: 10, y: 5, width: 20, height: 15 });
    });

    it("never goes below one pixel nor out of the image", () => {
        expect(resizeRectangle(rectangle, "w", 50, 0, bounds)).toEqual({ x: 29, y: 10, width: 1, height: 10 });
        expect(resizeRectangle(rectangle, "se", 100, 100, bounds)).toEqual({ x: 10, y: 10, width: 54, height: 38 });
    });
});
