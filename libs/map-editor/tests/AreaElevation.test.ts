import { describe, expect, it } from "vitest";
import type { WAMFileFormat } from "../src/types";
import { AreaData } from "../src/types";
import { GameMapAreas, isAtAreaLevel } from "../src/GameMap/GameMapAreas";

const area: AreaData = { id: "a", x: 0, y: 0, width: 64, height: 64, visible: true, name: "", properties: [] };

function areasOf(...areas: AreaData[]): GameMapAreas {
    return new GameMapAreas({ areas, entities: {}, entityCollections: [] } as unknown as WAMFileFormat);
}

describe("AreaData.elevation", () => {
    it("is kept for an area of a raised floor, and absent for an area of a map saved before the floors", () => {
        expect(AreaData.parse({ ...area, elevation: 52 }).elevation).toBe(52);
        expect(AreaData.parse(area).elevation).toBeUndefined();
    });

    it("refuses an altitude under the ground or between two pixels", () => {
        expect(AreaData.safeParse({ ...area, elevation: -1 }).success).toBe(false);
        expect(AreaData.safeParse({ ...area, elevation: 51.5 }).success).toBe(false);
    });
});

describe("isAtAreaLevel", () => {
    it("holds on the floor of the area only, two floors being at least 12 px apart", () => {
        expect(isAtAreaLevel(area, 0)).toBe(true);
        expect(isAtAreaLevel(area, 52)).toBe(false);
        expect(isAtAreaLevel({ elevation: 104 }, 104)).toBe(true);
        expect(isAtAreaLevel({ elevation: 104 }, 116)).toBe(false);
        // Halfway up a stair: on no floor.
        expect(isAtAreaLevel(area, 24)).toBe(false);
        expect(isAtAreaLevel({ elevation: 52 }, 24)).toBe(false);
    });
});

describe("GameMapAreas on a map with floors", () => {
    const ground: AreaData = { ...area, id: "ground" };
    const upstairs: AreaData = { ...area, id: "upstairs", elevation: 52 };

    it("only finds the areas of the floor of a position, the ground without altitude", () => {
        const areas = areasOf(ground, upstairs);
        expect(areas.getAreasOnPosition({ x: 10, y: 10 }).map(({ id }) => id)).toEqual(["ground"]);
        expect(areas.getAreasOnPosition({ x: 10, y: 10, z: 52 }).map(({ id }) => id)).toEqual(["upstairs"]);
        expect(areas.getAreasOnPosition({ x: 10, y: 10, z: 24 })).toEqual([]);
        expect(areas.isPlayerInsideArea("ground", { x: 10, y: 10, z: 52 })).toBe(false);
    });

    it("leaves the area of the ground and enters the one of the floor when only the altitude changes", () => {
        const areas = areasOf(ground, upstairs);
        const entered: string[] = [];
        const left: string[] = [];
        areas.onEnterArea((changed) => entered.push(...changed.map(({ id }) => id)));
        areas.onLeaveArea((changed) => left.push(...changed.map(({ id }) => id)));

        expect(areas.triggerAreasChange({ x: 10, y: 10, z: 0 }, { x: 10, y: 10, z: 52 })).toBe(true);
        expect(left).toEqual(["ground"]);
        expect(entered).toEqual(["upstairs"]);
    });
});
