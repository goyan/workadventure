import type { EditorToolName } from "./EditorToolName";

export interface ToolPause {
    /** The tool to equip now: `null` puts the current one aside, absent leaves the editor as it is. */
    equip?: EditorToolName | null;
    /** The tool put aside, to take back when the catastrophe is disarmed. */
    paused: EditorToolName | undefined;
}

/**
 * What the map editor does with its tool when a catastrophe is armed or disarmed while it is open: the armed
 * catastrophe owns the click on the map, so the tool is put aside, and comes back once nothing is armed.
 */
export function toolPauseFor(
    armed: boolean,
    activeTool: EditorToolName | undefined,
    paused: EditorToolName | undefined,
): ToolPause {
    if (armed) {
        return activeTool === undefined ? { paused } : { equip: null, paused: activeTool };
    }
    if (activeTool === undefined && paused !== undefined) {
        return { equip: paused, paused: undefined };
    }
    return { paused: undefined };
}
