import { describe, expect, it } from "vitest";
import {
    MAP_LAYER_FLOOR_COLLECTION,
    MAP_LAYER_WALL_COLLECTION,
    facadePrefabName,
    isMapLayerPrefab,
    floorPrefabName,
    mapLayerPrefabId,
    parseMapLayerPrefab,
    verticalWallPrefabName,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { wallBarriers } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerBarriers";
import {
    computePlacements,
    diffPlacements,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyFloor,
    applyWalls,
    cellsBetween,
    eraseAt,
    floodFillCells,
    lineWallEdges,
    modelFromPlacedPrefabs,
    rectangleCells,
    roomWallEdges,
    wallAtPoint,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

const bounds = { columns: 20, rows: 20 };

function names(model: MapLayerModel): string[] {
    return computePlacements(model)
        .map((item) => `${item.prefabId.split(":")[1]}@${item.x},${item.y}`)
        .sort();
}

describe("catalog", () => {
    it("parses the prefabs of the map layer and ignores the rest", () => {
        expect(
            parseMapLayerPrefab(
                MAP_LAYER_FLOOR_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_FLOOR_COLLECTION, floorPrefabName("parquet-clair", "ombre")),
            ),
        ).toEqual({ kind: "floor", family: "parquet-clair", variant: "ombre" });
        expect(
            parseMapLayerPrefab(
                MAP_LAYER_WALL_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, facadePrefabName("brique", "single")),
            ),
        ).toEqual({ kind: "facade", tint: "brique", ends: "single" });
        expect(
            parseMapLayerPrefab(
                MAP_LAYER_WALL_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, verticalWallPrefabName("brique")),
            ),
        ).toEqual({ kind: "vertical", tint: "brique" });
        expect(
            parseMapLayerPrefab("Infogène Sols", "Infogène Sols:sol-carrelage-gris-0-0:Default:Down"),
        ).toBeUndefined();
        expect(
            parseMapLayerPrefab(
                MAP_LAYER_WALL_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, "facade-rose-none"),
            ),
        ).toBeUndefined();
    });
});

describe("isMapLayerPrefab", () => {
    it("recognises the map layer prefabs only, never the classic floor and wall objects", () => {
        expect(
            isMapLayerPrefab(
                MAP_LAYER_WALL_COLLECTION,
                mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, "mur-vertical-gris"),
            ),
        ).toBe(true);
        expect(isMapLayerPrefab("Infogène Murs fins", "Infogène Murs fins:mur-vertical-gris:Default:Down")).toBe(false);
        expect(isMapLayerPrefab("Infogène Sols", "Infogène Sols:sol-carrelage-gris-0-0:Default:Down")).toBe(false);
    });
});

describe("autotile", () => {
    it("uses one plain tile per floor family", () => {
        const model = new MapLayerModel();
        model.setFloor(0, 0, "carrelage-gris");
        model.setFloor(4, 3, "carrelage-gris");
        model.setFloor(-1, -1, "pierre-olive");
        expect(names(model)).toEqual([
            "sol-carrelage-gris-uni@0,0",
            "sol-carrelage-gris-uni@128,96",
            "sol-pierre-olive-uni@-32,-32",
        ]);
    });

    it("shades the floor tile right after a horizontal wall, and only there", () => {
        const model = new MapLayerModel();
        applyFloor(model, rectangleCells({ x: 2, y: 2 }, { x: 3, y: 3 }), "moquette-grise", bounds);
        model.setWall("h", 2, 2, "blanc");
        const floors = names(model).filter((item) => item.startsWith("sol-"));
        expect(floors).toContain("sol-moquette-grise-ombre@64,96");
        expect(floors).toContain("sol-moquette-grise-uni@96,96");
        expect(floors).toContain("sol-moquette-grise-uni@64,64");
        model.removeWall("h", 2, 2);
        expect(names(model).filter((item) => item.includes("ombre"))).toEqual([]);
    });

    it("draws a horizontal wall as one continuous facade with closed ends and joints on its vertices", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 2, y: 3 }, { x: 5, y: 3 }), "gris", bounds);
        expect(names(model)).toEqual(
            [
                // facades fill the tile row of their line; the ends reach 6 px beyond the end vertices
                "facade-gris-left@58,96",
                "facade-gris-mid@96,96",
                "facade-gris-right@128,96",
                "raccord-E@58,96",
                "raccord-EW@90,96",
                "raccord-EW@122,96",
                "raccord-W@154,96",
            ].sort(),
        );
    });

    it("draws a lone facade closed on both sides", () => {
        const model = new MapLayerModel();
        model.setWall("h", 4, 2, "blanc");
        expect(names(model)).toEqual(["facade-blanc-single@122,64", "raccord-E@122,64", "raccord-W@154,64"].sort());
    });

    it("draws a vertical wall as strips centered on their line, with its ends closed", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 4, y: 1 }, { x: 4, y: 3 }), "blanc", bounds);
        expect(names(model)).toEqual(
            [
                "mur-vertical-blanc@122,44",
                "mur-vertical-blanc@122,76",
                "raccord-S@122,32",
                "raccord-NS@122,64",
                "raccord-N@122,96",
                "bout-blanc@122,108",
            ].sort(),
        );
    });

    it("shows the south face at the free bottom end of a vertical wall only", () => {
        const model = new MapLayerModel();
        model.setWall("v", 5, 2, "brique");
        const alone = names(model);
        expect(alone).toContain("bout-brique@154,108");
        // a wall that goes on, or a horizontal wall at the end, already has a face
        model.setWall("v", 5, 3, "brique");
        expect(names(model).filter((item) => item.startsWith("bout-"))).toEqual(["bout-brique@154,140"]);
        model.setWall("h", 5, 4, "brique");
        expect(names(model).filter((item) => item.startsWith("bout-"))).toEqual([]);
    });

    it("keeps the tint of vertical walls when the model is rebuilt", () => {
        const model = new MapLayerModel();
        model.setWall("v", 5, 2, "lavande");
        const rebuilt = modelFromPlacedPrefabs(computePlacements(model));
        expect(rebuilt.getWall("v", 5, 2)?.tint).toBe("lavande");
    });

    it("picks the corner, T and cross joints from the walls that meet on a vertex", () => {
        const model = new MapLayerModel();
        // a cross on the vertex (5, 5)
        model.setWall("h", 4, 5, "blanc");
        model.setWall("h", 5, 5, "blanc");
        model.setWall("v", 5, 4, "blanc");
        model.setWall("v", 5, 5, "blanc");
        // a T on the vertex (8, 5): wall going east, north and south would be NES
        model.setWall("h", 8, 5, "blanc");
        model.setWall("v", 8, 4, "blanc");
        model.setWall("v", 8, 5, "blanc");
        const joints = names(model).filter((item) => item.startsWith("raccord"));
        expect(joints).toContain("raccord-NESW@154,160");
        expect(joints).toContain("raccord-NES@250,160");
    });

    it("re-chooses the ends and joints when a wall is removed", () => {
        const model = new MapLayerModel();
        applyWalls(model, lineWallEdges({ x: 2, y: 3 }, { x: 4, y: 3 }), "blanc", bounds);
        expect(names(model)).toContain("facade-blanc-left@58,96");
        model.removeWall("h", 3, 3);
        expect(names(model)).toEqual(["facade-blanc-single@58,96", "raccord-E@58,96", "raccord-W@90,96"].sort());
    });
});

describe("diffPlacements", () => {
    it("only touches what changed and removes duplicates", () => {
        const model = new MapLayerModel();
        model.setFloor(0, 0, "pierre-grise");
        model.setFloor(1, 0, "pierre-grise");
        const wanted = computePlacements(model);
        const placed = [
            { entityId: "a", key: wanted[0].key },
            { entityId: "dup", key: wanted[0].key },
            { entityId: "stale", key: "other" },
        ];
        const diff = diffPlacements(placed, wanted);
        expect(diff.toDelete.sort()).toEqual(["dup", "stale"]);
        expect(diff.toCreate).toEqual([wanted[1]]);
    });
});

describe("modelFromPlacedPrefabs", () => {
    it("round-trips what the autotile produced", () => {
        const model = new MapLayerModel();
        applyWalls(model, roomWallEdges({ x: 1, y: 1 }, { x: 3, y: 2 }), "lavande", bounds);
        applyFloor(
            model,
            [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
            ],
            "moquette-olive",
            bounds,
        );
        const placements = computePlacements(model);
        const rebuilt = modelFromPlacedPrefabs(placements);
        expect(new Set(computePlacements(rebuilt).map((item) => item.key))).toEqual(
            new Set(placements.map((item) => item.key)),
        );
    });

    it("still reads the walls drawn when their cap was centered on the grid line", () => {
        const wall = (prefab: string, x: number, y: number) => ({
            x,
            y,
            collectionName: MAP_LAYER_WALL_COLLECTION,
            prefabId: mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, prefab),
        });
        const rebuilt = modelFromPlacedPrefabs([
            wall("facade-blanc-single", 58, 90),
            wall("mur-vertical-lavande", 122, 38),
        ]);
        expect(rebuilt.getWall("h", 2, 3)?.tint).toBe("blanc");
        expect(rebuilt.getWall("v", 4, 1)?.tint).toBe("lavande");
    });

    it("ignores other entities and misaligned positions", () => {
        const rebuilt = modelFromPlacedPrefabs([
            {
                x: 0,
                y: 0,
                collectionName: "Infogène Sols",
                prefabId: "Infogène Sols:sol-carrelage-gris-0-0:Default:Down",
            },
            {
                x: 5,
                y: 0,
                collectionName: MAP_LAYER_FLOOR_COLLECTION,
                prefabId: mapLayerPrefabId(MAP_LAYER_FLOOR_COLLECTION, floorPrefabName("pierre-grise", "uni")),
            },
        ]);
        expect(computePlacements(rebuilt)).toEqual([]);
    });
});

describe("operations", () => {
    it("lists the tiles between two tiles", () => {
        expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toHaveLength(4);
        expect(cellsBetween({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
    });

    it("keeps a wall line on its dominant axis", () => {
        expect(lineWallEdges({ x: 0, y: 0 }, { x: 3, y: 1 })).toHaveLength(3);
        expect(lineWallEdges({ x: 0, y: 0 }, { x: 1, y: 3 }).every((edge) => edge.orientation === "v")).toBe(true);
        expect(lineWallEdges({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([]);
    });

    it("drops walls and floors outside the map", () => {
        const model = new MapLayerModel();
        applyFloor(
            model,
            [
                { x: -1, y: 0 },
                { x: 20, y: 0 },
                { x: 19, y: 19 },
            ],
            "pierre-grise",
            bounds,
        );
        applyWalls(model, lineWallEdges({ x: -2, y: 0 }, { x: 1, y: 0 }), "blanc", bounds);
        // one floor in the map, one wall left once the segments outside are dropped (a facade and its two joints)
        expect(names(model).filter((item) => item.startsWith("sol-"))).toHaveLength(1);
        expect(names(model).filter((item) => item.startsWith("facade-"))).toEqual(["facade-blanc-single@-6,0"]);
    });

    it("fills a closed room and stops at its walls", () => {
        const model = new MapLayerModel();
        applyWalls(model, roomWallEdges({ x: 3, y: 3 }, { x: 5, y: 4 }), "blanc", bounds);
        const filled = floodFillCells(model, { x: 4, y: 3 }, bounds, "parquet-clair");
        expect(filled).toHaveLength(6);
    });

    it("refuses to fill open space and a tile that already has the floor", () => {
        const model = new MapLayerModel();
        expect(floodFillCells(model, { x: 1, y: 1 }, { columns: 100, rows: 100 }, "parquet-clair")).toBeUndefined();
        model.setFloor(1, 1, "parquet-clair");
        expect(floodFillCells(model, { x: 1, y: 1 }, bounds, "parquet-clair")).toEqual([]);
    });

    it("replaces another floor of the same region when filling", () => {
        const model = new MapLayerModel();
        applyWalls(model, roomWallEdges({ x: 3, y: 3 }, { x: 4, y: 3 }), "blanc", bounds);
        applyFloor(
            model,
            [
                { x: 3, y: 3 },
                { x: 4, y: 3 },
            ],
            "pierre-grise",
            bounds,
        );
        expect(floodFillCells(model, { x: 3, y: 3 }, bounds, "parquet-clair")).toHaveLength(2);
    });

    it("erases a thin vertical wall near its line, a facade anywhere in its tile, else the floor", () => {
        const model = new MapLayerModel();
        model.setWall("v", 2, 1, "blanc");
        model.setWall("h", 4, 1, "blanc");
        model.setFloor(6, 6, "pierre-grise");
        expect(wallAtPoint(model, 66, 50)).toEqual({ orientation: "v", x: 2, y: 1 });
        expect(wallAtPoint(model, 80, 50)).toBeUndefined();
        expect(wallAtPoint(model, 140, 50)).toEqual({ orientation: "h", x: 4, y: 1 });
        eraseAt(model, 66, 50);
        eraseAt(model, 140, 50);
        eraseAt(model, 200, 200);
        expect(computePlacements(model)).toEqual([]);
    });
});

describe("wallBarriers", () => {
    it("makes a horizontal wall a barrier south of its tile", () => {
        const model = new MapLayerModel();
        model.setWall("h", 4, 2, "blanc");
        const barriers = wallBarriers(computePlacements(model));

        expect(barriers.blocksMove({ x: 4, y: 2 }, { x: 4, y: 3 })).toBe(true);
        expect(barriers.blocksMove({ x: 4, y: 1 }, { x: 4, y: 2 })).toBe(false);
        expect(barriers.blocksMove({ x: 5, y: 2 }, { x: 5, y: 3 })).toBe(false);
    });

    it("stops the feet on the row under a vertical wall, which is where its collision is", () => {
        const model = new MapLayerModel();
        model.setWall("v", 6, 1, "blanc");
        const barriers = wallBarriers(computePlacements(model));

        expect(barriers.blocksMove({ x: 5, y: 2 }, { x: 6, y: 2 })).toBe(true);
        expect(barriers.blocksMove({ x: 5, y: 1 }, { x: 6, y: 1 })).toBe(false);
        expect(barriers.blocksMove({ x: 5, y: 3 }, { x: 6, y: 3 })).toBe(false);
    });

    it("closes the way under the end of a vertical wall that meets a horizontal one", () => {
        // A vertical wall of 2 strips ends on a horizontal wall that stands on the row 3.
        const model = new MapLayerModel();
        model.setWall("v", 6, 1, "blanc");
        model.setWall("v", 6, 2, "blanc");
        model.setWall("h", 5, 3, "blanc");
        model.setWall("h", 6, 3, "blanc");
        const barriers = wallBarriers(computePlacements(model));

        // On the row of the horizontal wall, the avatar cannot go round the end of the vertical wall.
        expect(barriers.blocksMove({ x: 5, y: 3 }, { x: 6, y: 3 })).toBe(true);
        expect(barriers.blocksMove({ x: 5, y: 2 }, { x: 6, y: 2 })).toBe(true);
    });

    it("ignores the floors and the objects that are not walls", () => {
        const model = new MapLayerModel();
        model.setFloor(3, 3, "pierre-grise");
        const barriers = wallBarriers([
            ...computePlacements(model),
            {
                x: 96,
                y: 96,
                collectionName: "Infogène Modern Office",
                prefabId: "Infogène Modern Office:desk:Default:Down",
            },
        ]);

        expect(barriers.touchesTile(3, 3)).toBe(false);
    });
});
