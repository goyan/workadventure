import { get } from "svelte/store";
import { mapEditorActivated } from "../../../Stores/MenuStore";
import type { GameScene } from "../GameScene";

/**
 * Whether this player may change the weather of the map (its weather, its place): the right to edit the map, and a
 * map and a connection to save it with. The same for the weather settings, the desktop app and the weather cards.
 */
export function canEditMapWeather(
    scene: Pick<GameScene, "connection" | "getMapEditorModeManager" | "getGameMap">,
): boolean {
    return Boolean(
        get(mapEditorActivated) &&
        scene.connection &&
        scene.getMapEditorModeManager() &&
        scene.getGameMap().getWamFile(),
    );
}
