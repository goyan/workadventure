import { describe, expect, it } from "vitest";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import { SkyWindowLightLayer } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyWindowLightLayer";
import { area, fakeScene, square } from "./SkyLayerFakes";

describe("SkyWindowLightLayer, smoke", () => {
    it("draws patches kept in their room, and none, without throwing", () => {
        const grid = OutdoorGrid.fromWalls(320, 320, 8, [{ x: 32, y: 32, width: 8, height: 8 }]);
        const { scene, calls } = fakeScene(true);
        const layer = new SkyWindowLightLayer(scene);
        expect(() => layer.draw(area, 1, [], grid, 0xffffff, 0)).not.toThrow();
        expect(() => layer.draw(area, 0.25, [{ polygon: square, room: 0 }], grid, 0x9db4ff, 0.3)).not.toThrow();
        expect(calls.clip).toBe(1);
        expect(layer.revision).toBe(2);
        layer.destroy();
    });
});
