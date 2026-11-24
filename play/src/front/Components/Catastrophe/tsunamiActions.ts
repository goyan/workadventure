import { CatastropheKind } from "@workadventure/messages";
import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import { tsunamiMetresStore, tsunamiMinutesStore } from "../../Stores/CatastropheStore";

/**
 * Asks the server to send a tsunami to the coast of the map (its east edge), as chosen in the panel: its front comes
 * at once for the whole room, which the server tells. It refuses while one already goes on.
 */
export function startTsunami(): void {
    gameManager.getCurrentGameScene().connection?.emitLaunchCatastrophe(
        CatastropheKind.CATASTROPHE_TSUNAMI,
        -1,
        -1,
        0,
        true,
        false,
        undefined,
        undefined,
        // The server decides when it starts and keeps the rest within bounds.
        {
            metres: Number(get(tsunamiMetresStore)),
            minutes: Number(get(tsunamiMinutesStore)),
            startedAt: 0,
            durationMs: 0,
        },
    );
}

/** Asks the server to stop the tsunami of the room: the sea leaves the coast at once, for everyone. */
export function stopTsunami(): void {
    gameManager
        .getCurrentGameScene()
        .connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_TSUNAMI, 0, 0, 0, true, true);
}
