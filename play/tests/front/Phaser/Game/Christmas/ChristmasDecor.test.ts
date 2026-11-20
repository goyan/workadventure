import { describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";

const prints = vi.hoisted(() => ({
    add: vi.fn(),
    update: vi.fn(),
    setVisible: vi.fn(),
    setAlpha: vi.fn(),
    destroy: vi.fn(),
    count: 0,
}));
const caps = vi.hoisted(() => ({ rebuild: vi.fn(), setVisible: vi.fn(), setAlpha: vi.fn(), destroy: vi.fn() }));
vi.mock("../../../../../src/front/Phaser/Game/Christmas/FootprintLayer", () => ({
    FootprintLayer: class {
        public add = prints.add;
        public update = prints.update;
        public setVisible = prints.setVisible;
        public setAlpha = prints.setAlpha;
        public destroy = prints.destroy;
        public get count(): number {
            return prints.count;
        }
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Christmas/SnowCaps", () => ({
    SnowCaps: class {
        public rebuild = caps.rebuild;
        public setVisible = caps.setVisible;
        public setAlpha = caps.setAlpha;
        public destroy = caps.destroy;
    },
}));

const { ChristmasDecor } = await import("../../../../../src/front/Phaser/Game/Christmas/ChristmasDecor");

function decor() {
    return new ChristmasDecor(mockDeep<Phaser.Scene>(), { isOutdoor: () => true, readPixels: () => undefined });
}

describe("ChristmasDecor", () => {
    it("leaves no footprint: they are the terrain's, all the year", () => {
        const christmas = decor();
        christmas.update(0, [{ id: "a", x: 0, y: 0, running: false }]);
        expect(christmas.update(500, [{ id: "a", x: 20, y: 0, running: false }])).toBe(false);
        expect(prints.add).not.toHaveBeenCalled();
    });

    it("shows, hides and destroys all its layers", () => {
        const christmas = decor();
        christmas.setVisible(false);
        christmas.destroy();
        for (const layer of [caps]) {
            expect(layer.setVisible).toHaveBeenCalledWith(false);
            expect(layer.destroy).toHaveBeenCalled();
        }
    });

    it("fades all its layers", () => {
        decor().setAlpha(0.4);
        for (const layer of [caps]) expect(layer.setAlpha).toHaveBeenLastCalledWith(0.4);
    });
});
