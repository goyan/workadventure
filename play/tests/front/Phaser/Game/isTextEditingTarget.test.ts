import { describe, expect, it } from "vitest";
import { isTextEditingTarget } from "../../../../src/front/Phaser/Game/MapEditor/isTextEditingTarget";

describe("isTextEditingTarget", () => {
    it("detects the form fields", () => {
        expect(isTextEditingTarget(document.createElement("input"))).toBe(true);
        expect(isTextEditingTarget(document.createElement("textarea"))).toBe(true);
        expect(isTextEditingTarget(document.createElement("select"))).toBe(true);
    });

    it("ignores other targets", () => {
        expect(isTextEditingTarget(document.createElement("div"))).toBe(false);
        expect(isTextEditingTarget(null)).toBe(false);
    });
});
