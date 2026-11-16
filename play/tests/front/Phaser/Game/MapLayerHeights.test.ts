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
    mapLayerGroundBottom,
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
    applyWindows,
    lineWallEdges,
    modelFromPlacedPrefabs,
    moveWindow,
    rectangleCells,
    roomWallEdges,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";
import type { PlacedPrefabLike } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

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

/** What a model means, in a form that compares regardless of the order it was filled in. */
function state(model: MapLayerModel): string[] {
    return [
        ...Array.from(
            model.getWalls(),
            (wall) => `wall ${wall.orientation}:${wall.x},${wall.y} ${wall.tint} h${wall.height}`,
        ),
        ...Array.from(model.getDoors(), (door) => `door ${door.orientation}:${door.x},${door.y} h${door.height ?? 1}`),
        ...Array.from(
            model.getWindows(),
            (pane) => `window ${pane.x},${pane.y} h${model.getWindowHeight(pane.x, pane.y)}`,
        ),
    ].sort();
}

function item(collectionName: string, name: string, x: number, y: number): PlacedPrefabLike {
    return { collectionName, prefabId: mapLayerPrefabId(collectionName, name), x, y };
}

describe("wall heights: model", () => {
    it("gives a wall the height 1 unless told otherwise, and keeps the heights in a copy", () => {
        const model = new MapLayerModel();
        model.setWall("h", 0, 0, "gris");
        model.setWall("h", 1, 0, "gris", 3);
        model.setWall("h", 2, 0, "gris", 3);
        model.setWall("v", 4, 0, "blanc", 2);
        expect(model.setDoor({ orientation: "h", x: 2, y: 0, height: 2 })).toBe(true);
        model.setWall("h", 5, 0, "gris", 4);
        expect(model.setWindow(5, 0, 3)).toBe(true);
        expect(model.getWall("h", 0, 0)?.height).toBe(1);
        expect(state(model.clone())).toEqual(state(model));
        expect(state(model)).toContain("door h:2,0 h2");
        expect(state(model)).toContain("window 5,0 h3");
    });

    it("brings a door or a window down to the height of its wall", () => {
        const model = new MapLayerModel();
        model.setWall("h", 0, 0, "gris", 2);
        model.setWall("h", 1, 0, "gris", 3);
        model.setWall("h", 3, 0, "gris", 2);
        expect(model.setDoor({ orientation: "h", x: 1, y: 0, height: 4 })).toBe(true);
        expect(model.setWindow(3, 0, 4)).toBe(true);
        expect([...model.getDoors()]).toEqual([{ orientation: "h", x: 1, y: 0, height: 2 }]);
        expect(model.getWindowHeight(3, 0)).toBe(2);
        model.setWall("h", 1, 0, "gris", 1);
        model.setWall("h", 3, 0, "gris", 1);
        expect([...model.getDoors()]).toEqual([{ orientation: "h", x: 1, y: 0, height: 1 }]);
        expect(model.getWindowHeight(3, 0)).toBe(1);
        expect(model.getWindowHeight(0, 0)).toBeUndefined();
    });

    it("gives a vertical door no height", () => {
        const model = new MapLayerModel();
        model.setWall("v", 0, 0, "gris", 4);
        model.setWall("v", 0, 1, "gris", 4);
        expect(model.setDoor({ orientation: "v", x: 0, y: 1, height: 3 })).toBe(true);
        expect([...model.getDoors()]).toEqual([{ orientation: "v", x: 0, y: 1, height: 1 }]);
    });

    it("lets the operations set high walls and keep the height of a moved window", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 0, y: 2 }, { x: 4, y: 2 }), "brique", bounds, 3);
        expect(Array.from(model.getWalls(), (wall) => wall.height)).toEqual([3, 3, 3, 3]);
        applyWalls(model, lineWallEdges({ x: 0, y: 3 }, { x: 1, y: 3 }), "brique", bounds);
        expect(model.getWall("h", 0, 3)?.height).toBe(1);
        expect(applyWindows(model, [{ orientation: "h", x: 1, y: 2 }], 2)).toBe(1);
        expect(moveWindow(model, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe(true);
        expect(model.getWindowHeight(3, 2)).toBe(2);
        applyDoor(model, { orientation: "h", x: 1, y: 2, height: 2 }, bounds);
        expect([...model.getDoors()]).toEqual([{ orientation: "h", x: 1, y: 2, height: 2 }]);
    });
});

describe("wall heights: reading the map", () => {
    const readBothWays = (items: PlacedPrefabLike[]): string[] => {
        const forward = state(modelFromPlacedPrefabs(items));
        expect(state(modelFromPlacedPrefabs([...items].reverse()))).toEqual(forward);
        return forward;
    };

    it("reads the height of a facade and of a vertical wall from their names, at their raised place", () => {
        expect(readBothWays([item(MAP_LAYER_WALL_COLLECTION, "facade-gris-mid-h2", 64, 96 - 32)])).toEqual([
            "wall h:2,3 gris h2",
        ]);
        expect(readBothWays([item(MAP_LAYER_WALL_COLLECTION, "mur-vertical-gris-h3", 64 - 6, 96 + 12 - 64)])).toEqual([
            "wall v:2,3 gris h3",
        ]);
    });

    it("does not read a high wall at the place of an old wall half a cap higher", () => {
        expect(readBothWays([item(MAP_LAYER_WALL_COLLECTION, "facade-gris-mid-h2", 64, 96 - 32 - 6)])).toEqual([]);
    });

    it("gives the walls under a door the height of the lintel over it, whatever the order", () => {
        expect(
            readBothWays([
                item(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-g", 64, 96),
                item(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-d", 96, 96),
                item(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h2-o1", 64, 96 - 32),
                item(MAP_LAYER_WALL_COLLECTION, "linteau-gris-mid-h2-o1", 96, 96 - 32),
            ]),
        ).toEqual(["door h:3,3 h1", "wall h:2,3 gris h2", "wall h:3,3 gris h2"]);
    });

    it("reads a door of 2 in a wall of 4 and a window of 2 in a wall of 2", () => {
        expect(
            readBothWays([
                item(MAP_LAYER_WALL_COLLECTION, "linteau-gris-left-h4-o2", 64 - 6, 96 - 96),
                item(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-g-h2", 64, 96 - 32),
                item(MAP_LAYER_DOOR_COLLECTION, "porte-h-gris-d-h2", 96, 96 - 32),
                item(MAP_LAYER_WALL_COLLECTION, "linteau-gris-right-h4-o2", 96, 96 - 96),
                item(MAP_LAYER_WINDOW_COLLECTION, "fenetre-gris-mid-h2", 256, 96 - 32),
            ]),
        ).toEqual(["door h:3,3 h2", "wall h:2,3 gris h4", "wall h:3,3 gris h4", "wall h:8,3 gris h2", "window 8,3 h2"]);
    });
});

describe("wall heights: placements", () => {
    const highRow = (model: MapLayerModel, from: number, to: number, y: number, height: 1 | 2 | 3 | 4): void => {
        for (let x = from; x < to; x++) model.setWall("h", x, y, "gris", height);
    };

    it("raises a high horizontal wall and gives its joints the same level", () => {
        const model = new MapLayerModel();
        highRow(model, 2, 4, 3, 2);
        expect(names(model)).toEqual([
            "facade-gris-left-h2@58,64",
            "facade-gris-right-h2@96,64",
            "raccord-E-h2@58,64",
            "raccord-EW-h2@90,64",
            "raccord-W-h2@122,64",
        ]);
    });

    it("closes the higher of two aligned walls, the lower one continuing under it", () => {
        const model = new MapLayerModel();
        model.setWall("h", 2, 3, "gris", 2);
        model.setWall("h", 3, 3, "gris", 1);
        expect(names(model)).toEqual([
            "facade-gris-right@96,96",
            "facade-gris-single-h2@58,64",
            "raccord-E-h2@58,64",
            "raccord-W-h2@90,64",
            "raccord-W@122,96",
        ]);
    });

    it("shows the south face of a high vertical wall arriving on a lower horizontal wall", () => {
        const model = new MapLayerModel();
        model.setWall("v", 2, 1, "gris", 2);
        model.setWall("v", 2, 2, "gris", 2);
        highRow(model, 1, 3, 3, 1);
        const items = names(model);
        expect(items).toContain("bout-gris-h2@58,76");
        expect(items).toContain("raccord-N-h2@58,64");
        expect(items).toContain("raccord-EW@58,96");
        expect(items).toContain("mur-vertical-gris-h2@58,12");
        expect(items).toContain("mur-vertical-gris-h2@58,44");
        expect(items.filter((name) => name.startsWith("raccord-NEW"))).toEqual([]);
    });

    it("keeps only the south arm of a lower joint that a higher horizontal wall covers", () => {
        const model = new MapLayerModel();
        highRow(model, 1, 3, 3, 3);
        model.setWall("v", 2, 2, "gris", 1);
        model.setWall("v", 2, 3, "gris", 1);
        const items = names(model).filter((name) => name.includes("@58,"));
        expect(items).toEqual([
            "bout-gris@58,140",
            "mur-vertical-gris@58,108",
            "mur-vertical-gris@58,76",
            "raccord-EW-h3@58,32",
            "raccord-N@58,128",
            "raccord-S@58,64",
            "raccord-S@58,96",
        ]);
    });

    it("puts lintels over a door lower than its wall, and its joints at the level of the wall", () => {
        const model = new MapLayerModel();
        highRow(model, 2, 4, 3, 3);
        expect(model.setDoor({ orientation: "h", x: 3, y: 3 })).toBe(true);
        expect(names(model)).toEqual([
            "linteau-gris-left-h3-o1@58,32",
            "linteau-gris-right-h3-o1@96,32",
            "porte-h-gris-d@96,96",
            "porte-h-gris-g@64,96",
            "raccord-E-h3@58,32",
            "raccord-EW-h3@90,32",
            "raccord-W-h3@122,32",
        ]);
    });

    it("draws a door of 2 in a wall of 4 under two lintels", () => {
        const model = new MapLayerModel();
        highRow(model, 1, 5, 3, 4);
        expect(model.setDoor({ orientation: "h", x: 3, y: 3, height: 2 })).toBe(true);
        const items = names(model);
        expect(items).toContain("porte-h-gris-g-h2@64,64");
        expect(items).toContain("porte-h-gris-d-h2@96,64");
        expect(items).toContain("linteau-gris-mid-h4-o2@64,0");
        expect(items).toContain("linteau-gris-mid-h4-o2@96,0");
        expect(items.filter((name) => name.startsWith("facade"))).toEqual([
            "facade-gris-left-h4@26,0",
            "facade-gris-right-h4@128,0",
        ]);
        expect(items.filter((name) => name.startsWith("raccord"))).toEqual([
            "raccord-E-h4@26,0",
            "raccord-EW-h4@122,0",
            "raccord-EW-h4@58,0",
            "raccord-EW-h4@90,0",
            "raccord-W-h4@154,0",
        ]);
    });

    it("draws a door as high as its wall as before, its jambs closing the walls next to it", () => {
        const model = new MapLayerModel();
        highRow(model, 1, 5, 3, 2);
        expect(model.setDoor({ orientation: "h", x: 3, y: 3, height: 2 })).toBe(true);
        expect(names(model)).toEqual([
            "facade-gris-left-h2@26,64",
            "facade-gris-right-h2@128,64",
            "porte-h-gris-d-h2@96,64",
            "porte-h-gris-g-h2@64,64",
            "raccord-E-h2@26,64",
            "raccord-W-h2@154,64",
        ]);
    });

    it("draws a window as high as its wall without a lintel, and a lower one under a lintel", () => {
        const model = new MapLayerModel();
        model.setWall("h", 2, 3, "gris", 2);
        expect(model.setWindow(2, 3, 2)).toBe(true);
        model.setWall("h", 8, 3, "gris", 3);
        expect(model.setWindow(8, 3)).toBe(true);
        const items = names(model);
        expect(items).toContain("fenetre-gris-single-h2@58,64");
        expect(items).toContain("fenetre-gris-single@250,96");
        expect(items).toContain("linteau-gris-single-h3-o1@250,32");
        expect(items.filter((name) => name.startsWith("linteau")).length).toBe(1);
        expect(items.filter((name) => name.startsWith("facade"))).toEqual([]);
    });

    for (const height of [2, 4] as const) {
        it(`passes the strips of a vertical wall of ${height} over its door without their collision, joints included`, () => {
            const model = new MapLayerModel();
            for (let y = 2; y < 6; y++) model.setWall("v", 4, y, "blanc", height);
            expect(model.setDoor({ orientation: "v", x: 4, y: 4 })).toBe(true);
            const items = names(model);
            const rise = 32 * (height - 1);
            expect(items).toContain("porte-v-blanc-haut@96,108");
            expect(items).toContain("porte-v-blanc-bas@96,140");
            // Over the two segments of the door, the strips are the pieces without collision: the doorway stays open.
            for (const y of [3, 4]) {
                expect(items).toContain(`mur-vertical-blanc-h${height}-porte@122,${y * 32 + 12 - rise}`);
                expect(items).not.toContain(`mur-vertical-blanc-h${height}@122,${y * 32 + 12 - rise}`);
            }
            // The other segments keep their strips.
            for (const y of [2, 5]) expect(items).toContain(`mur-vertical-blanc-h${height}@122,${y * 32 + 12 - rise}`);
            expect(items).toContain(`raccord-NS-h${height}@122,${128 - rise}`);
            expect(items).toContain(`raccord-NS-h${height}@122,${96 - rise}`);
            expect(items).toContain(`raccord-NS-h${height}@122,${160 - rise}`);
            const placements = computePlacements(model);
            for (const order of [placements, [...placements].reverse()]) {
                const rebuilt = modelFromPlacedPrefabs(order);
                expect(state(rebuilt)).toEqual(state(model));
                expect(names(rebuilt)).toEqual(items);
            }
        });
    }

    it("reads the strip over a door, of height 2 to 4 only", () => {
        expect(read(MAP_LAYER_WALL_COLLECTION, "mur-vertical-gris-h3-porte")).toEqual({
            kind: "vertical",
            tint: "gris",
            height: 3,
            overDoor: true,
        });
        expect(read(MAP_LAYER_WALL_COLLECTION, "mur-vertical-gris-porte")).toBeUndefined();
        expect(read(MAP_LAYER_WALL_COLLECTION, "mur-vertical-gris-h1-porte")).toBeUndefined();
        expect(verticalWallPrefabName("gris", 3, true)).toBe("mur-vertical-gris-h3-porte");
    });

    it("reads its own placements back to the same model and the same placements", () => {
        const model = new MapLayerModel();
        applyFloor(model, rectangleCells({ x: 1, y: 1 }, { x: 10, y: 8 }), "parquet-clair", bounds);
        applyWalls(model, roomWallEdges({ x: 1, y: 1 }, { x: 4, y: 3 }), "gris", bounds, 2);
        applyWalls(model, roomWallEdges({ x: 5, y: 1 }, { x: 10, y: 3 }), "brique", bounds, 4);
        applyWalls(model, lineWallEdges({ x: 1, y: 6 }, { x: 11, y: 6 }), "blanc", bounds, 3);
        applyWalls(model, lineWallEdges({ x: 1, y: 8 }, { x: 6, y: 8 }), "lavande", bounds, 1);
        applyWalls(model, lineWallEdges({ x: 6, y: 4 }, { x: 6, y: 8 }), "lavande", bounds, 3);
        applyDoor(model, { orientation: "h", x: 3, y: 4, height: 2 }, bounds);
        applyDoor(model, { orientation: "h", x: 8, y: 4 }, bounds);
        applyDoor(model, { orientation: "h", x: 3, y: 6, height: 3 }, bounds);
        applyDoor(model, { orientation: "v", x: 11, y: 3 }, bounds);
        applyDoor(model, { orientation: "v", x: 6, y: 7 }, bounds);
        applyWindows(model, [{ orientation: "h", x: 7, y: 1 }], 2);
        applyWindows(model, [{ orientation: "h", x: 2, y: 1 }], 2);
        applyWindows(model, [{ orientation: "h", x: 8, y: 6 }], 1);
        const placements = computePlacements(model);
        const rebuilt = modelFromPlacedPrefabs(placements);
        expect(state(rebuilt)).toEqual(state(model));
        expect(
            computePlacements(rebuilt)
                .map((item) => item.key)
                .sort(),
        ).toEqual(placements.map((item) => item.key).sort());
        expect(state(modelFromPlacedPrefabs([...placements].reverse()))).toEqual(state(model));
    });
});

describe("mapLayerGroundBottom", () => {
    it("is the bottom of the sprite for a piece of height 1 and for a facade, whose foot does not move", () => {
        expect(mapLayerGroundBottom({ kind: "facade", tint: "gris", ends: "mid", height: 1 }, 96)).toBe(128);
        expect(mapLayerGroundBottom({ kind: "facade", tint: "gris", ends: "mid", height: 3 }, 32)).toBe(128);
        expect(mapLayerGroundBottom({ kind: "joint", arms: ["E"], height: 1 }, 96)).toBe(108);
    });

    it("is under the sprite of the raised pieces of a high wall", () => {
        // The pieces of a wall 3 tiles high are drawn 64 px above where the ones of height 1 would be.
        expect(mapLayerGroundBottom({ kind: "joint", arms: ["E"], height: 3 }, 32)).toBe(108);
        expect(mapLayerGroundBottom({ kind: "vertical", tint: "gris", height: 3 }, 44)).toBe(128);
        // A lintel stands where the facade of height 1 of its wall would: the wall of the grid line at y = 96.
        expect(mapLayerGroundBottom({ kind: "lintel", tint: "gris", ends: "mid", height: 4, opening: 2 }, 0)).toBe(128);
    });
});
