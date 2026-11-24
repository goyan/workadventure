import { describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { SwitchWiringView } from "../../../../../src/front/Phaser/Game/Switches/SwitchWiringView";

function createView() {
    const graphics = {
        setDepth: vi.fn(),
        clear: vi.fn(),
        lineStyle: vi.fn(),
        fillStyle: vi.fn(),
        lineBetween: vi.fn(),
        strokeCircle: vi.fn(),
        fillCircle: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        fillPath: vi.fn(),
        strokePath: vi.fn(),
        destroy: vi.fn(),
    };
    graphics.setDepth.mockReturnValue(graphics);
    const scene = { add: { graphics: () => graphics } } as unknown as GameScene;
    return { view: new SwitchWiringView(scene), graphics };
}

describe("SwitchWiringView", () => {
    it("draws the cone a sensor watches, from half its opening on each side of its direction", () => {
        const { view, graphics } = createView();

        expect(view.draw(undefined, { kind: "cone", x: 100, y: 100, reach: 96, direction: 90, angle: 90 })).toBe(true);

        const [x, y, reach, from, to] = graphics.arc.mock.calls[0];
        expect([x, y, reach]).toEqual([100, 100, 96]);
        expect(from).toBeCloseTo(Math.PI / 4);
        expect(to).toBeCloseTo((3 * Math.PI) / 4);
    });

    it("draws a disc for a sensor that senses all around, and the area of a sensor of an area", () => {
        const { view, graphics } = createView();
        view.draw(undefined, { kind: "cone", x: 100, y: 100, reach: 96, direction: 90, angle: 360 });
        expect(graphics.strokeCircle).toHaveBeenCalledWith(100, 100, 96);
        view.draw(undefined, { kind: "rect", x: 0, y: 0, width: 320, height: 160 });
        expect(graphics.strokeRect).toHaveBeenCalledWith(0, 0, 320, 160);
    });

    it("draws nothing again while nothing changed, and clears when nothing is selected", () => {
        const { view, graphics } = createView();
        const wiring = { from: { x: 0, y: 0 }, to: [{ x: 10, y: 10 }] };
        expect(view.draw(wiring)).toBe(true);
        expect(view.draw(wiring)).toBe(false);
        graphics.clear.mockClear();
        expect(view.draw(undefined)).toBe(true);
        expect(graphics.clear).toHaveBeenCalledOnce();
    });
});
