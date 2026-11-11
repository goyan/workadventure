import { describe, expect, it } from "vitest";
import type { EntityPrefab } from "@workadventure/map-editor";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { findSeatAtPoint, findSeatUnderFeet } from "@wa/front/Phaser/Player/Seat";

const TILE = 32;

interface PlacedObject {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    prefab: Record<string, unknown>;
}

let frame = 0;

/** A map holding only the given objects, with the real seat computation. */
function sceneWith(...objects: PlacedObject[]): GameScene {
    const entities = new Map(
        objects.map((object) => [
            object.id,
            {
                x: object.x,
                y: object.y,
                depth: 0,
                displayWidth: object.width,
                displayHeight: object.height,
                getPrefab: () => object.prefab as unknown as EntityPrefab,
            },
        ]),
    );
    // Seats are cached per frame: a new frame for each scene.
    frame += 1;
    const scene = {
        game: { loop: { frame } },
        wamFile: { settings: { categories: undefined } },
        getGameMapFrontWrapper: () => ({
            getTileDimensions: () => ({ width: TILE, height: TILE }),
            getEntitiesManager: () => ({ getEntities: () => entities }),
        }),
    };
    return scene as unknown as GameScene;
}

const officeChair: PlacedObject = {
    id: "c",
    x: 192,
    y: 160,
    width: 32,
    height: 64,
    prefab: { name: "Chaise de bureau", tags: ["Modern Office"], direction: "Down", seat: [{ x: 0.5, y: 1.31 }] },
};
const couch: PlacedObject = {
    id: "k",
    x: 192,
    y: 160,
    width: 32,
    height: 96,
    prefab: {
        name: "Canapé",
        tags: ["Modern Office"],
        direction: "Right",
        collisionGrid: [[1], [0], [0]],
        seat: [
            { x: 0.5, y: 1.25 },
            { x: 0.5, y: 2.25 },
        ],
    },
};
const deducedCouch: PlacedObject = {
    id: "d",
    x: 192,
    y: 192,
    width: 64,
    height: 32,
    prefab: { name: "Canapé perso", tags: ["Seats"], direction: "Down" },
};

describe("findSeatAtPoint", () => {
    it("finds the seat of a chair clicked on its backrest or on the bottom of its image", () => {
        const scene = sceneWith(officeChair);

        expect(findSeatAtPoint(scene, { x: 208, y: 176 })?.id).toBe("c:0");
        expect(findSeatAtPoint(scene, { x: 208, y: 222 })?.id).toBe("c:0");
        // What the arrival of a run looks for: neither point is close enough to the seat.
        expect(findSeatUnderFeet(scene, { x: 208, y: 176 })).toBeUndefined();
        expect(findSeatUnderFeet(scene, { x: 208, y: 222 })).toBeUndefined();
    });

    it("picks the place of a couch nearest to the click", () => {
        const scene = sceneWith(couch);

        expect(findSeatAtPoint(scene, { x: 208, y: 176 })?.id).toBe("k:0");
        expect(findSeatAtPoint(scene, { x: 208, y: 236 })?.id).toBe("k:1");
    });

    it("picks the place of a couch the catalog does not describe", () => {
        const scene = sceneWith(deducedCouch);

        expect(findSeatAtPoint(scene, { x: 196, y: 196 })?.id).toBe("d:auto0");
        expect(findSeatAtPoint(scene, { x: 244, y: 214 })?.id).toBe("d:auto1");
    });

    it("falls back on the nearest place the filter accepts, a taken one being skipped", () => {
        const scene = sceneWith(couch);

        expect(findSeatAtPoint(scene, { x: 208, y: 236 }, (seat) => seat.id !== "k:1")?.id).toBe("k:0");
        expect(findSeatAtPoint(scene, { x: 208, y: 236 }, () => false)).toBeUndefined();
    });

    it("finds nothing outside the image of every seat", () => {
        const scene = sceneWith(officeChair, couch, deducedCouch);

        expect(findSeatAtPoint(scene, { x: 100, y: 100 })).toBeUndefined();
    });
});
