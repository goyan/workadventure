import { popupStore } from "../../../Stores/PopupStore";
import PopUpTriggerActionMessage from "../../../Components/PopUp/PopUpTriggerActionMessage.svelte";
import type { GameScene } from "../GameScene";

/**
 * "Press SPACE or click here to …", shown while the player stands next to something it can use with the interaction
 * key: the edge of some water (swim), a seat set to the interaction key (sit).
 */
export class InteractionPrompt {
    private shown = false;

    constructor(
        private readonly scene: GameScene,
        private readonly id: string,
        private readonly message: () => string,
    ) {}

    public show(action: () => void): void {
        if (this.shown) return;
        this.shown = true;
        popupStore.addPopup(
            PopUpTriggerActionMessage,
            { message: this.message(), onclick: action, userInputManager: this.scene.userInputManager },
            this.id,
        );
    }

    public hide(): void {
        if (!this.shown) return;
        this.shown = false;
        popupStore.removePopup(this.id);
    }
}
