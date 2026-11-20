import { describe, expect, it, vi } from "vitest";
import { GLINTS_MAX, glintsIn, WaterGlints } from "../../../../../src/front/Phaser/Game/Terrain/WaterGlints";

const view = { x: 0, y: 0, width: 960, height: 640 };
const lake = () => 20;
const dry = () => 0;
const flat = () => 0;

describe("the glints on the water", () => {
    it("shine on the water only, never on dry ground", () => {
        expect(glintsIn(view, 1000, dry, flat)).toHaveLength(0);
        expect(glintsIn(view, 1000, lake, flat).length).toBeGreaterThan(0);
        expect(glintsIn(view, 1000, () => 1, flat)).toHaveLength(0);
    });

    it("are the same at the same time, and others a moment later", () => {
        const now = glintsIn(view, 1000, lake, flat);
        expect(glintsIn(view, 1000, lake, flat)).toEqual(now);
        expect(glintsIn(view, 2500, lake, flat)).not.toEqual(now);
    });

    it("are never too many on the screen", () => {
        const wide = { x: 0, y: 0, width: 6000, height: 6000 };
        expect(glintsIn(wide, 1000, lake, flat).length).toBeLessThanOrEqual(GLINTS_MAX);
    });

    it("shine on the water drawn lower in a hollow", () => {
        const level = glintsIn(view, 1000, lake, flat);
        const low = glintsIn(view, 1000, lake, () => 40);
        expect(low.map((glint) => glint.y)).toEqual(level.map((glint) => glint.y + 40));
    });

    it("draws nothing for who asked for less motion", () => {
        const graphics = { clear: vi.fn(), fillStyle: vi.fn(), fillRect: vi.fn(), setDepth: vi.fn(), destroy: vi.fn() };
        graphics.setDepth.mockReturnValue(graphics);
        const scene = { add: { graphics: () => graphics }, cameras: { main: { worldView: view } }, markDirty: vi.fn() };
        const glints = new WaterGlints(scene as never, {
            waterAt: lake,
            dropAt: flat,
            reducedMotion: () => true,
            shown: () => true,
        });
        glints.update(1000);
        expect(graphics.fillRect).not.toHaveBeenCalled();
        const moving = new WaterGlints(scene as never, {
            waterAt: lake,
            dropAt: flat,
            reducedMotion: () => false,
            shown: () => true,
        });
        moving.update(1000);
        expect(graphics.fillRect).toHaveBeenCalled();
    });
});
