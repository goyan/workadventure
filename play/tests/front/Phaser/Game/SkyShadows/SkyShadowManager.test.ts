import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkyLight } from "../../../../../src/front/Phaser/Game/Night/SkyLight";
import type { ShadowSourceEntity } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowCasters";

const draw = vi.fn();
const setAlpha = vi.fn();
const hide = vi.fn();
vi.mock("../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowLayer", () => ({
    SkyShadowLayer: class {
        draw = draw;
        setAlpha = setAlpha;
        hide = hide;
        destroy = vi.fn();
    },
}));
const { SkyShadowManager } = await import("../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowManager");

const sun: SkyLight = {
    body: "sun",
    azimuth: 180,
    elevation: 30,
    intensity: 1,
    color: 0xfff6e6,
    shadowLength: { min: 0, max: 128 },
};
const tree: ShadowSourceEntity = {
    x: 100,
    y: 100,
    displayWidth: 64,
    displayHeight: 96,
    elevation: 0,
    prefab: { collectionName: "Nature", id: "Nature:tree-oak" },
};

function setup(overrides: { light?: () => SkyLight | undefined; enabled?: () => boolean } = {}) {
    let light: SkyLight | undefined = sun;
    let entities: ShadowSourceEntity[] = [tree];
    const markDirty = vi.fn();
    const camera = { worldView: { x: 0, y: 0, width: 800, height: 600 }, zoom: 1 };
    const scene = { markDirty, cameras: { main: camera } };
    const manager = new SkyShadowManager(scene as never, {
        light: overrides.light ?? (() => light),
        entities: () => entities,
        outdoorGrid: () => undefined,
        outdoorVersion: () => 0,
        enabled: overrides.enabled ?? (() => true),
    });
    return {
        manager,
        markDirty,
        camera,
        setLight: (next: SkyLight | undefined) => (light = next),
        setEntities: (next: ShadowSourceEntity[]) => (entities = next),
    };
}

beforeEach(() => {
    draw.mockClear();
    setAlpha.mockClear();
    hide.mockClear();
});

describe("SkyShadowManager", () => {
    it("draws the shadows once, then not again at every image while nothing changes", () => {
        const { manager, markDirty } = setup();
        manager.update(0);
        expect(draw).toHaveBeenCalledTimes(1);
        expect(markDirty).toHaveBeenCalled();
        for (let time = 16; time < 3000; time += 16) manager.update(time);
        expect(draw).toHaveBeenCalledTimes(1);
    });

    it("draws again when the sun has moved, or when a tree is moved", () => {
        const { manager, setLight, setEntities } = setup();
        manager.update(0);
        setLight({ ...sun, azimuth: 181 });
        manager.update(16);
        expect(draw).toHaveBeenCalledTimes(2);
        setEntities([{ ...tree, x: 140 }]);
        manager.update(1000);
        expect(draw).toHaveBeenCalledTimes(3);
    });

    it("draws the shadow of the deck of a bridge on the ground, away from the light, once until it or the sun moves", () => {
        const { manager, setLight, setEntities } = setup();
        // A deck of one tile 20 px above the tile (10, 5), drawn 20 px further north.
        const deck: ShadowSourceEntity = {
            x: 320,
            y: 160 - 20,
            displayWidth: 32,
            displayHeight: 40,
            elevation: 20,
            prefab: { collectionName: "Carte Paliers", id: "Carte Paliers:dalle-bois:Default:Down" },
        };
        setEntities([deck]);
        setLight({ ...sun, azimuth: 90, elevation: 45 });
        manager.update(0);
        expect(draw).toHaveBeenCalledTimes(1);
        const polygons: { x: number; y: number }[][] = draw.mock.calls[0][2];
        // One shadow, 12 to 20 px west of the footprint of the deck on the ground.
        expect(polygons).toHaveLength(1);
        expect(Math.min(...polygons[0].map((point) => point.x))).toBeCloseTo(300, 5);
        expect(Math.max(...polygons[0].map((point) => point.x))).toBeCloseTo(340, 5);
        expect(Math.min(...polygons[0].map((point) => point.y))).toBeCloseTo(160, 5);
        expect(Math.max(...polygons[0].map((point) => point.y))).toBeCloseTo(192, 5);
        // A deck stands still: not drawn again while neither it nor the sun moves.
        for (let time = 16; time < 3000; time += 16) manager.update(time);
        expect(draw).toHaveBeenCalledTimes(1);
        setLight({ ...sun, azimuth: 91, elevation: 45 });
        manager.update(3016);
        expect(draw).toHaveBeenCalledTimes(2);
        setEntities([{ ...deck, x: 352 }]);
        manager.update(4000);
        expect(draw).toHaveBeenCalledTimes(3);
    });

    it("draws the shadow of a tree the wind lays down again at each pose, falling the way it falls", () => {
        let tilt = 0;
        let version = 0;
        const light: SkyLight = { ...sun, elevation: 60 };
        const markDirty = vi.fn();
        const scene = { markDirty, cameras: { main: { worldView: { x: 0, y: 0, width: 800, height: 600 }, zoom: 1 } } };
        const manager = new SkyShadowManager(scene as never, {
            light: () => light,
            entities: () => [{ ...tree, id: "oak" }],
            outdoorGrid: () => undefined,
            outdoorVersion: () => 0,
            enabled: () => true,
            // Falling to the east.
            treePose: (id) => (id === "oak" ? { towardX: 1, towardY: 0, tilt, size: 1 } : undefined),
            fallenVersion: () => version,
        });
        manager.update(0);
        expect(draw).toHaveBeenCalledTimes(1);
        // Where the crown of the tree lies once fallen: east of its foot (132, 196), as far as its crown is high.
        const crown = { x: 132 + 0.62 * 96, y: 196 };
        expect(manager.shadedAt(crown.x, crown.y)).toBe(false);
        tilt = Math.PI / 2;
        version++;
        manager.update(16);
        expect(draw).toHaveBeenCalledTimes(2);
        expect(manager.shadedAt(crown.x, crown.y)).toBe(true);
    });

    it("only changes the opacity when the light fades", () => {
        const { manager, setLight } = setup();
        manager.update(0);
        setLight({ ...sun, intensity: 0.5 });
        manager.update(16);
        expect(draw).toHaveBeenCalledTimes(1);
        expect(setAlpha).toHaveBeenCalledWith(expect.closeTo(0.2, 6));
    });

    it("moves the shadows with the sun while it fades: a fade does not hold back the half-degree step", () => {
        const { manager, setLight } = setup();
        manager.update(0);
        setLight({ ...sun, azimuth: 180.3, intensity: 0.8 });
        manager.update(16);
        expect(draw).toHaveBeenCalledTimes(1);
        setLight({ ...sun, azimuth: 180.6, intensity: 0.6 });
        manager.update(32);
        expect(draw).toHaveBeenCalledTimes(2);
    });

    it("does not draw again at every step of a zoom, only at each halving of the resolution", () => {
        const { manager, camera } = setup();
        manager.update(0);
        for (const [time, zoom] of [
            [16, 1.4],
            [32, 1.2],
            [48, 0.9],
            [64, 0.8],
            [80, 0.6],
        ] as const) {
            camera.zoom = zoom;
            manager.update(time);
        }
        // From 1 to 0.9 (resolution 1 to 0.5), then nothing until 0.5.
        expect(draw).toHaveBeenCalledTimes(2);
    });

    it("stops drawing, without stopping the game, when drawing fails", () => {
        const { manager } = setup();
        draw.mockImplementationOnce(() => {
            throw new Error("no canvas");
        });
        expect(() => manager.update(0)).not.toThrow();
        expect(hide).toHaveBeenCalled();
        manager.update(16);
        manager.update(1000);
        expect(draw).toHaveBeenCalledTimes(1);
    });

    it("hides the shadows without a light, or when they are turned off (map editor, personal setting)", () => {
        let enabled = true;
        const { manager, setLight } = setup({ enabled: () => enabled });
        manager.update(0);
        enabled = false;
        manager.update(16);
        expect(hide).toHaveBeenCalledTimes(1);
        enabled = true;
        manager.update(32);
        expect(draw).toHaveBeenCalledTimes(2);
        setLight(undefined);
        manager.update(48);
        expect(hide).toHaveBeenCalledTimes(2);
    });
});
