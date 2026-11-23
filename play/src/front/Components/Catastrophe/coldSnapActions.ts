import { CatastropheKind } from "@workadventure/messages";
import { gameManager } from "../../Phaser/Game/GameManager";

/**
 * Asks the server to stop the cold snap of the room: it dispels the cold air lying on the map, whoever laid it, and
 * tells everyone. What that air froze stays, and thaws by itself.
 */
export function stopColdSnap(): void {
    gameManager
        .getCurrentGameScene()
        .connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_COLD, 0, 0, 0, false, true);
}
