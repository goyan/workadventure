import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import { zombieCountStore, zombieHeadingStore, zombieMinutesStore } from "../../Stores/CatastropheStore";

/**
 * Asks the server to send a horde of zombies across the map, as chosen in the panel: it begins at once for the whole
 * room. It refuses while one already goes on.
 */
export function startZombies(): void {
    gameManager.getCurrentGameScene().connection?.emitLaunchZombies({
        count: get(zombieCountStore),
        minutes: get(zombieMinutesStore),
        heading: get(zombieHeadingStore),
        // The server decides the rest.
        seed: 0,
        startedAt: 0,
        durationMs: 0,
        dirX: 0,
        dirY: 0,
        anchorX: 0,
        anchorY: 0,
        widthCells: 0,
        heightCells: 0,
        terrain: "",
        terrainHash: 0,
    });
}

/** Asks the server to stop the horde of the room: its zombies fall at once, for everyone. */
export function stopZombies(): void {
    gameManager.getCurrentGameScene().connection?.emitLaunchZombies(undefined, true);
}
