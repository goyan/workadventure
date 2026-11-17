import { describe, expect, it } from "vitest";
import { SkyShadowLayer } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowLayer";
import { area, fakeScene, square } from "./SkyLayerFakes";

describe("SkyShadowLayer, smoke", () => {
    it("draws, with nothing to draw, at no light, zoomed far out, and without a texture, without throwing", () => {
        const { scene, image, calls } = fakeScene(true);
        const layer = new SkyShadowLayer(scene);
        expect(() => layer.draw(area, 1, [], [], 0x0d1428, 0)).not.toThrow();
        expect(() => layer.draw(area, 0.01, [square, []], [{ x: 0, y: 0, width: 8, height: 8 }], 0, 0.4)).not.toThrow();
        expect(() => layer.draw({ x: 0, y: 0, width: 0, height: 0 }, 1, [square], [], 0, 1)).not.toThrow();
        expect(calls.fill).toBe(3);
        expect(image.visible).toBe(true);
        layer.hide();
        expect(image.visible).toBe(false);
        layer.destroy();
        const none = fakeScene(false);
        expect(() => new SkyShadowLayer(none.scene).draw(area, 1, [square], [], 0, 1)).not.toThrow();
    });
});
