import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { LEAF_SCATTER_CELL_PX, scatteredLeavesInView } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatter";
import { LeafScatterLayer } from "../../../../../src/front/Phaser/Game/Autumn/LeafScatterLayer";
import { LEAF_COLORS } from "../../../../../src/front/Phaser/Game/Autumn/LeafPalette";

const outdoors = () => true;

describe("scatteredLeavesInView", () => {
    it("places one leaf per 48 px cell", () => {
        const leaves = scatteredLeavesInView({ x: 0, y: 0, width: 480, height: 480 }, outdoors);
        expect(LEAF_SCATTER_CELL_PX).toBe(48);
        expect(leaves).toHaveLength(100);
        const cells = new Set(leaves.map((leaf) => `${Math.floor(leaf.x / 48)},${Math.floor(leaf.y / 48)}`));
        expect(cells.size).toBe(100);
    });

    it("is stable", () => {
        const first = scatteredLeavesInView({ x: 0, y: 0, width: 480, height: 480 }, outdoors);
        expect(scatteredLeavesInView({ x: 0, y: 0, width: 480, height: 480 }, outdoors)).toEqual(first);
        const shifted = scatteredLeavesInView({ x: 48, y: 0, width: 480, height: 480 }, outdoors);
        const key = (leaf: { x: number; y: number }) => `${leaf.x},${leaf.y}`;
        const firstKeys = new Set(first.map(key));
        expect(shifted.filter((leaf) => firstKeys.has(key(leaf)))).toHaveLength(90);
    });

    it("keeps outdoor leaves only", () => {
        const leaves = scatteredLeavesInView({ x: 0, y: 0, width: 480, height: 480 }, (x) => x < 240);
        expect(leaves.length).toBeGreaterThan(0);
        expect(leaves.every((leaf) => leaf.x < 240)).toBe(true);
    });

    it("uses the leaf palette", () => {
        const leaves = scatteredLeavesInView({ x: -480, y: -480, width: 960, height: 960 }, outdoors);
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
        expect(leaves.update({ x: 0, y: 0, width: 400, height: 400 }, outdoors, false)).toBe(true);
        expect(leaves.update({ x: 90, y: 0, width: 400, height: 400 }, outdoors, false)).toBe(false);
        expect(leaves.update({ x: 120, y: 0, width: 400, height: 400 }, outdoors, false)).toBe(true);
        expect(leaves.update({ x: 120, y: 0, width: 400, height: 400 }, outdoors, true)).toBe(true);
        expect(graphics.clear.mock.calls).toHaveLength(3);
        const sizes = new Set(graphics.fillRect.mock.calls.map(([, , width, height]) => `${width}x${height}`));
        expect([...sizes].sort()).toEqual(["3x4", "4x3"]);
        leaves.destroy();
        expect(graphics.destroy.mock.calls).toHaveLength(1);
    });
});
