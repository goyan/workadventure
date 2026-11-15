import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { computePlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyWindows,
    eraseAt,
    eraseTargetAt,
    modelFromPlacedPrefabs,
    windowEdgesBetween,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

function wallRow(model: MapLayerModel, from: number, to: number, y: number): void {
    for (let x = from; x < to; x++) model.setWall("h", x, y, "blanc");
}

describe("window model", () => {
    it("sets a window on a horizontal wall", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 3, 2);
        expect(model.setWindow(1, 2)).toBe(true);
        expect(model.hasWindow(1, 2)).toBe(true);
        expect(Array.from(model.getWindows())).toEqual([{ orientation: "h", x: 1, y: 2 }]);
    });

    it("refuses a window without a horizontal wall, twice, or on a door", () => {
        const model = new MapLayerModel();
        expect(model.setWindow(0, 0)).toBe(false);
        model.setWall("v", 0, 0, "blanc");
        expect(model.setWindow(0, 0)).toBe(false);
        wallRow(model, 0, 4, 1);
        expect(model.setWindow(0, 1)).toBe(true);
        expect(model.setWindow(0, 1)).toBe(false);
        expect(model.setDoor({ orientation: "h", x: 3, y: 1 })).toBe(true);
        expect(model.canSetWindow(2, 1)).toBe(false);
        expect(model.setWindow(3, 1)).toBe(false);
    });

    it("refuses a door over a window", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 4, 1);
        model.setWindow(1, 1);
        expect(model.canSetDoor({ orientation: "h", x: 2, y: 1 })).toBe(false);
        expect(model.canSetDoor({ orientation: "h", x: 3, y: 1 })).toBe(true);
    });

    it("removes the window with its wall, and keeps the wall when the window is removed", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 2, 0);
        model.setWindow(0, 0);
        model.setWindow(1, 0);
        expect(model.removeWindow(0, 0)).toBe(true);
        expect(model.hasWall("h", 0, 0)).toBe(true);
        expect(model.hasWindow(0, 0)).toBe(false);
        model.removeWall("h", 1, 0);
        expect(model.hasWindow(1, 0)).toBe(false);
    });

    it("copies the windows with the model", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 2, 0);
        model.setWindow(0, 0);
        const copy = model.clone();
        expect(copy.hasWindow(0, 0)).toBe(true);
        copy.removeWindow(0, 0);
        expect(model.hasWindow(0, 0)).toBe(true);
    });
});

function named(model: MapLayerModel): string[] {
    return computePlacements(model)
        .filter((item) => item.collectionName !== "Carte Murs" || !item.prefabId.includes("raccord"))
        .map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`)
        .sort();
}

describe("window drawing", () => {
    it("draws a window in place of the facade of its segment, with the same ends", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 5, 1);
        for (const x of [1, 2, 3]) model.setWindow(x, 1);
        expect(named(model)).toEqual(
            [
                "facade-blanc-left@-6,32",
                "fenetre-blanc-mid@32,32",
                "fenetre-blanc-mid@64,32",
                "fenetre-blanc-mid@96,32",
                "facade-blanc-right@128,32",
            ].sort(),
        );
        const windows = computePlacements(model).filter((item) => item.collectionName === "Carte Fenêtres");
        expect(windows).toHaveLength(3);
    });

    it("reads back the windows it draws", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 5, 1);
        model.setWall("v", 0, 1, "gris");
        model.setFloor(2, 2, "parquet-clair");
        model.setDoor({ orientation: "h", x: 1, y: 1 });
        model.setWindow(3, 1);
        model.setWindow(4, 1);
        const placements = computePlacements(model);
        const again = computePlacements(modelFromPlacedPrefabs(placements));
        expect(again.map((item) => item.key).sort()).toEqual(placements.map((item) => item.key).sort());
    });

    it("gives a window next to a door the ends a facade would have", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 4, 1);
        model.setDoor({ orientation: "h", x: 1, y: 1 });
        model.setWindow(2, 1);
        expect(named(model)).toContain("fenetre-blanc-mid@64,32");
    });

    it("shades the floor south of a window", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 1, 1);
        model.setWindow(0, 1);
        model.setFloor(0, 2, "parquet-clair");
        expect(named(model)).toContain("sol-parquet-clair-ombre@0,64");
    });
});

describe("window erasing", () => {
    it("erases the window first, then the wall", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 3, 1);
        for (const x of [0, 1, 2]) model.setWindow(x, 1);
        expect(eraseTargetAt(model, 48, 50)).toEqual({ kind: "window", wall: { orientation: "h", x: 1, y: 1 } });
        expect(eraseAt(model, 48, 50)).toBe(false);
        expect(model.hasWindow(1, 1)).toBe(false);
        expect(model.hasWall("h", 1, 1)).toBe(true);
        expect(model.hasWindow(0, 1)).toBe(true);
        expect(eraseTargetAt(model, 48, 50)).toEqual({ kind: "wall", wall: { orientation: "h", x: 1, y: 1 } });
        eraseAt(model, 48, 50);
        expect(model.hasWall("h", 1, 1)).toBe(false);
    });

    it("does not erase the wall under a window in the same drag", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 1, 1);
        model.setWindow(0, 1);
        const kept = new Set<string>();
        eraseAt(model, 16, 50, kept);
        eraseAt(model, 20, 50, kept);
        expect(model.hasWall("h", 0, 1)).toBe(true);
    });
});

describe("window placing", () => {
    it("lists the horizontal segments of a drag and which can take a window", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 4, 1);
        model.setDoor({ orientation: "h", x: 3, y: 1 });
        // Segments 0, 1 free; 2, 3 under the door; 4 has no wall.
        const edges = windowEdgesBetween(model, { x: 4, y: 1 }, { x: 0, y: 1 });
        expect(edges.map((item) => item.edge.x)).toEqual([0, 1, 2, 3, 4]);
        expect(edges.map((item) => item.valid)).toEqual([true, true, false, false, false]);
        expect(applyWindows(model, edges.filter((item) => item.valid).map((item) => item.edge))).toBe(2);
        expect(model.hasWindow(1, 1)).toBe(true);
    });

    it("keeps a vertical drag on the row it started from", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 2, 1);
        const edges = windowEdgesBetween(model, { x: 0, y: 1 }, { x: 1, y: 6 });
        expect(edges.map((item) => item.edge)).toEqual([
            { orientation: "h", x: 0, y: 1 },
            { orientation: "h", x: 1, y: 1 },
        ]);
    });

    it("takes the tile under a click as one segment", () => {
        const model = new MapLayerModel();
        wallRow(model, 0, 3, 1);
        expect(windowEdgesBetween(model, { x: 2, y: 1 }, { x: 2, y: 1 })).toEqual([
            { edge: { orientation: "h", x: 2, y: 1 }, valid: true },
        ]);
    });
});
