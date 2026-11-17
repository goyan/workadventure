import { describe, expect, it } from "vitest";
import {
    NO_BUILDING,
    buildingAt,
    buildingBounds,
    buildingSensorsWithSomebody,
    labelBuildings,
} from "../../../../../src/front/Phaser/Game/Switches/Buildings";

/** `#` is not outdoors (a room or a wall), `.` is outdoors. */
function grid(rows: string[]) {
    const cols = rows[0].length;
    return {
        cols,
        rows: rows.length,
        cellSize: 32,
        isOutdoorCell: (col: number, row: number) => rows[row]?.[col] !== "#",
    };
}

// Two buildings side by side, and a shed that only touches the first one by a corner.
const map = grid(["..........", ".###..###.", ".###..###.", ".###..###.", "....#.....", ".........."]);

describe("labelBuildings", () => {
    it("makes one building of the cells that are not outdoors and touch by a side", () => {
        const buildings = labelBuildings(map);
        const left = buildingAt(buildings, { x: 40, y: 40 });
        const right = buildingAt(buildings, { x: 6 * 32 + 5, y: 40 });
        expect(left).not.toBe(NO_BUILDING);
        expect(right).not.toBe(NO_BUILDING);
        expect(left).not.toBe(right);
        expect(buildingAt(buildings, { x: 3 * 32 + 31, y: 3 * 32 + 31 })).toBe(left);
    });

    it("keeps apart two buildings that only touch by a corner", () => {
        const buildings = labelBuildings(map);
        const shed = buildingAt(buildings, { x: 4 * 32 + 1, y: 4 * 32 + 1 });
        expect(shed).not.toBe(NO_BUILDING);
        expect(shed).not.toBe(buildingAt(buildings, { x: 40, y: 40 }));
    });

    it("is no building outdoors, nor out of the map", () => {
        const buildings = labelBuildings(map);
        expect(buildingAt(buildings, { x: 5, y: 5 })).toBe(NO_BUILDING);
        expect(buildingAt(buildings, { x: -10, y: 40 })).toBe(NO_BUILDING);
        expect(buildingAt(buildings, { x: 40, y: 9999 })).toBe(NO_BUILDING);
    });

    it("gives the rectangle around a building", () => {
        const buildings = labelBuildings(map);
        const right = buildingAt(buildings, { x: 6 * 32 + 5, y: 40 });
        expect(buildingBounds(buildings, right)).toEqual({ x: 6 * 32, y: 32, width: 3 * 32, height: 3 * 32 });
        expect(buildingBounds(buildings, NO_BUILDING)).toBeUndefined();
    });
});

describe("buildingSensorsWithSomebody", () => {
    const sensors = [
        { id: "left", building: 0 },
        { id: "right", building: 1 },
        { id: "outdoors", building: NO_BUILDING },
    ];

    it("is the sensors whose building holds my avatar or one of my animals", () => {
        expect(buildingSensorsWithSomebody(sensors, [0])).toEqual(["left"]);
        expect(buildingSensorsWithSomebody(sensors, [1, NO_BUILDING])).toEqual(["right"]);
        expect(buildingSensorsWithSomebody(sensors, [0, 1])).toEqual(["left", "right"]);
    });

    it("never fires for a sensor that stands outdoors, nor for somebody outdoors", () => {
        expect(buildingSensorsWithSomebody(sensors, [NO_BUILDING])).toEqual([]);
        expect(buildingSensorsWithSomebody(sensors, [])).toEqual([]);
    });
});
