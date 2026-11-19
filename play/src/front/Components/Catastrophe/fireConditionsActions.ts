import type { SetFireConditionsMessage } from "@workadventure/messages";
import { gameManager } from "../../Phaser/Game/GameManager";

/** Asks the server to set the conditions of the room, or to go back to the real ones. It decides, and tells everyone. */
export function sendFireConditions(conditions: SetFireConditionsMessage): void {
    gameManager.getCurrentGameScene().connection?.emitSetFireConditions(conditions);
}
