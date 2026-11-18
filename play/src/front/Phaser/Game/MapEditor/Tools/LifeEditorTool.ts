import type { EditMapCommandMessage } from "@workadventure/messages";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import { MapEditorTool } from "./MapEditorTool";

/**
 * The life tool of the map editor: the figures of the life of the water of the map and its settings, in its panel
 * (LifeEditor.svelte). Nothing is done on the map itself; the settings are saved by the panel, as map settings.
 */
export class LifeEditorTool extends MapEditorTool {
    public update(_time: number, _dt: number): void {
        // Nothing to be done
    }
    public clear(): void {
        // Nothing to be done
    }
    public activate(): void {
        // Nothing to be done
    }
    public destroy(): void {
        // Nothing to be done
    }
    public subscribeToGameMapFrontWrapperEvents(_gameMapFrontWrapper: GameMapFrontWrapper): void {
        // Nothing to be done
    }
    public handleKeyDownEvent(_event: KeyboardEvent): void {
        // Nothing to be done
    }
    public handleIncomingCommandMessage(_editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        // The settings tool applies the commands of the map settings.
        return Promise.resolve();
    }
}
