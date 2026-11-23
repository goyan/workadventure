import { CatastropheKind } from "@workadventure/messages";
import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import {
    hurricaneCategoryStore,
    hurricaneHeadingStore,
    hurricaneMinutesStore,
    hurricaneOffsetKmStore,
} from "../../Stores/CatastropheStore";

/**
 * Asks the server to send a hurricane across the map, as chosen in the panel: it begins at once for the whole room,
 * which the server tells. It refuses while one already goes on.
 */
export function startHurricane(): void {
    gameManager
        .getCurrentGameScene()
        .connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_HURRICANE, 0, 0, 0, true, false, undefined, {
            category: get(hurricaneCategoryStore),
            minutes: get(hurricaneMinutesStore),
            offsetKm: get(hurricaneOffsetKmStore),
            heading: get(hurricaneHeadingStore),
            // The server decides these two.
            southern: false,
            startedAt: 0,
        });
}

/** Asks the server to stop the hurricane of the room: its weather gives way to that of the map at once, for everyone. */
export function stopHurricane(): void {
    gameManager
        .getCurrentGameScene()
        .connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_HURRICANE, 0, 0, 0, true, true);
}
