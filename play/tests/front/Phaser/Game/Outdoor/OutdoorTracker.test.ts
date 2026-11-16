import { describe, expect, it } from "vitest";
import { entityOutdoorRect, OutdoorTracker } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorTracker";
import { OUTDOOR_CELL_SIZE } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorTracker";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { computePlacements } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    mapLayerPieceSize,
    mapLayerPrefabId,
    parseMapLayerPrefab,
} from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import type { WallHeight } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import {
    applyDoor,
    applyWalls,
    roomWallEdges,
} from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

type TestEntity = { collectionName: string; x: number; y: number; width: number; height: number };

function setup() {
    let time = 0;
    const entities: TestEntity[] = [];
    const tracker = new OutdoorTracker(
        () => entities,
        () => ({ width: 320, height: 320 }),
        () => time,
    );
    const at = (t: number) => {
        time = t;
        tracker.update();
    };
    return { entities, tracker, at };
}

const wall = (x: number): TestEntity => ({ collectionName: "Carte Murs", x, y: 0, width: 32, height: 32 });

describe("OutdoorTracker", () => {
    it("computes on first update", () => {
        const { tracker, at } = setup();
        expect(tracker.grid).toBeUndefined();
        at(0);
        expect(tracker.grid).toBeDefined();
        expect(tracker.version).toBe(1);
    });

    it("recomputes 300 ms after the last wall change", () => {
        const { entities, tracker, at } = setup();
        at(0);
        entities.push(wall(64));
        at(1000);
        at(1200);
        expect(tracker.version).toBe(1);
        at(1301);
        expect(tracker.version).toBe(2);
        expect(tracker.grid?.isOutdoorAt(64, 0)).toBe(false);
    });

    it("waits again when walls keep changing", () => {
        const { entities, tracker, at } = setup();
        at(0);
        entities.push(wall(64));
        at(1000);
        entities.push(wall(128));
        at(1250);
        at(1400);
        expect(tracker.version).toBe(1);
        at(1551);
        expect(tracker.version).toBe(2);
    });

    it("leaves the grass beside a wall that starts mid-cell outdoors", () => {
        const { entities, tracker, at } = setup();
        // The team map puts its walls at x = 26 (mod 32): a 32 px cell would swallow 26 px of grass.
        entities.push({ collectionName: "Carte Murs", x: 26, y: 0, width: 12, height: 320 });
        at(0);
        expect(tracker.grid?.isOutdoorAt(20, 10)).toBe(true);
        expect(tracker.grid?.isOutdoorAt(30, 10)).toBe(false);
    });

    it("counts a window as a wall: the room behind it stays indoors", () => {
        const { entities, tracker, at } = setup();
        // A room from x 64 to 160, y 64 to 160: its north wall is a row of windows.
        for (const x of [64, 96, 128]) {
            entities.push({ collectionName: "Carte Fenêtres", x, y: 64, width: 32, height: 6 });
            entities.push({ collectionName: "Carte Murs", x, y: 160, width: 32, height: 6 });
        }
        entities.push({ collectionName: "Carte Murs", x: 58, y: 64, width: 6, height: 102 });
        entities.push({ collectionName: "Carte Murs", x: 160, y: 64, width: 6, height: 102 });
        at(0);
        expect(tracker.grid?.isOutdoorAt(100, 110)).toBe(false);
        expect(tracker.grid?.isOutdoorAt(10, 10)).toBe(true);
    });

    it("ignores non-wall entities", () => {
        const { entities, tracker, at } = setup();
        at(0);
        entities.push({ collectionName: "Infogène Sols", x: 0, y: 0, width: 32, height: 32 });
        at(1000);
        at(2000);
        expect(tracker.version).toBe(1);
    });
});

describe("entityOutdoorRect", () => {
    const door = {
        x: 64,
        y: 32,
        displayWidth: 32,
        displayHeight: 60,
        scaleX: 1,
        scaleY: 1,
        getPrefab: () => ({
            collectionName: "Carte Portes",
            id: "Carte Portes:porte-h-gris-g:Default:Down",
            imagePath: "door.png",
        }),
    };

    it("measures an animated door by its prefab image, not its open frame", () => {
        expect(entityOutdoorRect(door, () => ({ width: 32, height: 32 }))).toEqual({
            collectionName: "Carte Portes",
            x: 64,
            y: 32,
            width: 32,
            height: 32,
        });
    });

    it("falls back to the displayed size without a prefab image", () => {
        expect(entityOutdoorRect(door, () => undefined)).toMatchObject({ width: 32, height: 60 });
    });
});

describe("entityOutdoorRect of high walls", () => {
    /** An entity of the map layer, sized like its catalog image. */
    function piece(collectionName: string, name: string, x: number, y: number) {
        const id = mapLayerPrefabId(collectionName, name);
        const parsed = parseMapLayerPrefab(collectionName, id);
        if (!parsed) throw new Error(`unknown piece ${name}`);
        const { width, height } = mapLayerPieceSize(parsed);
        return {
            x,
            y,
            displayWidth: width,
            displayHeight: height,
            scaleX: 1,
            scaleY: 1,
            getPrefab: () => ({ collectionName, id, imagePath: `${name}.png` }),
        };
    }
    const imageSize = (entity: ReturnType<typeof piece>) => () => ({
        width: entity.displayWidth,
        height: entity.displayHeight,
    });

    it("stands a high facade where the facade of height 1 stands", () => {
        const high = piece("Carte Murs", "facade-gris-mid-h3", 64, 32);
        const low = piece("Carte Murs", "facade-gris-mid", 64, 96);
        expect(entityOutdoorRect(high, imageSize(high))).toEqual(entityOutdoorRect(low, imageSize(low)));
        expect(entityOutdoorRect(low, imageSize(low))).toEqual({
            collectionName: "Carte Murs",
            x: 64,
            y: 96,
            width: 32,
            height: 32,
        });
    });

    it("stands a high door, a high window and a high vertical wall like their pieces of height 1", () => {
        const pairs: [string, string, string, number, number][] = [
            ["Carte Portes", "porte-h-gris-g-h2", "porte-h-gris-g", 64, 32],
            ["Carte Fenêtres", "fenetre-gris-left-h4", "fenetre-gris-left", 58, 96],
            ["Carte Murs", "mur-vertical-gris-h2", "mur-vertical-gris", 58, 32],
            ["Carte Murs", "bout-gris-h3", "bout-gris", 58, 64],
            ["Carte Murs", "raccord-NE-h4", "raccord-NE", 58, 96],
        ];
        for (const [collectionName, highName, lowName, x, rise] of pairs) {
            const high = piece(collectionName, highName, x, 200 - rise);
            const low = piece(collectionName, lowName, x, 200);
            expect(entityOutdoorRect(high, imageSize(high))).toEqual(entityOutdoorRect(low, imageSize(low)));
        }
    });

    it("gives a lintel no rectangle of its own", () => {
        const lintel = piece("Carte Murs", "linteau-gris-mid-h4-o2", 64, 0);
        expect(entityOutdoorRect(lintel, imageSize(lintel))).toMatchObject({ width: 0, height: 0 });
    });

    it("keeps a room closed in high walls exactly as in walls of height 1", () => {
        const outdoorOf = (wall: WallHeight, door: WallHeight): boolean[] => {
            const model = new MapLayerModel();
            const bounds = { columns: 20, rows: 20 };
            applyWalls(model, roomWallEdges({ x: 5, y: 6 }, { x: 10, y: 9 }), "gris", bounds, wall);
            applyDoor(model, { orientation: "h", x: 7, y: 10, height: door }, bounds);
            model.setWindow(9, 6, 1);
            const rects = computePlacements(model).map((placement) => {
                const name = placement.prefabId.split(":")[1];
                const entity = piece(placement.collectionName, name, placement.x, placement.y);
                return entityOutdoorRect(entity, imageSize(entity));
            });
            const grid = OutdoorGrid.fromWalls(640, 640, OUTDOOR_CELL_SIZE, rects);
            expect(grid.isOutdoorAt(7 * 32, 8 * 32)).toBe(false);
            const cells: boolean[] = [];
            for (let row = 0; row < grid.rows; row++) {
                for (let col = 0; col < grid.cols; col++) cells.push(grid.isOutdoorCell(col, row));
            }
            return cells;
        };
        expect(outdoorOf(4, 2)).toEqual(outdoorOf(1, 1));
    });
});
