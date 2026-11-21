import { describe, expect, it } from "vitest";
import { massLabel } from "../../../../../src/front/Phaser/Game/Terrain/WaterFlowOverlay";

const mass = { cells: 100, areaM2: 380, meanDepthM: 0.9, x: 0, y: 0 };
const plain = (text: string): string => text.replace(/\s/g, " ");

describe("massLabel", () => {
    it("tells the volume, the surface and the mean depth of a body of water, then how fast it fills", () => {
        const label = plain(massLabel({ ...mass, volumeM3: 342, trendM3PerMinute: 12 }));
        expect(label).toContain("342 m³");
        expect(label).toContain("380 m²");
        expect(label).toMatch(/0[.,]9 m/);
        expect(label).toContain("▲ +12 m³/min");
    });

    it("tells a body that empties, and one that neither fills nor empties", () => {
        expect(plain(massLabel({ ...mass, volumeM3: 342, trendM3PerMinute: -12 }))).toContain("▼ −12 m³/min");
        expect(massLabel({ ...mass, volumeM3: 342, trendM3PerMinute: 0.01 })).toMatch(/\n=$/);
    });
});
