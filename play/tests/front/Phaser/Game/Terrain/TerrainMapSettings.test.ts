import { describe, expect, it, vi } from "vitest";

const { wam } = vi.hoisted(() => ({ wam: { current: undefined as { settings?: object } | undefined } }));
vi.mock("../../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({ getGameMap: () => ({ getWamFile: () => ({ getWam: () => wam.current }) }) }),
    },
}));

import { readTerrainMapSettings } from "../../../../../src/front/Phaser/Game/Terrain/TerrainMapSettings";

describe("readTerrainMapSettings", () => {
    it("reads the speed of the water of reality on a map that says nothing of it: the slider starts at 1", () => {
        wam.current = { settings: {} };
        expect(readTerrainMapSettings().speed).toBe(1);
        wam.current = undefined;
        expect(readTerrainMapSettings().speed).toBe(1);
    });

    it("reads the speed a map set", () => {
        wam.current = { settings: { water: { speed: 60 } } };
        expect(readTerrainMapSettings().speed).toBe(60);
    });

    it("reads no flood cut short and five states a second on a map that says nothing, its inertia off", () => {
        wam.current = { settings: {} };
        const settings = readTerrainMapSettings();
        expect(settings.maxSurface).toBe(256);
        expect(settings.updates).toBe(5);
        expect(settings.inertia).toBe(false);
    });
});
