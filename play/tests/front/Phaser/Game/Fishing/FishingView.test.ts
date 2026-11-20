import { describe, expect, it, vi } from "vitest";
import { FishingView } from "../../../../../src/front/Phaser/Game/Fishing/FishingView";

function graphics() {
    const object = {
        circles: [] as { x: number; y: number }[],
        setDepth: vi.fn(() => object),
        clear: vi.fn(),
        lineStyle: vi.fn(),
        lineBetween: vi.fn(),
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
});
