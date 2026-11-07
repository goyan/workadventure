import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { EntityPrefab, WAMEntityData } from "@workadventure/map-editor";
import { WamFile } from "@workadventure/map-editor";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import { UpdateEntityFrontCommand } from "../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/UpdateEntityFrontCommand";

// A desk whose 32px grid blocks its first row, moved by the map editor on and off the grid of the map.
const prefab = {
    id: "desk",
    name: "Desk",
    collectionName: "Furniture",
    collisionGrid: [
        [1, 1],
        [0, 0],
    ],
} as unknown as EntityPrefab;
const REMOVE = [
    [-1, -1],
    [0, 0],
];

function moveDesk(from: { x: number; y: number }, to: { x: number; y: number }) {
    const data = { x: from.x, y: from.y, properties: [], prefabRef: { collectionName: "Furniture", id: "desk" } };
    const position = { ...from };
    const entity = mock<Entity>();
    Object.defineProperty(entity, "x", { get: () => position.x });
    Object.defineProperty(entity, "y", { get: () => position.y });
    entity.getPrefab.mockReturnValue(prefab);
    entity.getOldPosition.mockReturnValue({ ...from });
    entity.isActivatable.mockReturnValue(false);
    entity.updateEntity.mockImplementation((config: Partial<WAMEntityData>) => {
        position.x = config.x ?? position.x;
        position.y = config.y ?? position.y;
    });
    const entitiesManager = mock<EntitiesManager>();
    entitiesManager.getEntities.mockReturnValue(new Map([["desk", entity]]));
    entitiesManager.getActivatableEntities.mockReturnValue([]);
    const wrapper = mock<GameMapFrontWrapper>();
    const addEntityCollisionRectangles = vi.fn();
    wrapper.addEntityCollisionRectangles.mockImplementation(addEntityCollisionRectangles);
    wrapper.getTileDimensions.mockReturnValue({ width: 32, height: 32 });
    const scene = mock<GameScene>();
    scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
    const wamFile = new WamFile({
        version: "1",
        mapUrl: "map.tmj",
        areas: [],
        entities: { desk: data },
        entityCollections: [],
    });
    return new UpdateEntityFrontCommand(wamFile, "desk", to, undefined, from, entitiesManager, scene)
        .execute()
        .then(() => ({ wrapper, entity, addEntityCollisionRectangles }));
}

describe("UpdateEntityFrontCommand collisions", () => {
    it("moves the grid between two places on the grid", async () => {
        const { wrapper, entity, addEntityCollisionRectangles } = await moveDesk({ x: 64, y: 96 }, { x: 128, y: 96 });
        expect(wrapper.modifyToCollisionsLayer.mock.calls).toEqual([
            [64, 96, "0", REMOVE],
            [128, 96, "0", prefab.collisionGrid],
        ]);
        expect(addEntityCollisionRectangles).toHaveBeenCalledWith(entity);
    });

    it("takes the grid off the tiles when the object leaves the grid: it blocks with rectangles there", async () => {
        const { wrapper, entity, addEntityCollisionRectangles } = await moveDesk({ x: 64, y: 96 }, { x: 70, y: 101 });
        expect(wrapper.modifyToCollisionsLayer.mock.calls).toEqual([[64, 96, "0", REMOVE]]);
        expect(addEntityCollisionRectangles).toHaveBeenCalledWith(entity);
    });

    it("writes the grid to the tiles when the object comes back on the grid, without removing anything", async () => {
        const { wrapper, entity, addEntityCollisionRectangles } = await moveDesk({ x: 70, y: 101 }, { x: 64, y: 96 });
        expect(wrapper.modifyToCollisionsLayer.mock.calls).toEqual([[64, 96, "0", prefab.collisionGrid]]);
        expect(addEntityCollisionRectangles).toHaveBeenCalledWith(entity);
    });
});
