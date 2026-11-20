import { describe, expect, it } from "vitest";
import {
    bridgePrefabName,
    MAP_LAYER_BRIDGE_COLLECTION,
    MAP_LAYER_BRIDGE_DEPTH,
    MAP_LAYER_COLLECTIONS,
    MAP_LAYER_FLOOR_DEPTH,
    mapLayerPrefabId,
    parseMapLayerPrefab,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { computePlacements } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import { MapLayerModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import {
    applyBridge,
    eraseAt,
    eraseFloorsAlong,
    eraseTargetAt,
    modelFromPlacedPrefabs,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";
import { FLOOR_OBJECT_DEPTH } from "../../../../src/front/Phaser/ECS/EntityLayerDepth";

const bounds = { columns: 10, rows: 10 };
const bridgeAt = (model: MapLayerModel, x: number, y: number): string | undefined =>
    computePlacements(model).find(
        (placement) =>
            placement.collectionName === MAP_LAYER_BRIDGE_COLLECTION &&
            placement.x === x * 32 &&
            placement.y === y * 32,
    )?.prefabId;
const idOf = (mask: number): string => mapLayerPrefabId(MAP_LAYER_BRIDGE_COLLECTION, bridgePrefabName(mask));

describe("the pieces of a bridge", () => {
    it("are named after the neighbours that are bridge too, in a collection of the map layer", () => {
        expect(MAP_LAYER_BRIDGE_COLLECTION).toBe("Carte Ponts");
        expect(MAP_LAYER_COLLECTIONS).toContain(MAP_LAYER_BRIDGE_COLLECTION);
        expect(bridgePrefabName(0)).toBe("pont-bois-0");
        expect(bridgePrefabName(15)).toBe("pont-bois-15");
        expect(parseMapLayerPrefab(MAP_LAYER_BRIDGE_COLLECTION, idOf(10))).toEqual({ kind: "bridge" });
        expect(parseMapLayerPrefab(MAP_LAYER_BRIDGE_COLLECTION, idOf(16))).toBeUndefined();
        expect(parseMapLayerPrefab("Carte Sols", "Carte Sols:pont-bois-3:Default:Down")).toBeUndefined();
    });

    it("are drawn over the water of the relief and its foam, under the objects of the floor", () => {
        expect(MAP_LAYER_BRIDGE_DEPTH).toBeGreaterThan(0.66);
        expect(MAP_LAYER_BRIDGE_DEPTH).toBeGreaterThan(MAP_LAYER_FLOOR_DEPTH);
        expect(MAP_LAYER_BRIDGE_DEPTH).toBeLessThan(FLOOR_OBJECT_DEPTH);
    });
});

describe("the bridges of the model", () => {
    it("are set, read, removed, and copied with the model", () => {
        const model = new MapLayerModel();
        model.setBridge(2, 3);
        expect(model.hasBridge(2, 3)).toBe(true);
        expect(model.hasBridge(3, 3)).toBe(false);
        const copy = model.clone();
        expect(model.removeBridge(2, 3)).toBe(true);
        expect(model.removeBridge(2, 3)).toBe(false);
        expect(copy.hasBridge(2, 3)).toBe(true);
        expect([...copy.getBridges()]).toEqual([{ x: 2, y: 3 }]);
    });

    it("stay within the map when painted", () => {
        const model = new MapLayerModel();
        applyBridge(
            model,
            [
                { x: 1, y: 1 },
                { x: -1, y: 1 },
                { x: 10, y: 1 },
            ],
            bounds,
        );
        expect([...model.getBridges()]).toEqual([{ x: 1, y: 1 }]);
    });

    it("are read from the pieces on the grid of the map, whatever their mask", () => {
        const model = modelFromPlacedPrefabs([
            { x: 64, y: 96, collectionName: MAP_LAYER_BRIDGE_COLLECTION, prefabId: idOf(0) },
            { x: 96, y: 96, collectionName: MAP_LAYER_BRIDGE_COLLECTION, prefabId: idOf(7) },
            { x: 70, y: 200, collectionName: MAP_LAYER_BRIDGE_COLLECTION, prefabId: idOf(0) },
        ]);
        expect(model.hasBridge(2, 3)).toBe(true);
        expect(model.hasBridge(3, 3)).toBe(true);
        expect([...model.getBridges()]).toHaveLength(2);
    });
});

describe("the piece of each tile of a bridge", () => {
    it("tells which neighbours go on: 1 north, 2 east, 4 south, 8 west", () => {
        const model = new MapLayerModel();
        model.setBridge(5, 5);
        expect(bridgeAt(model, 5, 5)).toBe(idOf(0));
        // A line from west to east.
        model.setBridge(4, 5);
        model.setBridge(6, 5);
        expect(bridgeAt(model, 4, 5)).toBe(idOf(2));
        expect(bridgeAt(model, 5, 5)).toBe(idOf(10));
        expect(bridgeAt(model, 6, 5)).toBe(idOf(8));
        // A cross.
        model.setBridge(5, 4);
        model.setBridge(5, 6);
        expect(bridgeAt(model, 5, 5)).toBe(idOf(15));
        expect(bridgeAt(model, 5, 4)).toBe(idOf(4));
        expect(bridgeAt(model, 5, 6)).toBe(idOf(1));
    });

    it("leaves the floor under a bridge as it is", () => {
        const model = new MapLayerModel();
        model.setFloor(5, 5, "parquet-clair");
        model.setBridge(5, 5);
        expect(
            computePlacements(model)
                .map((placement) => placement.collectionName)
                .sort(),
        ).toEqual(["Carte Ponts", "Carte Sols"]);
    });
});

describe("the eraser on a bridge", () => {
    it("takes the bridge of a tile before its floor", () => {
        const model = new MapLayerModel();
        model.setFloor(5, 5, "parquet-clair");
        model.setBridge(5, 5);
        expect(eraseTargetAt(model, 170, 170)).toEqual({ kind: "bridge", cell: { x: 5, y: 5 } });
        eraseAt(model, 170, 170);
        expect(model.hasBridge(5, 5)).toBe(false);
        expect(model.getFloor(5, 5)).toBeDefined();
        expect(eraseTargetAt(model, 170, 170)).toEqual({ kind: "floor", cell: { x: 5, y: 5 } });
    });

    it("removes the bridges a drag passes over, and the floors only where there is no bridge", () => {
        const model = new MapLayerModel();
        for (let x = 2; x <= 4; x++) model.setBridge(x, 5);
        model.setFloor(3, 5, "parquet-clair");
        model.setFloor(5, 5, "parquet-clair");
        eraseFloorsAlong(model, { x: 70, y: 170 }, { x: 180, y: 170 }, []);
        expect([...model.getBridges()]).toEqual([]);
        expect(model.getFloor(3, 5)).toBeDefined();
        expect(model.getFloor(5, 5)).toBeUndefined();
    });
});
