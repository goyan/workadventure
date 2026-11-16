import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { computePlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyDoor,
    applyWalls,
    doorUnderPoint,
    eraseAt,
    lineWallEdges,
    modelFromPlacedPrefabs,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

const bounds = { columns: 20, rows: 20 };

function roomWithWall(): MapLayerModel {
    const model = new MapLayerModel();
    applyWalls(model, lineWallEdges({ x: 2, y: 5 }, { x: 12, y: 5 }), "gris", bounds);
    applyWalls(model, lineWallEdges({ x: 2, y: 5 }, { x: 2, y: 9 }), "gris", bounds);
    return model;
}

function named(model: MapLayerModel): string[] {
    return computePlacements(model)
        .filter((item) => item.collectionName === "Carte Portes")
        .map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`)
        .sort();
}

describe("glazed doors in the model", () => {
    it("keeps a horizontal door glazed, never a vertical one", () => {
        const model = roomWithWall();
        expect(model.setDoor({ orientation: "h", x: 5, y: 5, glazed: true })).toBe(true);
        expect(model.getDoorOn("h", 4, 5)?.glazed).toBe(true);
        expect(model.clone().getDoorOn("h", 4, 5)?.glazed).toBe(true);
        expect(model.setDoor({ orientation: "v", x: 2, y: 7, glazed: true })).toBe(true);
        expect(model.getDoorOn("v", 2, 7)?.glazed).toBeUndefined();
        expect(model.setDoor({ orientation: "h", x: 9, y: 5 })).toBe(true);
        expect(model.getDoorOn("h", 9, 5)?.glazed).toBeUndefined();
    });

    it("switches a placed horizontal door between plain and glazed, without touching a copy", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5 });
        model.setDoor({ orientation: "v", x: 2, y: 7 });
        const copy = model.clone();
        expect(model.setDoorGlazed({ orientation: "h", x: 5, y: 5 }, true)).toBe(true);
        expect(model.getDoorOn("h", 5, 5)?.glazed).toBe(true);
        expect(copy.getDoorOn("h", 5, 5)?.glazed).toBeUndefined();
        expect(model.setDoorGlazed({ orientation: "h", x: 5, y: 5 }, false)).toBe(true);
        expect(model.getDoorOn("h", 5, 5)?.glazed).toBeUndefined();
        expect(model.setDoorGlazed({ orientation: "h", x: 8, y: 5 }, true)).toBe(false);
        expect(model.setDoorGlazed({ orientation: "v", x: 2, y: 7 }, true)).toBe(false);
    });
});

describe("glazed doors on the map", () => {
    it("draws a glazed door with glazed pieces at the same place", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5, glazed: true });
        expect(named(model)).toEqual(["porte-h-gris-d-vitree@160,160", "porte-h-gris-g-vitree@128,160"]);
    });

    it("reads back plain and glazed doors side by side", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5, glazed: true });
        model.setDoor({ orientation: "h", x: 7, y: 5 });
        model.setDoor({ orientation: "v", x: 2, y: 7 });
        const placements = computePlacements(model);
        const rebuilt = modelFromPlacedPrefabs(placements);
        expect(rebuilt.getDoorOn("h", 5, 5)?.glazed).toBe(true);
        expect(rebuilt.getDoorOn("h", 7, 5)?.glazed).toBeUndefined();
        expect(
            computePlacements(rebuilt)
                .map((item) => item.key)
                .sort(),
        ).toEqual(placements.map((item) => item.key).sort());
    });

    it("erases a glazed door like a plain one: the wall comes back", () => {
        const model = roomWithWall();
        model.setDoor({ orientation: "h", x: 5, y: 5, glazed: true });
        eraseAt(model, 5 * 32 + 10, 5 * 32 + 20);
        expect(model.getDoorOn("h", 5, 5)).toBeUndefined();
        expect(model.hasWall("h", 4, 5)).toBe(true);
        expect(model.hasWall("h", 5, 5)).toBe(true);
    });

    it("places the chosen variant and finds the door under a point", () => {
        const model = roomWithWall();
        applyDoor(model, { orientation: "h", x: 5, y: 5, glazed: true }, bounds);
        expect(model.getDoorOn("h", 5, 5)?.glazed).toBe(true);
        expect(doorUnderPoint(model, 5 * 32 + 10, 5 * 32 + 20)).toMatchObject({ orientation: "h", x: 5, y: 5 });
        expect(doorUnderPoint(model, 9 * 32 + 10, 5 * 32 + 20)).toBeUndefined();
    });
});
