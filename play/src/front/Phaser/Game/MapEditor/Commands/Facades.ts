import type { UpdateWAMSettingsMessage } from "@workadventure/messages";
import { cellOf } from "@workadventure/map-editor";
import { gameManager } from "../../GameManager";
import { UpdateWAMSettingFrontCommand } from "./WAM/UpdateWAMSettingFrontCommand";
import { UpdateTerrainFrontCommand } from "./Terrain/UpdateTerrainFrontCommand";

/**
 * A simple facade function that creates a UpdateWAMSettingFrontCommand and executes it.
 */
export async function executeUpdateWAMSettings(
    updateWAMSettingsMessage: UpdateWAMSettingsMessage["message"],
): Promise<void> {
    const scene = gameManager.getCurrentGameScene();
    const wamFile = scene.wamFile ?? scene.getGameMap().getWamFile()?.getWam();
    if (!wamFile || !scene.connection) {
        return;
    }
    await scene.getMapEditorModeManager()?.executeCommand(
        new UpdateWAMSettingFrontCommand(
            wamFile,
            {
                message: updateWAMSettingsMessage,
            },
            scene.connection?.getAllTags(),
            scene.roomUrl,
        ),
    );
}

/**
 * Sets the height of cells of the relief (by cell key), the maximum depth of the map and the soil of cells when
 * given, through the history of the editor: one command, undone as one.
 */
export async function executeUpdateTerrain(
    changes: ReadonlyMap<string, number>,
    maxDepthTiles?: number,
    soilChanges?: ReadonlyMap<string, number>,
): Promise<void> {
    const scene = gameManager.getCurrentGameScene();
    const wamFile = scene.wamFile ?? scene.getGameMap().getWamFile()?.getWam();
    if (!wamFile || !scene.connection || (changes.size === 0 && maxDepthTiles === undefined && !soilChanges?.size)) {
        return;
    }
    const cells = [...changes].map(([key, height]) => ({ ...cellOf(key), height }));
    const soils = [...(soilChanges ?? [])].map(([key, soil]) => ({ ...cellOf(key), soil }));
    await scene
        .getMapEditorModeManager()
        ?.executeCommand(new UpdateTerrainFrontCommand(wamFile, { cells, maxDepthTiles, soils }));
}
