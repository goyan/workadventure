import { describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { SnowEntity } from "../../../../../src/front/Phaser/Game/Christmas/SnowCaps";
import type { SeasonalDecorDeps } from "../../../../../src/front/Phaser/Game/Seasonal/SeasonalDecor";

const scatter = vi.hoisted(() => ({
    update: vi.fn((_view: unknown, _isGround: unknown, _sources: unknown, _force: boolean) => false),
    refreshGround: vi.fn((_isGround: unknown) => false),
    setVisible: vi.fn(),
    setAlpha: vi.fn(),
    destroy: vi.fn(),
}));
const piles = vi.hoisted(() => ({ rebuild: vi.fn(), setVisible: vi.fn(), setAlpha: vi.fn(), destroy: vi.fn() }));
const kicked = vi.hoisted(() => ({
    add: vi.fn(),
    update: vi.fn(() => false),
    setVisible: vi.fn(),
    setAlpha: vi.fn(),
    destroy: vi.fn(),
}));
vi.mock("../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer", () => ({
    LeafScatterLayer: class {
        public update = scatter.update;
        public refreshGround = scatter.refreshGround;
        public setVisible = scatter.setVisible;
        public setAlpha = scatter.setAlpha;
        public destroy = scatter.destroy;
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Autumn/LeafPiles", () => ({
    LeafPiles: class {
        public rebuild = piles.rebuild;
        public setVisible = piles.setVisible;
        public setAlpha = piles.setAlpha;
        public destroy = piles.destroy;
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Autumn/KickedLeafLayer", () => ({
    KickedLeafLayer: class {
        public add = kicked.add;
        public update = kicked.update;
        public setVisible = kicked.setVisible;
        public setAlpha = kicked.setAlpha;
        public destroy = kicked.destroy;
    },
}));

const { AutumnDecor } = await import("../../../../../src/front/Phaser/Game/Autumn/AutumnDecor");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");

const grid = OutdoorGrid.fromWalls(320, 320, 32, []);

function decor(deps: Partial<SeasonalDecorDeps> = {}) {
    const scene = mockDeep<Phaser.Scene>();
    scene.cameras.main.worldView.x = 0;
    scene.cameras.main.worldView.y = 0;
    scene.cameras.main.worldView.width = 800;
    scene.cameras.main.worldView.height = 600;
    return new AutumnDecor(scene, { isOutdoor: () => true, readPixels: () => undefined, ...deps });
}

/** An oak that loses its leaves, its foot at (32, 95). */
const oak: SnowEntity = {
    x: 0,
    y: 0,
    displayWidth: 64,
    displayHeight: 96,
    depth: 95,
    visible: true,
    texture: { key: "oak" },
    frame: { name: "0", width: 64, height: 96 },
    getPrefab: () => ({
        collectionName: "Nature",
        id: "Nature:tree-1-2:Default:Down",
        seasonal: { summer: "oak.png", autumn: "oak-autumn.png" },
    }),
};

/** Walks along y = 95 from x = 0 to 48, 8 px every 50 ms; returns whether a redraw was asked. */
function walkUnder(autumn: InstanceType<typeof AutumnDecor>, start = 0): boolean {
    autumn.update(start, [{ id: "a", x: 0, y: 95, running: false }]);
    let dirty = false;
    for (let x = 8, time = start + 50; x <= 48; x += 8, time += 50) {
        dirty = autumn.update(time, [{ id: "a", x, y: 95, running: false }]) || dirty;
    }
    return dirty;
}

describe("AutumnDecor", () => {
    it("redraws the scattered leaves when the ground changes", () => {
        const autumn = decor();
        autumn.redrawGround(grid);
        autumn.update(0, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(true);
        autumn.update(16, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(false);
    });

    it("rebuilds piles on rebuildObjects", () => {
        const autumn = decor();
        autumn.rebuildObjects([], grid);
        expect(piles.rebuild.mock.calls).toHaveLength(1);
    });

    it("kicks leaves for walkers under a tree and asks a redraw", () => {
        const autumn = decor();
        autumn.rebuildObjects([oak], grid);
        kicked.add.mockClear();
        expect(walkUnder(autumn)).toBe(true);
        expect(kicked.add.mock.calls.length).toBeGreaterThan(0);
    });

    it("kicks nothing where no tree dropped leaves, nor in the water", () => {
        const bare = decor();
        bare.rebuildObjects([], grid);
        kicked.add.mockClear();
        walkUnder(bare);
        expect(kicked.add.mock.calls).toHaveLength(0);
        const wet = decor({ isWet: () => true });
        wet.rebuildObjects([oak], grid);
        walkUnder(wet);
        expect(kicked.add.mock.calls).toHaveLength(0);
    });

    it("gives the scattered leaves the trees, the wind and the season, and no wet ground", () => {
        const autumn = decor({
            leafConditions: () => ({ windSpeed: 60, windFrom: 270, progress: 0.5 }),
            isWet: (x) => x > 100,
        });
        autumn.rebuildObjects([oak], grid);
        autumn.update(0, []);
        const [, isGround, sources] = scatter.update.mock.lastCall ?? [];
        expect(sources).toMatchObject({ trees: [{ x: 32, y: 95, width: 64 }], progress: 0.5 });
        expect(typeof isGround === "function" && isGround(50, 50)).toBe(true);
        expect(typeof isGround === "function" && isGround(150, 50)).toBe(false);
    });

    it("draws again when the trees or the wind change, and only when the wind changes enough", () => {
        let wind = { windSpeed: 20, windFrom: 270, progress: 1 };
        const autumn = decor({ leafConditions: () => wind });
        autumn.rebuildObjects([oak], grid);
        autumn.update(0, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(true);
        autumn.update(16, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(false);
        wind = { windSpeed: 22, windFrom: 272, progress: 1 };
        autumn.update(32, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(false);
        piles.rebuild.mockClear();
        wind = { windSpeed: 60, windFrom: 0, progress: 1 };
        autumn.update(48, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(true);
        // The piles follow the leaves on the ground.
        expect(piles.rebuild.mock.calls).toHaveLength(1);
        autumn.rebuildObjects([], grid);
        autumn.update(64, []);
        expect(scatter.update.mock.lastCall?.[3]).toBe(true);
    });

    it("looks where the leaves lie again when the water changes, at most every few seconds, without laying them again", () => {
        let version = 1;
        const autumn = decor({ waterVersion: () => version });
        autumn.update(0, []);
        scatter.refreshGround.mockClear();
        version = 2;
        autumn.update(1000, []);
        expect(scatter.refreshGround).not.toHaveBeenCalled();
        scatter.refreshGround.mockReturnValueOnce(true);
        expect(autumn.update(5000, [])).toBe(true);
        expect(scatter.refreshGround).toHaveBeenCalledTimes(1);
        expect(scatter.update.mock.lastCall?.[3]).toBe(false);
        autumn.update(5016, []);
        expect(scatter.refreshGround).toHaveBeenCalledTimes(1);
    });

    it("shows, hides and destroys its three layers", () => {
        const autumn = decor();
        autumn.setVisible(false);
        autumn.destroy();
        for (const layer of [scatter, piles, kicked]) {
            expect(layer.setVisible.mock.calls).toContainEqual([false]);
            expect(layer.destroy.mock.calls).toHaveLength(1);
        }
    });

    it("fades its three layers", () => {
        decor().setAlpha(0.6);
        for (const layer of [scatter, piles, kicked]) expect(layer.setAlpha).toHaveBeenLastCalledWith(0.6);
    });
});
