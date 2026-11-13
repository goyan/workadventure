import { EditorToolName } from "./EditorToolName";

interface EditorToolShortcut {
    digit: number;
    tool: EditorToolName;
    /** Tools that change the map need the map editor right; the explorer is open to everyone. */
    needsEditRight: boolean;
}

/** The digit keys of the map editor. 5 is free: outside these, a digit key keeps its game meaning (emotes). */
const EDITOR_TOOL_SHORTCUTS: readonly EditorToolShortcut[] = [
    { digit: 1, tool: EditorToolName.ExploreTheRoom, needsEditRight: false },
    { digit: 2, tool: EditorToolName.AreaEditor, needsEditRight: true },
    { digit: 3, tool: EditorToolName.EntityEditor, needsEditRight: true },
    { digit: 4, tool: EditorToolName.WAMSettingsEditor, needsEditRight: true },
    { digit: 6, tool: EditorToolName.CloseMapEditor, needsEditRight: true },
    { digit: 7, tool: EditorToolName.SelectionEditor, needsEditRight: true },
    { digit: 8, tool: EditorToolName.MapLayerEditor, needsEditRight: true },
];

/**
 * The digit of the key, read from its physical position (event.code): on AZERTY the top row types "&", "é"… without
 * Shift, but its code is still Digit1, Digit2… Numpad keys count only when they type a digit (Num Lock on), otherwise
 * they are arrows that already scroll the view. A synthetic event without a code falls back to the typed character.
 */
function digitOf(event: KeyboardEvent): number | undefined {
    const row = /^Digit([0-9])$/.exec(event.code);
    if (row) return Number(row[1]);
    const numpad = /^Numpad([0-9])$/.exec(event.code);
    if (numpad) return /^[0-9]$/.test(event.key) ? Number(numpad[1]) : undefined;
    if (event.code === "" && /^[0-9]$/.test(event.key)) return Number(event.key);
    return undefined;
}

export type EditorToolShortcutResult =
    /** Not a map editor shortcut: let the game handle the key. */
    | { kind: "none" }
    /** A tool key the user may not use (no edit right): swallowed, the editor stays as it is. */
    | { kind: "unavailable" }
    | { kind: "tool"; tool: EditorToolName };

export function editorToolForKey(event: KeyboardEvent, canEditMap: boolean): EditorToolShortcutResult {
    if (event.ctrlKey || event.metaKey || event.altKey) return { kind: "none" };
    if (isCloseEditorKey(event)) return { kind: "tool", tool: EditorToolName.CloseMapEditor };
    const digit = digitOf(event);
    const shortcut = EDITOR_TOOL_SHORTCUTS.find((candidate) => candidate.digit === digit);
    if (!shortcut) return { kind: "none" };
    if (shortcut.needsEditRight && !canEditMap) return { kind: "unavailable" };
    return { kind: "tool", tool: shortcut.tool };
}

/**
 * The backtick closes the editor, as before. Where it is a dead key on the Backquote key (US International) it still
 * does; other dead keys, such as the circumflex of a French keyboard, no longer close it.
 */
function isCloseEditorKey(event: KeyboardEvent): boolean {
    if (event.key === "`") return true;
    return event.key === "Dead" && event.code === "Backquote";
}

/** The digit shown next to a tool in the editor's toolbar, if it has one. */
export function editorToolShortcutDigit(tool: EditorToolName): number | undefined {
    return EDITOR_TOOL_SHORTCUTS.find((candidate) => candidate.tool === tool)?.digit;
}
