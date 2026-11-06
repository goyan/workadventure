import { gameManager } from "../Phaser/Game/GameManager";
import { createGameJamAudioSession } from "./JamAudioSession";

/** The media session of the Jams of the room being played. */
export const jamAudioSession = createGameJamAudioSession(() => gameManager.getCurrentGameScene());
