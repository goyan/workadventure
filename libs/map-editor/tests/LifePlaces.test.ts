import { describe, expect, it } from "vitest";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import type { Places } from "../src/Life/WaterBodies";
import { gridOf } from "./lifeHelpers";

describe("the water as a place of the life", () => {
    it("tells where an animal of a level may be, and how good a cell is", () => {
        const places: Places = waterBodiesOf(gridOf(["sd."]));
        expect(places.passable(0, 0, 8)).toBe(true);
        expect(places.passable(0, 0, 16)).toBe(false);
        expect(places.passable(1, 0, 16)).toBe(true);
        expect(places.passable(2, 0, 8)).toBe(false);
        expect(places.comfortAt(1, 0)).toBeGreaterThan(places.comfortAt(0, 0));
    });

    it("lets nothing cross a wall, nor leave the grid", () => {
        const places: Places = waterBodiesOf(gridOf(["ddd"], [[0, 0]]));
        expect(places.canCross(0, 0, 1, 0)).toBe(false);
        expect(places.canCross(1, 0, -1, 0)).toBe(false);
        expect(places.canCross(1, 0, 1, 0)).toBe(true);
        expect(places.canCross(2, 0, 1, 0)).toBe(false);
        expect(places.canCross(1, 0, 1, 1)).toBe(false);
    });
});
