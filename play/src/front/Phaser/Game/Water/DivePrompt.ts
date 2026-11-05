import { get } from "svelte/store";
import { popupStore } from "../../../Stores/PopupStore";
import PopUpTriggerActionMessage from "../../../Components/PopUp/PopUpTriggerActionMessage.svelte";
import LL from "../../../../i18n/i18n-svelte";
import type { GameScene } from "../GameScene";

const DIVE_PROMPT_ID = "water-dive";

/** "Press SPACE or click here to swim", shown while the player stands at the edge of some water. */
export class DivePrompt {
    private shown = false;

    constructor(private readonly scene: GameScene) {}

    public show(dive: () => void): void {
        if (this.shown) return;
        this.shown = true;
        popupStore.addPopup(
            PopUpTriggerActionMessage,
            { message: get(LL).trigger.swim(), onclick: dive, userInputManager: this.scene.userInputManager },
            DIVE_PROMPT_ID,
        );
    }

    public hide(): void {
        if (!this.shown) return;
        this.shown = false;
        popupStore.removePopup(DIVE_PROMPT_ID);
    }
}
