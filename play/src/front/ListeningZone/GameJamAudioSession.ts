import { localUserStore } from "../Connection/LocalUserStore";
import { gameManager } from "../Phaser/Game/GameManager";
import { parseJamAudioMemory } from "./JamAudioMemory";
import { createGameJamAudioSession } from "./JamAudioSession";

/**
 * The media session of the Jams of the room being played. What it listens to or shares is kept in the browser, so
 * that a reload after a deploy picks it up again.
 */
export const jamAudioSession = createGameJamAudioSession(() => gameManager.getCurrentGameScene(), {
    load: () => parseJamAudioMemory(localUserStore.getJamAudioMemory()),
    save: (value) => localUserStore.setJamAudioMemory(JSON.stringify(value)),
});
