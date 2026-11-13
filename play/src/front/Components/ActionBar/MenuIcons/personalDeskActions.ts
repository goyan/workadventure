import { get } from "svelte/store";
import { LL } from "../../../../i18n/i18n-svelte";
import { gameManager } from "../../../Phaser/Game/GameManager";
import { openedMenuStore } from "../../../Stores/MenuStore";
import { warningMessageStore } from "../../../Stores/ErrorStore";
import PersonalDeskFinderModal from "../../Modal/PersonalDeskFinderModal.svelte";
import { modals } from "@wa-modals";

// Walks (does not teleport) to the user's personal desk, like the walkMyDesk shortcut.
export async function goToPersonalDesk(): Promise<void> {
    openedMenuStore.close("profileMenu");
    try {
        await gameManager.getCurrentGameScene()?.walkToPersonalDesk();
    } catch (error) {
        console.error("Error while walking to personal desk", error);
        warningMessageStore.addWarningMessage(get(LL).actionbar.personalDesk.errorMoving(), { closable: true });
    }
}

// Lists the free desks of the map; walking into one offers to claim it.
export function findFreeDesk(): void {
    openedMenuStore.close("profileMenu");
    modals.open(PersonalDeskFinderModal);
}
