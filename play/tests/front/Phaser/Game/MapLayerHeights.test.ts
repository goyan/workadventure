import { describe, expect, it } from "vitest";
import {
    MAP_LAYER_DOOR_COLLECTION,
    MAP_LAYER_WALL_COLLECTION,
    MAP_LAYER_WINDOW_COLLECTION,
    doorPrefabName,
    facadeFaceHeight,
    facadePrefabName,
    jointPrefabName,
    lintelPrefabName,
    mapLayerPieceSize,
    mapLayerPrefabId,
    parseMapLayerPrefab,
    verticalWallPrefabName,
    wallEndPrefabName,
    wallRise,
    windowPrefabName,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { computePlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyDoor,
    applyFloor,
    applyWalls,
    lineWallEdges,
    rectangleCells,
    roomWallEdges,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

const bounds = { columns: 20, rows: 20 };

function names(model: MapLayerModel): string[] {
    return computePlacements(model)
        .map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`)
        .sort();
}

function read(collectionName: string, name: string) {
    return parseMapLayerPrefab(collectionName, mapLayerPrefabId(collectionName, name));
}

describe("wall heights: names", () => {
    it("keeps the names of the walls of height 1 and suffixes the higher ones", () => {
        expect(wallRise(1)).toBe(0);
        expect(wallRise(4)).toBe(96);
        expect([1, 2, 3, 4].map((height) => facadeFaceHeight(height as 1 | 2 | 3 | 4))).toEqual([20, 52, 84, 116]);
        expect(facadePrefabName("gris", "mid")).toBe("facade-gris-mid");
        expect(facadePrefabName("gris", "mid", 1)).toBe("facade-gris-mid");
        expect(facadePrefabName("gris", "mid", 2)).toBe("facade-gris-mid-h2");
        expect(verticalWallPrefabName("gris", 3)).toBe("mur-vertical-gris-h3");
        expect(verticalWallPrefabName("gris")).toBe("mur-vertical-gris");
        expect(wallEndPrefabName("gris", 2)).toBe("bout-gris-h2");
        expect(jointPrefabName(["N", "E"], 2)).toBe("raccord-NE-h2");
        expect(jointPrefabName(["E", "N"])).toBe("raccord-NE");
        expect(lintelPrefabName("gris", "mid", 4, 2)).toBe("linteau-gris-mid-h4-o2");
        expect(lintelPrefabName("gris", "mid", 2, 1)).toBe("linteau-gris-mid-h2-o1");
        expect(() => lintelPrefabName("gris", "mid", 2, 2)).toThrow();
    });

    it("names the high doors and windows, the height before the frame", () => {
        expect(doorPrefabName("h", "gris", "g", undefined, false, 2)).toBe("porte-h-gris-g-h2");
        expect(doorPrefabName("h", "gris", "g", 3, false, 2)).toBe("porte-h-gris-g-h2-3");
        expect(doorPrefabName("h", "gris", "g", 3, true, 2)).toBe("porte-h-gris-g-h2-b3");
        expect(doorPrefabName("h", "gris", "g", 3, true)).toBe("porte-h-gris-g-b3");
        expect(doorPrefabName("v", "gris", "haut", undefined, false, 2)).toBe("porte-v-gris-haut");
        expect(windowPrefabName("gris", "mid", 2)).toBe("fenetre-gris-mid-h2");
        expect(windowPrefabName("gris", "mid")).toBe("fenetre-gris-mid");
    });
});

describe("wall heights: parsing", () => {
    it("reads the height from the name, 1 without a suffix", () => {
        expect(read(MAP_LAYER_WALL_COLLECTION, "facade-gris-left-h3")).toEqual({
            kind: "facade",
            tint: "gris",
            ends: "left",
            height: 3,
        });
        expect(read(MAP_LAYER_WALL_COLLECTION, "facade-gris-left")).toEqual({
            kind: "facade",
            tint: "gris",
            ends: "left",
            height: 1,
        });
        expect(read(MAP_LAYER_WALL_COLLECTION, "mur-vertical-brique-h4")).toEqual({
            kind: "vertical",
            tint: "brique",
            height: 4,
        });
        expect(read(MAP_LAYER_WALL_COLLECTION, "bout-blanc-h2")).toEqual({ kind: "end", tint: "blanc", height: 2 });
        expect(read(MAP_LAYER_WALL_COLLECTION, "raccord-NES-h2")).toEqual({
            kind: "joint",
            arms: ["N", "E", "S"],
            height: 2,
        });
        expect(read(MAP_LAYER_WALL_COLLECTION, "raccord-NES")).toEqual({
            kind: "joint",
            arms: ["N", "E", "S"],
            height: 1,
        });
        expect(read(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h4-o2")).toEqual({
            kind: "lintel",
            tint: "gris",
            ends: "mid",
            height: 4,
            opening: 2,
        });
        expect(read(MAP_LAYER_WINDOW_COLLECTION, "fenetre-lavande-single-h2")).toEqual({
            kind: "window",
            tint: "lavande",
            ends: "single",
            height: 2,
        });
        expect(read(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-g-h2-b3")).toEqual({
            kind: "door",
            orientation: "h",
            tint: "gris",
            side: "g",
            frame: 3,
            reverse: true,
            height: 2,
        });
        expect(read(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-d")).toMatchObject({ frame: 7, height: 1 });
        expect(read(MAP_LAYER_DOOR_COLLECTION, "porte-v-gris-haut")).toMatchObject({ height: 1 });
    });

    it("refuses the heights that do not exist", () => {
        expect(read(MAP_LAYER_WALL_COLLECTION, "facade-gris-mid-h1")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "facade-gris-mid-h5")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "raccord-N-h1")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h1-o1")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h2-o2")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h2-o3")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h2")).toBeUndefined();
        expect(read(MAP_LAYER_DOOR_COLLECTION, "porte-v-gris-haut-h2")).toBeUndefined();
        expect(read(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-g-h2-7")).toBeUndefined();
        expect(read(MAP_LAYER_WINDOW_COLLECTION, "fenetre-gris-mid-h5")).toBeUndefined();
    });
});

describe("wall heights: sizes", () => {
    const size = (collectionName: string, name: string) => {
        const piece = read(collectionName, name);
        if (!piece) throw new Error(`unknown piece ${name}`);
        return mapLayerPieceSize(piece);
    };

    it("makes the face longer, the strips and the joints keep their size", () => {
        expect(size(MAP_LAYER_WALL_COLLECTION, "facade-gris-mid-h2")).toEqual({ width: 32, height: 64 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "facade-gris-mid-h4")).toEqual({ width: 32, height: 128 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "facade-gris-single-h2")).toEqual({ width: 44, height: 64 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "bout-gris-h3")).toEqual({ width: 12, height: 84 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "mur-vertical-gris-h3")).toEqual({ width: 12, height: 20 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "raccord-NE-h4")).toEqual({ width: 12, height: 12 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h2-o1")).toEqual({ width: 32, height: 44 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h4-o1")).toEqual({ width: 32, height: 108 });
        expect(size(MAP_LAYER_WALL_COLLECTION, "linteau-gris-left-h4-o2")).toEqual({ width: 38, height: 76 });
        expect(size(MAP_LAYER_WINDOW_COLLECTION, "fenetre-gris-mid-h3")).toEqual({ width: 32, height: 96 });
        expect(size(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-g-h2")).toEqual({ width: 32, height: 64 });
        expect(size(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-g")).toEqual({ width: 32, height: 32 });
        expect(size(MAP_LAYER_DOOR_COLLECTION, "porte-v-gris-haut")).toEqual({ width: 64, height: 32 });
    });
});

/**
 * Placements of two maps of walls of height 1, frozen from the code before the high walls (origin/infogene 34ecff099):
 * a map with no high wall must be drawn exactly as before.
 */
const BEFORE_HIGH_WALLS: Record<"room" | "mixed", string[]> = {
    room: [
        "facade-gris-left@58,128",
        "facade-gris-right@128,128",
        "facade-gris-right@128,64",
        "fenetre-gris-mid@96,128",
        "mur-vertical-gris@154,108",
        "mur-vertical-gris@154,76",
        "mur-vertical-gris@58,108",
        "mur-vertical-gris@58,76",
        "porte-h-gris-d@96,64",
        "porte-h-gris-g@64,64",
        "raccord-EW@122,128",
        "raccord-EW@90,128",
        "raccord-NE@58,128",
        "raccord-NS@154,96",
        "raccord-NS@58,96",
        "raccord-NW@154,128",
        "raccord-S@58,64",
        "raccord-SW@154,64",
        "sol-parquet-clair-ombre@128,96",
        "sol-parquet-clair-uni@128,64",
        "sol-parquet-clair-uni@64,64",
        "sol-parquet-clair-uni@64,96",
        "sol-parquet-clair-uni@96,64",
        "sol-parquet-clair-uni@96,96",
    ],
    mixed: [
        "bout-brique@186,172",
        "bout-lavande@250,204",
        "facade-brique-left@26,160",
        "facade-brique-mid@128,32",
        "facade-brique-mid@64,160",
        "facade-brique-mid@96,160",
        "facade-brique-mid@96,32",
        "facade-brique-right@160,32",
        "fenetre-brique-left@26,32",
        "fenetre-brique-mid@64,32",
        "mur-vertical-blanc@90,108",
        "mur-vertical-blanc@90,140",
        "mur-vertical-blanc@90,44",
        "mur-vertical-blanc@90,76",
        "mur-vertical-brique@186,108",
        "mur-vertical-brique@186,140",
        "mur-vertical-brique@186,44",
        "mur-vertical-brique@186,76",
        "mur-vertical-brique@26,140",
        "mur-vertical-brique@26,44",
        "mur-vertical-lavande@250,108",
        "mur-vertical-lavande@250,140",
        "mur-vertical-lavande@250,172",
        "mur-vertical-lavande@250,76",
        "porte-h-brique-d@160,160",
        "porte-h-brique-g@128,160",
        "porte-v-brique-bas@0,108",
        "porte-v-brique-haut@0,76",
        "raccord-ES@26,32",
        "raccord-ESW@90,32",
        "raccord-EW@122,32",
        "raccord-EW@154,32",
        "raccord-EW@58,160",
        "raccord-EW@58,32",
        "raccord-N@186,160",
        "raccord-N@250,192",
        "raccord-NE@26,160",
        "raccord-NEW@90,160",
        "raccord-NS@186,128",
        "raccord-NS@186,64",
        "raccord-NS@186,96",
        "raccord-NS@250,128",
        "raccord-NS@250,160",
        "raccord-NS@250,96",
        "raccord-NS@26,128",
        "raccord-NS@26,64",
        "raccord-NS@90,128",
        "raccord-NS@90,64",
        "raccord-NS@90,96",
        "raccord-S@250,64",
        "raccord-SW@186,32",
    ],
};

describe("wall heights: maps of walls of height 1", () => {
    it("draws a closed room with a door and a window as before", () => {
        const model = new MapLayerModel();
        applyFloor(model, rectangleCells({ x: 2, y: 2 }, { x: 4, y: 3 }), "parquet-clair", bounds);
        applyWalls(model, roomWallEdges({ x: 2, y: 2 }, { x: 4, y: 3 }), "gris", bounds);
        applyDoor(model, { orientation: "h", x: 3, y: 2 }, bounds);
        model.setWindow(3, 4);
        expect(names(model)).toEqual(BEFORE_HIGH_WALLS.room);
    });

    it("draws doors of both orientations, windows, a T and lone walls as before", () => {
        const model = new MapLayerModel();
        applyWalls(model, roomWallEdges({ x: 1, y: 1 }, { x: 5, y: 4 }), "brique", bounds);
        applyWalls(model, lineWallEdges({ x: 3, y: 1 }, { x: 3, y: 5 }), "blanc", bounds);
        applyWalls(model, lineWallEdges({ x: 8, y: 2 }, { x: 8, y: 6 }), "lavande", bounds);
        applyDoor(model, { orientation: "v", x: 1, y: 3 }, bounds);
        applyDoor(model, { orientation: "h", x: 5, y: 5 }, bounds);
        model.setWindow(1, 1);
        model.setWindow(2, 1);
        expect(names(model)).toEqual(BEFORE_HIGH_WALLS.mixed);
    });
});
