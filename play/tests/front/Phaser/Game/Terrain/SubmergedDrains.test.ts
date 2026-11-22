import { describe, expect, it, vi } from "vitest";
import { SubmergedDrains } from "@wa/front/Phaser/Game/Terrain/SubmergedDrains";
import type { DrainLike } from "@wa/front/Phaser/Game/Terrain/SubmergedDrains";

const drainAt = (x: number, y: number, properties: DrainLike extends { getEntityData(): infer D } ? D : never) => ({
    x,
    y,
    getEntityData: () => properties,
    setSubmerged: vi.fn<(submerged: boolean) => void>(),
});

describe("SubmergedDrains", () => {
    it("shows a drain under the water at its water point, and as it is once the water went down", () => {
        const drain = drainAt(100, 200, {
            properties: [{ id: "k", type: "waterSinkPropertyData", flow: 500, anchorX: 8, anchorY: 8 }],
        });
        let depth = 6;
        const asked: { x: number; y: number }[] = [];
        const drains = new SubmergedDrains(
            () => [drain],
            (x, y) => {
                asked.push({ x, y });
                return depth;
            },
        );

        drains.update(0);
        expect(asked).toEqual([{ x: 108, y: 208 }]);
        expect(drain.setSubmerged).toHaveBeenLastCalledWith(true);
        depth = 0.2;
        // Looked at again only a quarter of a second later.
        drains.update(100);
        expect(drain.setSubmerged).toHaveBeenCalledTimes(1);
        drains.update(300);
        expect(drain.setSubmerged).toHaveBeenLastCalledWith(false);
    });

    it("leaves alone what is not a drain", () => {
        const rug = drainAt(0, 0, { properties: [] });
        const fountain = drainAt(0, 0, {
            properties: [{ id: "s", type: "waterSourcePropertyData", flow: 500 }],
        });
        new SubmergedDrains(
            () => [rug, fountain],
            () => 50,
        ).update(0);

        expect(rug.setSubmerged).not.toHaveBeenCalled();
        expect(fountain.setSubmerged).not.toHaveBeenCalled();
    });
});
