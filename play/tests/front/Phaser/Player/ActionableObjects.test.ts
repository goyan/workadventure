import { Direction } from "@workadventure/map-editor";
import type { EntityPrefab } from "@workadventure/map-editor";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import { AvatarAction } from "../../../../src/front/Phaser/Entity/AvatarAction";
import { findActionableObject } from "../../../../src/front/Phaser/Player/ActionableObjects";

function object(name: string, x: number): Entity {
    const entity = mock<Entity>({ x, y: 100, displayWidth: 64, displayHeight: 32, depth: 90 });
    const prefab: EntityPrefab = {
        id: name,
        name,
        tags: [],
        direction: Direction.Left,
        imagePath: "",
        color: "",
        collectionName: "test",
        type: "Default",
    };
    entity.getPrefab.mockReturnValue(prefab);
    return entity;
}

function sceneWith(entities: Map<string, Entity>): GameScene {
    const scene = mock<GameScene>();
    const manager = mock<EntitiesManager>();
    manager.getEntities.mockReturnValue(entities);
    const map = mock<GameMapFrontWrapper>();
    map.getEntitiesManager.mockReturnValue(manager);
    scene.getGameMapFrontWrapper.mockReturnValue(map);
    return scene;
}

describe("avatar object interactions", () => {
    it("selects the nearest usable object by its boundary, skipping decorations", () => {
        const scene = sceneWith(
            new Map([
                ["bed", object("Bed", 100)],
                ["coffee", object("Coffee machine", 30)],
                ["decoration", object("Shelf", 96)],
            ]),
        );
        const selected = findActionableObject(scene, { x: 90, y: 116 });
        expect(selected?.entityId).toBe("coffee");
        expect(selected?.action).toBe(AvatarAction.Coffee);
        expect(selected?.trigger).toBe("key");
        expect(selected?.direction).toBe(PositionMessage_Direction.LEFT);
        expect(selected?.depth).toBe(91);
    });

    it("does not interact with a distant object or an empty map", () => {
        expect(
            findActionableObject(sceneWith(new Map([["bed", object("Bed", 100)]])), { x: 0, y: 116 }),
        ).toBeUndefined();
        expect(findActionableObject(sceneWith(new Map()), { x: 100, y: 116 })).toBeUndefined();
    });
});
