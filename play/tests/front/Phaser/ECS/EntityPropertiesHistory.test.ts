import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { EntityDataProperties } from "@workadventure/map-editor";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { Entity } from "../../../../src/front/Phaser/ECS/Entity";

vi.hoisted(() => {
    vi.stubGlobal("localStorage", window.localStorage);
});
vi.mock("../../../../src/front/Phaser/Game/GameScene", () => ({ GameScene: class {} }));

/**
 * An entity loaded from the map shares its property list with the WAM file. The undo of a property edit is the
 * state of the WAM file read before the edit: editing the list in place would change that state too.
 */
function anEntitySharing(mapProperties: EntityDataProperties): Entity {
    return Object.assign(Object.create(Entity.prototype) as Entity, {
        entityId: "couch",
        entityData: { x: 0, y: 0, name: "Couch", properties: mapProperties },
        prefab: { name: "Couch", imagePath: "couch.png" },
        scene: mock<GameScene>(),
        emit: vi.fn(),
    });
}

function description(text: string): EntityDataProperties[number] {
    return { id: "description", type: "entityDescriptionProperties", description: text, searchable: false };
}

describe("entity property edits keep the map state they are undone to", () => {
    afterAll(() => vi.unstubAllGlobals());
    // An update refreshes whether the entity can be activated after a delay: not looked at here.
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it("adds a property without changing the map's list", () => {
        const mapProperties: EntityDataProperties = [];
        const entity = anEntitySharing(mapProperties);

        entity.addProperty(description("A place to rest"));

        expect(mapProperties).toEqual([]);
        expect(entity.getProperties()).toEqual([description("A place to rest")]);
    });

    it("updates a property without changing the map's property", () => {
        const mapProperties: EntityDataProperties = [description("Before")];
        const entity = anEntitySharing(mapProperties);

        entity.updateProperty({ id: "description", description: "After" });

        expect(mapProperties).toEqual([description("Before")]);
        expect(entity.getProperties()).toEqual([description("After")]);
    });

    it("deletes a property without changing the map's list", () => {
        const mapProperties: EntityDataProperties = [description("Before")];
        const entity = anEntitySharing(mapProperties);

        entity.deleteProperty("description");

        expect(mapProperties).toEqual([description("Before")]);
        expect(entity.getProperties()).toEqual([]);
    });
});
