import { describe, expect, it, vi } from "vitest";
import { groundView, raisedDoorLevels } from "../../../../../src/front/Phaser/Game/Floors/UpperDoors";

const door = (elevation: number, collectionName = "Carte Portes Paliers") => ({
    entityId: `door-${elevation}`,
    x: 320,
    y: 608 - elevation,
    depth: 400_000,
    setTexture: vi.fn(),
    getPrefab: () => ({
        collectionName,
        id: `${collectionName}:porte-h-blanc-g:Default:Down`,
        imagePath: "porte-h-blanc-g.png",
    }),
    getElevation: () => elevation,
});

describe("doors of the raised floors", () => {
    it("shows a door of a floor as the door of the ground it stands for, where it stands", () => {
        const placed = door(52);
        const view = groundView(placed, 52);
        // The door animator reads the doors of the ground: their names, and their place on the ground.
        expect(view.getPrefab()).toEqual({
            collectionName: "Carte Portes",
            id: "Carte Portes:porte-h-blanc-g:Default:Down",
            imagePath: "porte-h-blanc-g.png",
        });
        expect(view.y).toBe(608);
        expect(view.x).toBe(320);
        expect(view.entityId).toBe("door-52");
        expect(view.depth).toBe(400_000);
    });

    it("draws on the door itself", () => {
        const placed = door(52);
        groundView(placed, 52).setTexture("open-frame");
        expect(placed.setTexture).toHaveBeenCalledWith("open-frame");
    });

    it("gives the same view of a door each time: the animator tells the doors it knows by it", () => {
        const placed = door(52);
        expect(groundView(placed, 52)).toBe(groundView(placed, 52));
    });

    it("tells the floors that have doors or walls", () => {
        const entities = [door(52), door(116), door(52), door(0, "Carte Portes"), door(84, "Furniture")];
        expect(raisedDoorLevels(entities)).toEqual([52, 116]);
    });
});
