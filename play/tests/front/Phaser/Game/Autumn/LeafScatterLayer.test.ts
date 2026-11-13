import { describe, expect, it, vi } from "vitest";
import { LeafScatterLayer } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer";

describe("LeafScatterLayer", () => {
    it("fades its leaves with the layer alpha", () => {
        const graphics = { setDepth: vi.fn(() => graphics), setAlpha: vi.fn(() => graphics) };
        const scene = { add: { graphics: () => graphics } } as unknown as Phaser.Scene;
        new LeafScatterLayer(scene).setAlpha(0.6);
        expect(graphics.setAlpha).toHaveBeenLastCalledWith(0.6);
    });
});
