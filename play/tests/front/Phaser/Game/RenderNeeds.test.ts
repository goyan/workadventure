import { describe, expect, it } from "vitest";
import { hasRunningTween } from "@wa/front/Phaser/Game/RenderNeeds";

describe("hasRunningTween", () => {
    it("asks for a redraw only for a tween that runs, not for one kept paused", () => {
        expect(hasRunningTween([])).toBe(false);
        expect(hasRunningTween([{ isPaused: () => true }])).toBe(false);
        expect(hasRunningTween([{ isPaused: () => true }, { isPaused: () => false }])).toBe(true);
    });
});
