import { EntityPrefab } from "@workadventure/map-editor";
import type { EntityDataProperties } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";
import { armEntityDuplicate } from "../../../../src/front/Phaser/Game/MapEditor/EntityDuplicate";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorEntityModeStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
} from "../../../../src/front/Stores/MapEditorStore";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";

const prefab = EntityPrefab.parse({
    id: "chairs:chair:Default:Left",
    name: "chair",
    tags: [],
    imagePath: "chair.png",
    direction: "Left",
    color: "Default",
    collectionName: "chairs",
    type: "Default",
});

const properties: EntityDataProperties = [
    { id: "property-1", type: "playAudio", audioLink: "https://example.com/door.ogg" },
];

const placedEntity = {
    getPrefab: () => prefab,
    getEntityData: () => ({ properties }),
    setEditColor: () => undefined,
    removeEditColor: () => undefined,
} as unknown as Entity;

describe("armEntityDuplicate", () => {
    afterEach(() => {
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorCopiedEntityDataPropertiesStore.set(undefined);
        mapEditorEntityModeStore.set("ADD");
    });

    it("leaves the edition of the object and picks its prefab, with its direction, to place the copy", () => {
        mapEditorEntityModeStore.set("EDIT");
        mapEditorSelectedEntityStore.set(placedEntity);

        armEntityDuplicate(placedEntity);

        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
        expect(get(mapEditorEntityModeStore)).toBe("ADD");
        expect(get(mapEditorSelectedEntityPrefabStore)).toEqual(prefab);
    });

    it("gives the copy the properties of the object under new ids", () => {
        armEntityDuplicate(placedEntity);

        const copied = get(mapEditorCopiedEntityDataPropertiesStore);
        expect(copied).toEqual([{ ...properties[0], id: expect.any(String) }]);
        expect(copied?.[0].id).not.toBe("property-1");
        expect(properties[0].id).toBe("property-1");
    });
});
