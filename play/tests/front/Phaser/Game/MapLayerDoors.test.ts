import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { wallBarriers } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerBarriers";
import { computePlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyDoor,
    applyFloor,
    applyWalls,
    doorCandidateAt,
    eraseAt,
    floodFillCells,
    lineWallEdges,
    modelFromPlacedPrefabs,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

const bounds = { columns: 20, rows: 20 };

function roomWithWall(): MapLayerModel {
    const model = new MapLayerModel();
    applyWalls(model, lineWallEdges({ x: 2, y: 5 }, { x: 8, y: 5 }), "gris", bounds);
    return model;
}

function placed(model: MapLayerModel) {
    return computePlacements(model).map((item) => ({
        x: item.x,
        y: item.y,
        collectionName: item.collectionName,
        prefabId: item.prefabId,
    }));
}

describe("doors", () => {
    it("replaces two wall segments by two door pieces and no joint on the middle vertex", () => {
        const model = roomWithWall();
        expect(model.setDoor({ orientation: "h", x: 5, y: 5 })).toBe(true);
        const items = computePlacements(model).map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`);
        expect(items).toContain("porte-h-gris-g@128,160");
        expect(items).toContain("porte-h-gris-d@160,160");
        expect(items.filter((item) => item.startsWith("facade-"))).toHaveLength(4);
        expect(items).not.toContain("raccord-EW@154,160");
    });

    it("refuses a door without a wall under it or over another door", () => {
        const model = roomWithWall();
        expect(model.setDoor({ orientation: "h", x: 1, y: 5 })).toBe(false);
        expect(model.setDoor({ orientation: "h", x: 4, y: 5 })).toBe(true);
        expect(model.setDoor({ orientation: "h", x: 5, y: 5 })).toBe(false);
        expect(model.setDoor({ orientation: "h", x: 6, y: 5 })).toBe(true);
    });

    it("is rebuilt from its entities, walls included", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        const rebuilt = modelFromPlacedPrefabs(placed(model));
        expect([...rebuilt.getDoors()]).toEqual([{ orientation: "h", x: 5, y: 5 }]);
        expect(rebuilt.hasWall("h", 4, 5)).toBe(true);
        expect(
            placed(rebuilt)
                .map((item) => item.prefabId)
                .sort(),
        ).toEqual(
            placed(model)
                .map((item) => item.prefabId)
                .sort(),
        );
    });

    it("round-trips a vertical door", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 4, y: 2 }, { x: 4, y: 8 }), "blanc", bounds);
        model.setDoor({ orientation: "v", x: 4, y: 5 });
        const items = computePlacements(model).map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`);
        expect(items).toContain("porte-v-blanc-haut@96,140");
        expect(items).toContain("porte-v-blanc-bas@96,172");
        const rebuilt = modelFromPlacedPrefabs(placed(model));
        expect([...rebuilt.getDoors()]).toEqual([{ orientation: "v", x: 4, y: 5 }]);
    });

    it("lets everyone through the door for the pathfinder, but not through the wall next to it", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        const barriers = wallBarriers(placed(model));
        expect(barriers.blocksMove({ x: 4, y: 5 }, { x: 4, y: 6 })).toBe(false);
        expect(barriers.blocksMove({ x: 5, y: 5 }, { x: 5, y: 6 })).toBe(false);
        expect(barriers.blocksMove({ x: 2, y: 5 }, { x: 2, y: 6 })).toBe(true);
    });

    it("gives the door the floor of the room, and keeps the floor it already has", () => {
        const model = roomWithWall();
        applyFloor(
            model,
            [
                { x: 4, y: 6 },
                { x: 5, y: 6 },
            ],
            "parquet-clair",
            bounds,
        );
        applyFloor(model, [{ x: 5, y: 5 }], "pierre-grise", bounds);
        applyDoor(model, { orientation: "h", x: 5, y: 5 }, bounds);
        expect(model.getFloor(4, 5)?.family).toBe("parquet-clair");
        expect(model.getFloor(5, 5)?.family).toBe("pierre-grise");
    });

    it("keeps the two sides apart when filling", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 0, y: 5 }, { x: 10, y: 5 }), "gris", bounds);
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        const north = floodFillCells(model, { x: 5, y: 2 }, { columns: 10, rows: 10 }, "carrelage-gris");
        expect(north?.some((cell) => cell.y >= 5)).toBe(false);
    });

    it("erases the door first and leaves the walls as they were, even in one drag", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        const kept = new Set<string>();
        for (let i = 0; i < 4; i++) eraseAt(model, 5 * 32 - 10 + i, 5 * 32 + 20, kept);
        expect([...model.getDoors()]).toEqual([]);
        expect(model.hasWall("h", 4, 5)).toBe(true);
        expect(model.hasWall("h", 5, 5)).toBe(true);
        eraseAt(model, 5 * 32 + 10, 5 * 32 + 20);
        expect(model.hasWall("h", 5, 5)).toBe(false);
    });

    it("drops the door when one of its walls is removed", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        model.removeWall("h", 4, 5);
        expect([...model.getDoors()]).toEqual([]);
    });

    it("centers the candidate on the cursor and tells whether it fits", () => {
        const model = roomWithWall();
        expect(doorCandidateAt(model, 5 * 32 + 3, 5 * 32 + 20)).toEqual({ orientation: "h", x: 5, y: 5, valid: true });
        expect(doorCandidateAt(model, 2 * 32 + 3, 5 * 32 + 20).valid).toBe(false);
        expect(doorCandidateAt(model, 5 * 32, 9 * 32).valid).toBe(false);
    });
});
