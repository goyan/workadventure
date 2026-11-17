import { describe, expect, it } from "vitest";
import {
    MAP_LAYER_WALL_COLLECTION,
    facadePrefabName,
    isMapLayerPrefab,
    mapLayerPrefabId,
    parseMapLayerPrefab,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import {
    groundPrefabOfUpper,
    levelOfWallAt,
    levelItems,
    levelPlacedKey,
    levelPlacements,
    parseAnyLevelPrefab,
    upperPrefabOf,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerLevels";
import { computePlacements, placementKey } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { modelFromPlacedPrefabs } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

const facade = mapLayerPrefabId(MAP_LAYER_WALL_COLLECTION, facadePrefabName("blanc", "single", 2));

describe("walls of the raised floors", () => {
    it("names the pieces standing on a raised floor in collections of their own", () => {
        const upper = upperPrefabOf(MAP_LAYER_WALL_COLLECTION, facade);
        expect(upper).toEqual({
            collectionName: "Carte Murs Paliers",
            prefabId: "Carte Murs Paliers:facade-blanc-single-h2:Default:Down",
        });
        expect(groundPrefabOfUpper(upper.collectionName, upper.prefabId)).toEqual({
            collectionName: MAP_LAYER_WALL_COLLECTION,
            prefabId: facade,
        });
        expect(groundPrefabOfUpper(MAP_LAYER_WALL_COLLECTION, facade)).toBeUndefined();
    });

    it("keeps them out of what reads the walls of the ground, yet in the map tool", () => {
        const upper = upperPrefabOf(MAP_LAYER_WALL_COLLECTION, facade);
        // The light, the outdoors, the paths, the doors read the walls with this: they do not see the ones of a floor.
        expect(parseMapLayerPrefab(upper.collectionName, upper.prefabId)).toBeUndefined();
        expect(parseAnyLevelPrefab(upper.collectionName, upper.prefabId)).toEqual(
            parseMapLayerPrefab(MAP_LAYER_WALL_COLLECTION, facade),
        );
        expect(isMapLayerPrefab(upper.collectionName, upper.prefabId)).toBe(true);
    });

    it("reads the walls of a floor as if they stood on the ground under them", () => {
        const model = new MapLayerModel();
        model.setWall("h", 3, 5, "blanc", 2);
        const ground = computePlacements(model);
        const placed = levelPlacements(ground, 52);
        // Drawn 52 px higher, with the altitude of their floor.
        expect(placed.map((item) => [item.y, item.elevation])).toEqual(ground.map((item) => [item.y - 52, 52]));
        expect(placed.every((item) => item.collectionName === "Carte Murs Paliers")).toBe(true);
        const read = modelFromPlacedPrefabs(levelItems(placed, 52));
        expect(read.getWall("h", 3, 5)).toEqual(model.getWall("h", 3, 5));
        // Another floor, and the ground, do not see them.
        expect([...modelFromPlacedPrefabs(levelItems(placed, 84)).getWalls()]).toEqual([]);
        expect([...modelFromPlacedPrefabs(levelItems(placed, 0)).getWalls()]).toEqual([]);
    });

    it("reads the ground as before, without the pieces of the floors", () => {
        const model = new MapLayerModel();
        model.setWall("v", 2, 2, "gris", 1);
        const ground = computePlacements(model);
        const upper = levelPlacements(ground, 52);
        const read = modelFromPlacedPrefabs(levelItems([...ground, ...upper], 0));
        expect([...read.getWalls()]).toEqual([...model.getWalls()]);
        expect([...read.getWalls()]).toHaveLength(1);
    });

    it("leaves the floors of a room out of the walls of a raised floor: they are slabs", () => {
        const model = new MapLayerModel();
        model.setFloor(1, 1, "parquet-clair");
        model.setWall("h", 1, 1, "blanc", 1);
        const placed = levelPlacements(computePlacements(model), 52);
        expect(placed.some((item) => item.prefabId.includes("sol-"))).toBe(false);
        expect(placed.length).toBeGreaterThan(0);
    });

    it("finds the level of the wall under the pointer, to edit it without choosing its level first", () => {
        const ground = new MapLayerModel();
        const top = new MapLayerModel();
        // A vertical wall of the floor at 116 px, on the line x = 5, the row 4: drawn 116 px higher on the screen.
        top.setWall("v", 5, 4, "blanc", 1);
        const models = (level: number) => (level === 116 ? top : ground);
        const pointer = { x: 160, y: 4 * 32 + 20 - 116 };
        expect(levelOfWallAt(models, [52, 116], 0, pointer.x, pointer.y)).toBe(116);
        expect(levelOfWallAt(models, [52, 116], 52, pointer.x, pointer.y)).toBe(116);
        // The level being edited is kept when it has a wall there, or when no level has one.
        expect(levelOfWallAt(models, [52, 116], 116, pointer.x, pointer.y)).toBe(116);
        expect(levelOfWallAt(models, [52, 116], 52, 600, 600)).toBe(52);
        // A wall of the ground drawn at the same point of the screen (y = 32: the row 0).
        ground.setWall("v", 5, 0, "blanc", 1);
        expect(levelOfWallAt(models, [52, 116], 0, pointer.x, pointer.y)).toBe(0);
    });

    it("gives a placed piece the key of the placement it stands for", () => {
        const model = new MapLayerModel();
        model.setWall("h", 3, 5, "blanc", 2);
        const [first] = computePlacements(model);
        const [upper] = levelPlacements([first], 52);
        expect(levelPlacedKey(upper, 52)).toBe(placementKey(first.collectionName, first.prefabId, first.x, first.y));
        expect(levelPlacedKey(upper, 84)).toBeUndefined();
        expect(levelPlacedKey(first, 0)).toBe(first.key);
        expect(levelPlacedKey(first, 52)).toBeUndefined();
    });
});
