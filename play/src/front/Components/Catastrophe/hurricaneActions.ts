import { CatastropheKind } from "@workadventure/messages";
import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import {
    hurricaneCategoryStore,
    hurricaneHeadingStore,
    hurricaneMinutesStore,
    hurricaneWaterEffectStore,
} from "../../Stores/CatastropheStore";

/**
 * Asks the server to send a hurricane across the map, as chosen in the panel: it begins at once for the whole room,
 * which the server tells. It refuses while one already goes on.
 */
export function startHurricane(): void {
    gameManager
        .getCurrentGameScene()
        // Its eye over the middle of the map: a point outside it.
        .connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_HURRICANE, -1, -1, 0, true, false, undefined, {
            category: get(hurricaneCategoryStore),
            minutes: get(hurricaneMinutesStore),
            heading: get(hurricaneHeadingStore),
            // The server decides the rest.
            southern: false,
            startedAt: 0,
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
            anchorX: 0,
            anchorY: 0,
            durationMs: 0,
            times: 0,
            // Its effect on the water: real, or exaggerated as chosen.
            waterEffect: get(hurricaneWaterEffectStore),
        });
}

/** Asks the server to stop the hurricane of the room: its weather gives way to that of the map at once, for everyone. */
export function stopHurricane(): void {
    gameManager
        .getCurrentGameScene()
        .connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_HURRICANE, 0, 0, 0, true, true);
}
