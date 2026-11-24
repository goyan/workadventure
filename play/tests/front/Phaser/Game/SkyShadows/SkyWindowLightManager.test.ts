import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { SkyLight } from "../../../../../src/front/Phaser/Game/Night/SkyLight";
import { computePlacements } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import type { ShadowSourceEntity } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowCasters";

const draw = vi.fn();
const setAlpha = vi.fn();
const hide = vi.fn();
vi.mock("../../../../../src/front/Phaser/Game/SkyShadows/SkyWindowLightLayer", () => ({
    SkyWindowLightLayer: class {
        draw = draw;
        setAlpha = setAlpha;
        hide = hide;
        destroy = vi.fn();
        textureKey = "sky-windows:0";
        revision = 1;
        square = { x: 0, y: 0, size: 320 };
    },
}));
const { SkyWindowLightManager } = await import("../../../../../src/front/Phaser/Game/SkyShadows/SkyWindowLightManager");
const { skyWindowLightsStore } = await import("../../../../../src/front/Stores/SkyWindowLightStore");

const shadowLength = { min: 0, max: 128 };
const sun: SkyLight = { body: "sun", azimuth: 180, elevation: 30, intensity: 1, color: 0xfff6e6, shadowLength };
const moon: SkyLight = { body: "moon", azimuth: 180, elevation: 30, intensity: 0.3, color: 0x9db4ff, shadowLength };

/** A room closed by walls, the cells from x = 40 to 160 and y = 64 to 128; a window in its south wall (the line 4). */
const grid = OutdoorGrid.fromWalls(320, 320, 8, [
    { x: 32, y: 32, width: 136, height: 32 },
    { x: 32, y: 128, width: 136, height: 32 },
    { x: 32, y: 32, width: 8, height: 128 },
    { x: 160, y: 32, width: 8, height: 128 },
]);

function windowed(): ShadowSourceEntity[] {
    const model = new MapLayerModel();
    for (const x of [1, 2, 3, 4]) model.setWall("h", x, 4, "blanc");
    model.setWindow(2, 4);
    return computePlacements(model).map((piece) => ({
        x: piece.x,
        y: piece.y,
        displayWidth: 32,
        displayHeight: 32,
        elevation: 0,
        prefab: { collectionName: piece.collectionName, id: piece.prefabId },
    }));
}

/** The same room, with a plain door in its south wall instead of a window. */
function doored(): ShadowSourceEntity[] {
    const model = new MapLayerModel();
    for (const x of [1, 2, 3, 4]) model.setWall("h", x, 4, "blanc");
    model.setDoor({ orientation: "h", x: 3, y: 4 });
    return computePlacements(model).map((piece, index) => ({
        id: `piece-${index}`,
        x: piece.x,
        y: piece.y,
        displayWidth: 32,
        displayHeight: 32,
        elevation: 0,
        prefab: { collectionName: piece.collectionName, id: piece.prefabId },
    }));
}

function setup(
    light: () => SkyLight | undefined,
    entities: ShadowSourceEntity[],
    isDoorOpen?: (entityId: string) => boolean,
) {
    const scene = {
        markDirty: vi.fn(),
        cameras: { main: { worldView: { x: 0, y: 0, width: 320, height: 320 }, zoom: 1 } },
    };
    return new SkyWindowLightManager(scene as never, {
        light,
        entities: () => entities,
        outdoorGrid: () => grid,
        outdoorVersion: () => 1,
        enabled: () => true,
        isDoorOpen,
    });
}

beforeEach(() => {
    draw.mockReset();
    hide.mockClear();
    skyWindowLightsStore.set([]);
});

describe("SkyWindowLightManager", () => {
    it("draws nothing and pierces nothing without a window", () => {
        const manager = setup(() => sun, []);
        manager.update(0);
        expect(draw).not.toHaveBeenCalled();
        expect(get(skyWindowLightsStore)).toEqual([]);
        manager.destroy();
    });

    it("pierces the night veil with the light of the moon through the windows, and not with the sun", () => {
        let light: SkyLight = moon;
        const manager = setup(() => light, windowed());
        manager.update(0);
        expect(draw).toHaveBeenCalledTimes(1);
        const lights = get(skyWindowLightsStore);
        expect(lights).toHaveLength(1);
        expect(lights[0].intensity).toBeCloseTo(0.3, 6);
        light = sun;
        manager.update(16);
        expect(get(skyWindowLightsStore)).toEqual([]);
        manager.destroy();
        expect(get(skyWindowLightsStore)).toEqual([]);
    });
    it("lets the sun in through a plain door while it is open, and no longer once it is closed", () => {
        let open = false;
        const manager = setup(
            () => sun,
            doored(),
            () => open,
        );
        manager.update(0);
        expect(draw).not.toHaveBeenCalled();

        open = true;
        // The walls are looked at again half a second later.
        manager.update(600);
        expect(draw).toHaveBeenCalledTimes(1);

        open = false;
        manager.update(1200);
        expect(hide).toHaveBeenCalled();
        manager.destroy();
    });

    it("stops drawing, without stopping the game, when drawing fails", () => {
        const manager = setup(() => moon, windowed());
        draw.mockImplementationOnce(() => {
            throw new Error("no canvas");
        });
        expect(() => manager.update(0)).not.toThrow();
        expect(get(skyWindowLightsStore)).toEqual([]);
        manager.update(1000);
        expect(draw).toHaveBeenCalledTimes(1);
        manager.destroy();
    });
});
