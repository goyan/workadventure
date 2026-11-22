import { describe, expect, it, vi } from "vitest";
import { strokeRing, strokeStreak, streakLowered } from "../../../../../src/front/Phaser/Game/Terrain/WaterFlowStrokes";

function graphics() {
    return {
        lineStyle: vi.fn(),
        lineBetween: vi.fn(),
        strokeCircle: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
    };
}

describe("the foam and the rings of the moving water", () => {
    const streak = { fromX: 10, fromY: 20, toX: 16, toY: 20, alpha: 0.4 };

    it("are smooth white lines that fade over the ground drawn flat, as they always were", () => {
        const drawn = graphics();
        strokeStreak(drawn, streak, false);
        expect(drawn.lineStyle).toHaveBeenCalledWith(1.5, 0xffffff, 0.4);
        expect(drawn.lineBetween).toHaveBeenCalledWith(10, 20, 16, 20);
        expect(drawn.fillRect).not.toHaveBeenCalled();
        strokeRing(drawn, 100, 50, { radius: 12, alpha: 0.7 }, false);
        expect(drawn.lineStyle).toHaveBeenLastCalledWith(1.5, 0xe8f6ff, 0.7);
        expect(drawn.strokeCircle).toHaveBeenCalledWith(100, 50, 12);
        expect(drawn.fillRect).not.toHaveBeenCalled();
    });

    it("are whole pixels of two shades over the relief in pixel art: no smoothed line", () => {
        const drawn = graphics();
        strokeStreak(drawn, streak, true);
        expect(drawn.lineBetween).not.toHaveBeenCalled();
        // Fading (alpha under a half): the darker shade, opaque.
        expect(drawn.fillStyle).toHaveBeenCalledWith(0x9fc3db, 1);
        expect(drawn.fillRect.mock.calls).toEqual([10, 11, 12, 13, 14, 15, 16].map((x) => [x, 20, 1, 1]));
        strokeStreak(drawn, { ...streak, alpha: 0.9 }, true);
        expect(drawn.fillStyle).toHaveBeenLastCalledWith(0xd6ecf6, 1);
        const before = drawn.fillRect.mock.calls.length;
        strokeRing(drawn, 100, 50, { radius: 12, alpha: 0.7 }, true);
        expect(drawn.strokeCircle).not.toHaveBeenCalled();
        expect(drawn.fillStyle).toHaveBeenLastCalledWith(0xe8f6ff, 1);
        expect(drawn.fillRect.mock.calls.length).toBeGreaterThan(before);
    });
});

describe("a streak of foam on a water drawn lower", () => {
    it("is laid where its water is drawn, the relief seen in 3/4: both its ends as much lower", () => {
        const streak = { fromX: 10, fromY: 20, toX: 18, toY: 24, alpha: 0.6 };
        expect(streakLowered(streak, 48)).toEqual({ fromX: 10, fromY: 68, toX: 18, toY: 72, alpha: 0.6 });
    });

    it("is itself on a water drawn at its place", () => {
        const streak = { fromX: 10, fromY: 20, toX: 18, toY: 24, alpha: 0.6 };
        expect(streakLowered(streak, 0)).toBe(streak);
    });
});
