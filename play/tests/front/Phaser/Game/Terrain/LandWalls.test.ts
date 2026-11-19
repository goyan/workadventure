import { cellKey, landWallsOf } from "@workadventure/map-editor";
import type { WAMFileFormat } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { computePlacements } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";

/**
 * The server reads the walls for the land (doors closed) from the names and the places of their pieces, without the code of the
 * editor. This checks it against the editor itself: the pieces the editor places for a model of walls must give the
 * server the walls of that model, for every height, with their doors and windows.
 */
function wamOf(model: MapLayerModel): WAMFileFormat {
    const entities = Object.fromEntries(
        computePlacements(model).map((placement, index) => [
            `piece${index}`,
            {
                x: placement.x,
                y: placement.y,
                prefabRef: { collectionName: placement.collectionName, id: placement.prefabId },
            },
        ]),
    );
    return { version: "2.1.0", mapUrl: "m.tmj", areas: [], entityCollections: [], entities };
}
/** The sides of every wall segment of a model, those under a door included. */
function expectedSides(model: MapLayerModel): { east: string[]; south: string[] } {
    const east: string[] = [];
    const south: string[] = [];
    for (const wall of model.getWalls()) {
        if (wall.orientation === "h") {
            south.push(cellKey(2 * wall.x, 2 * wall.y + 1), cellKey(2 * wall.x + 1, 2 * wall.y + 1));
        } else {
            east.push(cellKey(2 * wall.x - 1, 2 * (wall.y + 1)), cellKey(2 * wall.x - 1, 2 * (wall.y + 1) + 1));
        }
    }
    return { east: east.sort(), south: south.sort() };
}

describe("the walls the server reads for the land", () => {
    for (const height of [1, 2, 3, 4] as const) {
        it(`are those the editor places, doors closed, for a room of height ${height}`, () => {
            const model = new MapLayerModel();
            for (let x = 2; x < 8; x++) {
                model.setWall("h", x, 3, "blanc", height);
                model.setWall("h", x, 9, "brique", height);
            }
            for (let y = 3; y < 9; y++) {
                model.setWall("v", 2, y, "gris", height);
                model.setWall("v", 8, y, "lavande", height);
            }
            expect(model.setDoor({ orientation: "h", x: 5, y: 9 })).toBe(true);
            expect(model.setDoor({ orientation: "v", x: 8, y: 6 })).toBe(true);
            expect(model.setDoor({ orientation: "h", x: 4, y: 3, glazed: true })).toBe(true);
            expect(model.setWindow(6, 3, height)).toBe(true);
            const walls = landWallsOf(wamOf(model));
            const expected = expectedSides(model);
            expect([...walls.south].sort()).toEqual(expected.south);
            expect([...walls.east].sort()).toEqual(expected.east);
            expect(expected.south.length).toBe(2 * 12);
            expect(expected.east.length).toBe(2 * 12);
        });
    }
});
