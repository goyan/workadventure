import { gameManager } from "../../../Phaser/Game/GameManager";
import DeleteCustomEntityModal from "./DeleteCustomEntityModal.svelte";
import { modals } from "@wa-modals";

/**
 * Asks before deleting an imported image from the library: the deletion reaches every map of the domain and cannot be
 * undone. The copies placed on the current map, deleted with it, are counted for the dialog.
 */
export function confirmCustomEntityDeletion(customEntity: { id: string; name: string }, onConfirm: () => void): void {
    const placedCount =
        gameManager
            .getCurrentGameScene()
            .getGameMap()
            .getWamFile()
            ?.getGameMapEntities()
            .findEntitiesByPrefabId(customEntity.id).length ?? 0;
    modals.open(DeleteCustomEntityModal, { name: customEntity.name, placedCount, onConfirm });
}
