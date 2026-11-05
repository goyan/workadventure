import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { get } from "svelte/store";
import type { EntityDataProperties } from "@workadventure/map-editor";
import { GameMapProperties, OpenWebsitePropertyData } from "@workadventure/map-editor";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { Entity, EntityEvent } from "../../../../src/front/Phaser/ECS/Entity";
import { actionsMenuStore } from "../../../../src/front/Stores/ActionsMenuStore";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";

vi.hoisted(() => {
    vi.stubGlobal("localStorage", window.localStorage);
});
vi.mock("../../../../src/front/Phaser/Game/GameScene", () => ({ GameScene: class {} }));

function anEntity(properties: EntityDataProperties): Entity {
    const permissions = mock<ReturnType<GameScene["getEntityPermissions"]>>({
        canRead: () => true,
        canEdit: () => true,
    });
    return Object.assign(Object.create(Entity.prototype) as Entity, {
        entityId: "couch",
        entityData: { x: 0, y: 0, name: "Couch", properties },
        prefab: { name: "Couch", imagePath: "couch.png" },
        scene: mock<GameScene>({ getEntityPermissions: () => permissions }),
        emit: vi.fn(),
    });
}

describe("entity interactions", () => {
    afterAll(() => vi.unstubAllGlobals());
    beforeEach(() => {
        actionsMenuStore.clear();
        mapEditorModeStore.set(false);
    });

    afterEach(() => {
        actionsMenuStore.clear();
        mapEditorModeStore.set(false);
    });

    it.each([undefined, "", "   "])("does not open a blank card for description %j", (description) => {
        anEntity([
            { id: "description", type: "entityDescriptionProperties", searchable: true, description },
        ]).activate();
        expect(get(actionsMenuStore)).toBeUndefined();
    });

    it("does not open a blank card for an unconfigured website", () => {
        anEntity([OpenWebsitePropertyData.parse({ id: "website", type: "openWebsite", link: "" })]).activate();
        expect(get(actionsMenuStore)).toBeUndefined();
    });

    it("keeps a configured description readable", () => {
        anEntity([
            {
                id: "description",
                type: "entityDescriptionProperties",
                searchable: true,
                description: "A place to rest",
            },
        ]).activate();
        expect(get(actionsMenuStore)?.menuDescription).toBe("A place to rest");
    });

    it("still runs a configured website action", () => {
        const entity = anEntity([
            OpenWebsitePropertyData.parse({
                id: "website",
                type: "openWebsite",
                link: "https://example.com",
                newTab: true,
            }),
        ]);
        const emit = vi.spyOn(entity, "emit");
        entity.activate();
        expect(emit).toHaveBeenCalledWith(EntityEvent.PropertyActivated, {
            propertyName: GameMapProperties.OPEN_TAB,
            propertyValue: "https://example.com",
        });
    });
});
