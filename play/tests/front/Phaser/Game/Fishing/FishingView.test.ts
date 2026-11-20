import { describe, expect, it, vi } from "vitest";
import { FishingView } from "../../../../../src/front/Phaser/Game/Fishing/FishingView";

function graphics() {
    const object = {
        circles: [] as { x: number; y: number }[],
        setDepth: vi.fn(() => object),
        clear: vi.fn(),
        lineStyle: vi.fn(),
        lines: [] as number[][],
        lineBetween: vi.fn((...points: number[]) => object.lines.push(points)),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokePath: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        strokeCircle: vi.fn(),
        fillCircle: vi.fn((x: number, y: number) => object.circles.push({ x, y })),
        destroy: vi.fn(),
    };
    return object;
}

describe("the float of a fishing line", () => {
    it("floats on the water drawn lower in a hollow", () => {
        const drawn = graphics();
        const scene = { add: { graphics: () => drawn }, markDirty: vi.fn() };
        const view = new FishingView(scene as never, true, () => 30);
        view.update(0, [], [{ userId: 1, x: 100, y: 200, state: 0 } as never], undefined);
        expect(drawn.circles[0]).toEqual({ x: 100, y: 230 });
    });

    it("draws the rod of a player at the bottom of a hollow as low as the player", () => {
        const drawn = graphics();
        const scene = { add: { graphics: () => drawn }, markDirty: vi.fn() };
        const level = new FishingView(scene as never, true, () => 0);
        const holder = { userId: 1, x: 100, y: 200, direction: "down", seated: false } as never;
        level.update(0, [holder], [], undefined);
        const atLevel = drawn.lines[0];
        const low = graphics();
        new FishingView({ add: { graphics: () => low }, markDirty: vi.fn() } as never, true, () => 30).update(
            0,
            [holder],
            [],
            undefined,
        );
        expect(low.lines[0][1]).toBe(atLevel[1] + 30);
        expect(low.lines[0][3]).toBe(atLevel[3] + 30);
    });
});
