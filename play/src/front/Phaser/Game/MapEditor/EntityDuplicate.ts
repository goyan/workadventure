import { withNewPropertyIds } from "@workadventure/map-editor/src/Utils";
import type { Entity } from "../../ECS/Entity";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorEntityModeStore,
    mapEditorSelectedEntityPrefabStore,
    mapEditorSelectedEntityStore,
} from "../../../Stores/MapEditorStore";

/**
 * Picks the prefab of a placed object, with its properties, so that the next clicks place copies of it.
 * The properties get new ids when the copy is placed, like a file dropped on the map.
 */
export function armEntityDuplicate(entity: Entity): void {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    mapEditorSelectedEntityStore.set(undefined);
    mapEditorEntityModeStore.set("ADD");
    mapEditorCopiedEntityDataPropertiesStore.set(withNewPropertyIds(entity.getEntityData().properties ?? []));
    mapEditorSelectedEntityPrefabStore.set(entity.getPrefab());
}
