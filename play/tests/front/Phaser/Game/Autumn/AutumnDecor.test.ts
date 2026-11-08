import { describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";

const scatter = vi.hoisted(() => ({
    update: vi.fn((_view: unknown, _isOutdoor: unknown, _force: boolean) => false),
    setVisible: vi.fn(),
    destroy: vi.fn(),
}));
const piles = vi.hoisted(() => ({ rebuild: vi.fn(), setVisible: vi.fn(), destroy: vi.fn() }));
const kicked = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(() => false), setVisible: vi.fn(), destroy: vi.fn() }));
vi.mock("../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer", () => ({
    LeafScatterLayer: class {
        public update = scatter.update;
        public setVisible = scatter.setVisible;
        public destroy = scatter.destroy;
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Autumn/LeafPiles", () => ({
    LeafPiles: class {
        public rebuild = piles.rebuild;
        public setVisible = piles.setVisible;
        public destroy = piles.destroy;
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/Autumn/KickedLeafLayer", () => ({
    KickedLeafLayer: class {
        public add = kicked.add;
        public update = kicked.update;
        public setVisible = kicked.setVisible;
        public destroy = kicked.destroy;
    },
}));

const { AutumnDecor } = await import("../../../../../src/front/Phaser/Game/Autumn/AutumnDecor");
const { OutdoorGrid } = await import("../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid");

const grid = OutdoorGrid.fromWalls(320, 320, 32, []);

function decor() {
    const scene = mockDeep<Phaser.Scene>();
    scene.cameras.main.worldView.x = 0;
    scene.cameras.main.worldView.y = 0;
    scene.cameras.main.worldView.width = 800;
    scene.cameras.main.worldView.height = 600;
    return new AutumnDecor(scene, { isOutdoor: () => true, readPixels: () => undefined });
}

describe("AutumnDecor", () => {
    it("redraws the scattered leaves when the ground changes", () => {
        const autumn = decor();
        autumn.redrawGround(grid);
        autumn.update(0, []);
        expect(scatter.update.mock.lastCall?.[2]).toBe(true);
        autumn.update(16, []);
        expect(scatter.update.mock.lastCall?.[2]).toBe(false);
    });

    it("rebuilds piles on rebuildObjects", () => {
        const autumn = decor();
        autumn.rebuildObjects([], grid);
        expect(piles.rebuild.mock.calls).toHaveLength(1);
    });

    it("kicks leaves for walkers and asks a redraw", () => {
        const autumn = decor();
        autumn.update(0, [{ id: "a", x: 0, y: 0, running: false }]);
        let dirty = false;
        for (let x = 8, time = 50; x <= 48; x += 8, time += 50) {
            dirty = autumn.update(time, [{ id: "a", x, y: 0, running: false }]) || dirty;
        }
        expect(kicked.add.mock.calls.length).toBeGreaterThan(0);
        expect(dirty).toBe(true);
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
});
