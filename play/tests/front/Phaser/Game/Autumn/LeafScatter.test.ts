import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { quantizeWind, type LeafSources } from "../../../../../src/front/Phaser/Game/Autumn/LeafDensity";
import { scatteredLeavesInView } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatter";
import { LeafScatterLayer } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer";
import { LEAF_COLORS } from "../../../../../src/front/Phaser/Game/Autumn/LeafPalette";

const outdoors = () => true;
const view = { x: 0, y: 0, width: 960, height: 960 };
/** One oak in the middle of the view, at the end of autumn, a strong wind from the west. */
const oak: LeafSources = {
    trees: [{ x: 480, y: 480, width: 64 }],
    wind: quantizeWind(60, 270),
    progress: 1,
};

describe("scatteredLeavesInView", () => {
    it("drops no leaf without a tree: an open lawn, a beach or the sea stays bare", () => {
        expect(scatteredLeavesInView(view, outdoors, { ...oak, trees: [] })).toEqual([]);
    });

    it("lays the leaves around the trees only", () => {
        const leaves = scatteredLeavesInView(view, outdoors, oak);
        expect(leaves.length).toBeGreaterThan(20);
        expect(leaves.every((leaf) => Math.hypot(leaf.x - 480, leaf.y - 480) < 300)).toBe(true);
    });

    it("blows them downwind", () => {
        const leaves = scatteredLeavesInView(view, outdoors, oak);
        const east = leaves.filter((leaf) => leaf.x > 520).length;
        const west = leaves.filter((leaf) => leaf.x < 440).length;
        expect(east).toBeGreaterThan(2 * west);
    });

    it("keeps leaves off the ground that cannot hold them (indoors, water)", () => {
        const leaves = scatteredLeavesInView(view, (x) => x < 480, oak);
        expect(leaves.length).toBeGreaterThan(0);
        expect(leaves.every((leaf) => leaf.x < 480)).toBe(true);
    });

    it("is the same for everyone, and does not move with the view", () => {
        const first = scatteredLeavesInView(view, outdoors, oak);
        expect(scatteredLeavesInView(view, outdoors, oak)).toEqual(first);
        const shifted = scatteredLeavesInView({ ...view, x: 160 }, outdoors, oak);
        const key = (leaf: { x: number; y: number }) => `${leaf.x},${leaf.y}`;
        const firstKeys = new Set(first.map(key));
        const inBoth = first.filter((leaf) => leaf.x >= 160);
        expect(shifted.filter((leaf) => firstKeys.has(key(leaf)))).toHaveLength(inBoth.length);
    });

    it("uses the leaf palette", () => {
        const leaves = scatteredLeavesInView(view, outdoors, oak);
        expect(leaves.every((leaf) => (LEAF_COLORS as readonly number[]).includes(leaf.color))).toBe(true);
        expect(new Set(leaves.map((leaf) => leaf.color)).size).toBe(LEAF_COLORS.length);
    });
});

describe("LeafScatterLayer", () => {
    function layer() {
        const scene = mockDeep<Phaser.Scene>();
        const graphics = mockDeep<Phaser.GameObjects.Graphics>();
        graphics.setDepth.mockReturnValue(graphics);
        graphics.clear.mockReturnValue(graphics);
        scene.add.graphics.mockReturnValue(graphics);
        return { graphics, leaves: new LeafScatterLayer(scene) };
    }

    it("redraws only when the view leaves the drawn margin, or when forced", () => {
        const { graphics, leaves } = layer();
        const near = { ...oak, trees: [{ x: 200, y: 200, width: 64 }] };
        expect(leaves.update({ x: 0, y: 0, width: 400, height: 400 }, outdoors, near, false)).toBe(true);
        expect(leaves.update({ x: 90, y: 0, width: 400, height: 400 }, outdoors, near, false)).toBe(false);
        expect(leaves.update({ x: 120, y: 0, width: 400, height: 400 }, outdoors, near, false)).toBe(true);
        expect(leaves.update({ x: 120, y: 0, width: 400, height: 400 }, outdoors, near, true)).toBe(true);
        expect(graphics.clear.mock.calls).toHaveLength(3);
        const sizes = new Set(graphics.fillRect.mock.calls.map(([, , width, height]) => `${width}x${height}`));
        expect([...sizes].sort()).toEqual(["3x4", "4x3"]);
        leaves.destroy();
        expect(graphics.destroy.mock.calls).toHaveLength(1);
    });

    it("redraws when the water changes only if a drawn leaf is reached or left by it", () => {
        const { graphics, leaves } = layer();
        const near = { ...oak, trees: [{ x: 200, y: 200, width: 64 }] };
        leaves.update({ x: 0, y: 0, width: 400, height: 400 }, outdoors, near, false);
        const all = graphics.fillRect.mock.calls.length;
        graphics.clear.mockClear();
        // A lake far from the leaves: nothing to draw again.
        expect(leaves.refreshGround((x) => x < 600)).toBe(false);
        expect(graphics.clear.mock.calls).toHaveLength(0);
        // The water reaches the foot of the tree: the leaves it covers go.
        graphics.fillRect.mockClear();
        expect(leaves.refreshGround((x) => x < 200)).toBe(true);
        expect(graphics.fillRect.mock.calls.length).toBeGreaterThan(0);
        expect(graphics.fillRect.mock.calls.length).toBeLessThan(all);
        for (const [x] of graphics.fillRect.mock.calls) expect(x).toBeLessThan(200);
    });
});
