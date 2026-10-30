import { describe, expect, it } from "vitest";
import {
    getMapScrollDelta,
    getMapScrollDirection,
    isTextEditingTarget,
    shouldScrollMapOnKeyDown,
} from "../../../../src/front/Phaser/Game/MapEditor/EditorCameraKeys";
import type { MapScrollDirection } from "../../../../src/front/Phaser/Game/MapEditor/EditorCameraKeys";

const noModifier = { ctrlKey: false, metaKey: false, altKey: false };

describe("EditorCameraKeys", () => {
    it.each([
        ["ArrowUp", "up"],
        ["w", "up"],
        ["z", "up"],
        ["ArrowDown", "down"],
        ["s", "down"],
        ["ArrowLeft", "left"],
        ["a", "left"],
        ["q", "left"],
        ["ArrowRight", "right"],
        ["d", "right"],
        ["Z", "up"],
    ])("maps %s to %s", (key, direction) => {
        expect(getMapScrollDirection({ key, ...noModifier })).toBe(direction);
    });

    it("ignores other keys", () => {
        expect(getMapScrollDirection({ key: "e", ...noModifier })).toBeUndefined();
    });

    it.each(["ctrlKey", "metaKey", "altKey"])("leaves %s shortcuts (undo, redo...) to the editor", (modifier) => {
        expect(getMapScrollDirection({ key: "z", ...noModifier, [modifier]: true })).toBeUndefined();
    });

    it("does not scroll when the focus is in a text field", () => {
        expect(isTextEditingTarget(document.createElement("input"))).toBe(true);
        expect(isTextEditingTarget(document.createElement("textarea"))).toBe(true);
        expect(shouldScrollMapOnKeyDown(true, document.createElement("textarea"))).toBe(false);
    });

    it("does not scroll when user inputs are disabled", () => {
        expect(shouldScrollMapOnKeyDown(false, document.createElement("div"))).toBe(false);
    });

    it("scrolls when inputs are enabled and the focus is not in a text field", () => {
        expect(shouldScrollMapOnKeyDown(true, document.createElement("div"))).toBe(true);
        expect(shouldScrollMapOnKeyDown(true, null)).toBe(true);
    });

    it("moves 10 game pixels per frame at zoom 1, like the map explorer, and 20 at zoom 0.5", () => {
        const down = new Set<MapScrollDirection>(["down"]);
        expect(getMapScrollDelta(down, 1)).toEqual({ x: 0, y: 10 });
        expect(getMapScrollDelta(down, 0.5)).toEqual({ x: 0, y: 20 });
    });

    it("cancels opposite directions and combines diagonals", () => {
        expect(getMapScrollDelta(new Set<MapScrollDirection>(["left", "right"]), 1)).toEqual({ x: 0, y: 0 });
        expect(getMapScrollDelta(new Set<MapScrollDirection>(["up", "left"]), 1)).toEqual({ x: -10, y: -10 });
    });
});
