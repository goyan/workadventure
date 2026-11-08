import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import {
    KICK_FADE_MS,
    KICK_FALL_MS,
    KICK_MAX,
    KickedLeafTrail,
    type KickedLeaf,
} from "../../../../../src/front/Phaser/Game/Autumn/KickedLeafTrail";
import { KickedLeafLayer } from "../../../../../src/front/Phaser/Game/Autumn/KickedLeafLayer";

/** Walks along x from `from` to `to`, 8 px every 50 ms (an ordinary walking speed). */
function walk(trail: KickedLeafTrail, from: number, to: number, running = false, start = 0): KickedLeaf[] {
    const leaves: KickedLeaf[] = [];
    for (let x = from, time = start; x <= to; x += 8, time += 50) {
        leaves.push(...trail.update([{ id: "a", x, y: 100, running }], time));
    }
    return leaves;
}

describe("KickedLeafTrail", () => {
    it("kicks 3 or 4 leaves every 24 px walking", () => {
        expect(walk(new KickedLeafTrail(() => true), 0, 48)).toHaveLength(7);
    });

    it("kicks 5 or 6 every 16 px running", () => {
        expect(walk(new KickedLeafTrail(() => true), 0, 32, true)).toHaveLength(11);
    });

    it("spreads leaves 8 to 14 px, never forward", () => {
        const leaves = walk(new KickedLeafTrail(() => true), 0, 240);
        expect(leaves.length).toBeGreaterThan(20);
        for (const leaf of leaves) {
            const distance = Math.hypot(leaf.dx, leaf.dy);
            expect(distance).toBeGreaterThanOrEqual(8);
            expect(distance).toBeLessThanOrEqual(14);
            expect(leaf.dx).toBeLessThanOrEqual(1e-9);
        }
    });

    it("kicks nothing indoors", () => {
        const leaves = walk(new KickedLeafTrail((x) => x >= 48), 0, 72);
        expect(leaves.length).toBeGreaterThan(0);
        expect(leaves.every((leaf) => leaf.x >= 48)).toBe(true);
    });

    it("ignores jumps and teleports", () => {
        const trail = new KickedLeafTrail(() => true);
        trail.update([{ id: "a", x: 0, y: 0, running: false }], 0);
        expect(trail.update([{ id: "a", x: 80, y: 0, running: false }], 500)).toEqual([]);
        expect(trail.update([{ id: "a", x: 130, y: 0, running: false }], 510)).toEqual([]);
    });
});

describe("KickedLeafLayer", () => {
    it("draws 5×3 tilted leaves, keeps 120 at most and fades them out", () => {
        const scene = mockDeep<Phaser.Scene>();
        scene.add.rectangle.mockImplementation(() => {
            const rectangle = mockDeep<Phaser.GameObjects.Rectangle>();
            rectangle.setDepth.mockReturnValue(rectangle);
            return rectangle;
        });
        const layer = new KickedLeafLayer(scene);
        const leaf: KickedLeaf = { x: 0, y: 0, dx: -8, dy: 0, color: 0xc8642a };
        layer.add(
            Array.from({ length: 130 }, () => leaf),
            0,
        );
        expect(KICK_MAX).toBe(120);
        expect(scene.add.rectangle.mock.calls[0].slice(2, 4)).toEqual([5, 3]);
        expect(layer.count).toBe(120);
        expect(layer.update(KICK_FALL_MS)).toBe(true);
        expect(layer.update(KICK_FALL_MS + KICK_FADE_MS)).toBe(false);
        expect(layer.count).toBe(0);
        layer.destroy();
    });
});
