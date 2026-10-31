import { describe, expect, it } from "vitest";
import {
    doorPrefabName,
    mapLayerPrefabId,
    parseMapLayerPrefab,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { wallBarriers } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerBarriers";
import { computePlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyDoor,
    applyFloor,
    applyWalls,
    doorCandidateAt,
    doorPixelRect,
    eraseAt,
    eraseTargetAt,
    floodFillCells,
    lineWallEdges,
    rectangleCells,
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

describe("door prefabs", () => {
    it("reads the frames of both swing directions and ignores the invalid ones", () => {
        const read = (name: string) => parseMapLayerPrefab("Carte Portes", mapLayerPrefabId("Carte Portes", name));
        expect(read("porte-h-gris-g")).toMatchObject({ orientation: "h", side: "g", frame: 7, reverse: false });
        expect(read("porte-h-gris-g-3")).toMatchObject({ frame: 3, reverse: false });
        expect(read("porte-v-brique-bas-b5")).toMatchObject({ orientation: "v", side: "bas", frame: 5, reverse: true });
        expect(read("porte-h-gris-g-7")).toBeUndefined();
        expect(read("porte-h-gris-haut")).toBeUndefined();
        expect(doorPrefabName("v", "gris", "haut", 2, true)).toBe("porte-v-gris-haut-b2");
        expect(doorPrefabName("v", "gris", "haut", 7, true)).toBe("porte-v-gris-haut");
    });
});

describe("doors", () => {
    it("replaces two wall segments by two door pieces and no joint on the middle vertex", () => {
        const model = roomWithWall();
        expect(model.setDoor({ orientation: "h", x: 5, y: 5 })).toBe(true);
        const items = computePlacements(model).map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`);
        expect(items).toContain("porte-h-gris-g@128,160");
        expect(items).toContain("porte-h-gris-d@160,160");
        expect(items.filter((item) => item.startsWith("facade-"))).toHaveLength(4);
        expect(items).not.toContain("raccord-EW@154,160");
        // The walls go on up to the door, which draws the ends of the wall: no cap above it, no end or joint next to it.
        expect(items).toContain("facade-gris-left@58,160");
        expect(items).toContain("facade-gris-mid@96,160");
        expect(items).toContain("facade-gris-mid@192,160");
        expect(items).toContain("facade-gris-right@224,160");
        expect(items.some((item) => item.startsWith("raccord-") && item.endsWith("@122,160"))).toBe(false);
        expect(items.some((item) => item.startsWith("raccord-") && item.endsWith("@186,160"))).toBe(false);
    });

    it("does not shade the floor in front of a horizontal door, but still shades it behind the wall around", () => {
        const model = roomWithWall();
        applyFloor(model, rectangleCells({ x: 2, y: 5 }, { x: 7, y: 6 }), "moquette-grise", bounds);
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        const floors = computePlacements(model)
            .filter((item) => item.prefabId.includes("sol-"))
            .map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`);
        // The door stands on the segments 4 and 5 (tiles 4 and 5); tiles 2, 3, 6 and 7 stay under the wall.
        expect(floors).toContain("sol-moquette-grise-ombre@64,192");
        expect(floors).toContain("sol-moquette-grise-uni@128,192");
        expect(floors).toContain("sol-moquette-grise-uni@160,192");
        expect(floors).toContain("sol-moquette-grise-ombre@192,192");
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

    it("keeps the pathfinder to the first row of a vertical door, the middle of the way through it", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 4, y: 2 }, { x: 4, y: 9 }), "blanc", bounds);
        model.setDoor({ orientation: "v", x: 4, y: 5 });
        const barriers = wallBarriers(placed(model));
        // The door is on the segments 4 and 5, which block the rows 5 and 6 of the feet: only the first one is open.
        expect(barriers.blocksMove({ x: 3, y: 4 }, { x: 4, y: 4 })).toBe(true);
        expect(barriers.blocksMove({ x: 3, y: 5 }, { x: 4, y: 5 })).toBe(false);
        expect(barriers.blocksMove({ x: 3, y: 6 }, { x: 4, y: 6 })).toBe(true);
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

    it("tells that a door was erased, and what the eraser would remove under the cursor", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        expect(eraseTargetAt(model, 5 * 32 + 3, 5 * 32 + 20)).toEqual({
            kind: "door",
            door: { orientation: "h", x: 5, y: 5 },
        });
        expect(eraseTargetAt(model, 2 * 32 + 3, 5 * 32 + 20)).toMatchObject({ kind: "wall" });
        expect(eraseTargetAt(model, 2 * 32 + 3, 8 * 32)).toBeUndefined();
        applyFloor(model, [{ x: 2, y: 8 }], "parquet-clair", bounds);
        expect(eraseTargetAt(model, 2 * 32 + 3, 8 * 32 + 5)).toEqual({ kind: "floor", cell: { x: 2, y: 8 } });
        expect(eraseAt(model, 5 * 32 + 3, 5 * 32 + 20)).toBe(true);
        expect(eraseAt(model, 2 * 32 + 3, 5 * 32 + 20)).toBe(false);
    });

    it("highlights a door over its opening, not over the swing of its leaves", () => {
        expect(doorPixelRect({ orientation: "h", x: 5, y: 5 })).toEqual({ x: 128, y: 160, width: 64, height: 32 });
        expect(doorPixelRect({ orientation: "v", x: 4, y: 5 })).toEqual({ x: 122, y: 140, width: 12, height: 52 });
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
