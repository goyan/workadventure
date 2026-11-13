import { describe, expect, it } from "vitest";
import { EditorToolName } from "../../../../src/front/Phaser/Game/MapEditor/EditorToolName";
import {
    editorToolForKey,
    editorToolShortcutDigit,
} from "../../../../src/front/Phaser/Game/MapEditor/EditorToolShortcuts";

function key(code: string, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent("keydown", { code, key, ...init });
}

describe("editorToolForKey", () => {
    // AZERTY PC top row without Shift: & é " ' ( - è _ ; Mac AZERTY: & é " ' ( § è !
    it.each([
        ["Digit1", "&", EditorToolName.ExploreTheRoom],
        ["Digit2", "é", EditorToolName.AreaEditor],
        ["Digit3", '"', EditorToolName.EntityEditor],
        ["Digit4", "'", EditorToolName.WAMSettingsEditor],
        ["Digit6", "§", EditorToolName.CloseMapEditor],
        ["Digit7", "è", EditorToolName.SelectionEditor],
        ["Digit8", "!", EditorToolName.MapLayerEditor],
    ])("reads the physical key %s (typed %s) on AZERTY", (code, typed, tool) => {
        expect(editorToolForKey(key(code, typed), true)).toEqual({ kind: "tool", tool });
    });

    it("accepts Shift (AZERTY digits) and the QWERTY digit", () => {
        expect(editorToolForKey(key("Digit8", "8", { shiftKey: true }), true)).toEqual({
            kind: "tool",
            tool: EditorToolName.MapLayerEditor,
        });
        expect(editorToolForKey(key("Digit8", "8"), true)).toEqual({
            kind: "tool",
            tool: EditorToolName.MapLayerEditor,
        });
    });

    it("reads numpad digits only when Num Lock types a digit", () => {
        expect(editorToolForKey(key("Numpad8", "8"), true)).toEqual({
            kind: "tool",
            tool: EditorToolName.MapLayerEditor,
        });
        expect(editorToolForKey(key("Numpad8", "ArrowUp"), true)).toEqual({ kind: "none" });
    });

    it("leaves the free digit 5 to the game", () => {
        expect(editorToolForKey(key("Digit5", "("), true)).toEqual({ kind: "none" });
    });

    it("ignores tool keys pressed with Ctrl, Cmd or Alt", () => {
        expect(editorToolForKey(key("Digit8", "_", { ctrlKey: true }), true)).toEqual({ kind: "none" });
        expect(editorToolForKey(key("Digit8", "!", { metaKey: true }), true)).toEqual({ kind: "none" });
        expect(editorToolForKey(key("Digit8", "¡", { altKey: true }), true)).toEqual({ kind: "none" });
    });

    it("swallows edit tools without the edit right, and keeps the explorer", () => {
        expect(editorToolForKey(key("Digit2", "é"), false)).toEqual({ kind: "unavailable" });
        expect(editorToolForKey(key("Digit8", "!"), false)).toEqual({ kind: "unavailable" });
        expect(editorToolForKey(key("Digit1", "&"), false)).toEqual({
            kind: "tool",
            tool: EditorToolName.ExploreTheRoom,
        });
    });

    it("closes the editor with the backtick, also as a dead key on the Backquote key", () => {
        const close = { kind: "tool", tool: EditorToolName.CloseMapEditor };
        expect(editorToolForKey(key("Backquote", "`"), true)).toEqual(close);
        expect(editorToolForKey(key("Backquote", "Dead"), true)).toEqual(close);
    });

    it("does not close the editor on the French circumflex dead key nor on the AZERTY PC ² key", () => {
        expect(editorToolForKey(key("BracketLeft", "Dead"), true)).toEqual({ kind: "none" });
        expect(editorToolForKey(key("Backquote", "²"), true)).toEqual({ kind: "none" });
    });
});

describe("editorToolShortcutDigit", () => {
    it("gives the digit shown in the toolbar tooltips", () => {
        expect(editorToolShortcutDigit(EditorToolName.ExploreTheRoom)).toBe(1);
        expect(editorToolShortcutDigit(EditorToolName.AreaEditor)).toBe(2);
        expect(editorToolShortcutDigit(EditorToolName.EntityEditor)).toBe(3);
        expect(editorToolShortcutDigit(EditorToolName.WAMSettingsEditor)).toBe(4);
        expect(editorToolShortcutDigit(EditorToolName.SelectionEditor)).toBe(7);
        expect(editorToolShortcutDigit(EditorToolName.MapLayerEditor)).toBe(8);
    });
});
