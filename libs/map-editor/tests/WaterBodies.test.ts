import { describe, expect, it } from "vitest";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX, waterBodiesOf } from "../src/Life/WaterBodies";
import { gridOf, scripted } from "./lifeHelpers";

describe("waterBodiesOf", () => {
    it("tells two ponds apart when dry ground lies between them", () => {
        const bodies = waterBodiesOf(gridOf(["ss.ss", "ss.ss"]));
        expect(bodies.bodyAt(0, 0)).toBeGreaterThan(0);
        expect(bodies.bodyAt(4, 1)).toBeGreaterThan(0);
        expect(bodies.bodyAt(0, 0)).not.toBe(bodies.bodyAt(4, 1));
        expect(bodies.bodyAt(2, 0)).toBe(0);
        expect(bodies.sizes[bodies.bodyAt(0, 0)].cells).toBe(4);
    });

    it("joins two ponds by a channel deep enough for a fish, not by a thinner one", () => {
        const joined = waterBodiesOf(gridOf(["ss.ss", "sssss"]));
        expect(joined.bodyAt(0, 0)).toBe(joined.bodyAt(4, 0));
        expect(joined.sizes[joined.bodyAt(0, 0)].cells).toBe(9);
        const apart = waterBodiesOf(gridOf(["ss.ss", "sstss"]));
        expect(apart.bodyAt(0, 0)).not.toBe(apart.bodyAt(4, 0));
        expect(apart.bodyAt(2, 1)).toBe(0);
    });

    it("stops at a wall between two wet cells", () => {
        const bodies = waterBodiesOf(gridOf(["ssss"], [[1, 0]]));
        expect(bodies.bodyAt(1, 0)).not.toBe(bodies.bodyAt(2, 0));
    });

    it("counts the deep cells of a body, where a dolphin swims", () => {
        const bodies = waterBodiesOf(gridOf(["sdds", "sdds"]));
        expect(bodies.sizes[bodies.bodyAt(0, 0)]).toEqual({ cells: 8, deep: 4 });
        expect(bodies.swimmable(1, 0, DOLPHIN_DEPTH_PX)).toBe(true);
        expect(bodies.swimmable(0, 0, DOLPHIN_DEPTH_PX)).toBe(false);
        expect(bodies.swimmable(0, 0, FISH_DEPTH_PX)).toBe(true);
        expect(bodies.swimmable(-5, 0, FISH_DEPTH_PX)).toBe(false);
    });

    it("draws a random cell of the same body only, close by and deep enough", () => {
        const bodies = waterBodiesOf(gridOf(["sds.sss", "sds.sss"]));
        const body = bodies.bodyAt(0, 0);
        const random = scripted();
        for (let draw = 0; draw < 200; draw++) {
            const cell = bodies.randomCell(body, { cellX: 2, cellY: 0 }, 6, FISH_DEPTH_PX, random);
            expect(cell && bodies.bodyAt(cell.cellX, cell.cellY)).toBe(body);
            const deep = bodies.randomCell(body, { cellX: 2, cellY: 0 }, 6, DOLPHIN_DEPTH_PX, random);
            expect(deep?.cellX).toBe(1);
        }
        expect(bodies.randomCell(body, { cellX: 60, cellY: 60 }, 2, FISH_DEPTH_PX, random)).toBeUndefined();
    });
});
