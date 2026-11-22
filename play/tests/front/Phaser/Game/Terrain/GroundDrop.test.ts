import { describe, expect, it, vi } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import {
    drawLower,
    DropCache,
    footOf,
    groundDropOf,
    hitWhereDrawn,
    PlacedDrops,
    standsOnGround,
} from "../../../../../src/front/Phaser/Game/Terrain/GroundDrop";

/** A relief of one height on the cells 10 to 13 across and 10 to 21 down (x 168 to 216, y 168 to 344 in its middle). */
function plateau(height: number): TerrainData {
    return withHeights(
        undefined,
        new Map(
            Array.from({ length: 4 * 12 }, (_, index): [string, number] => [
                cellKey(10 + (index % 4), 10 + Math.floor(index / 4)),
                height,
            ]),
        ),
    );
}

describe("how much lower what stands on the ground is drawn, the relief seen in 3/4", () => {
    it("is half the depth of the ground under its foot, and higher on a mount", () => {
        expect(groundDropOf(plateau(-64), 192, 250)).toBe(32);
        expect(groundDropOf(plateau(-128), 192, 250)).toBe(64);
        expect(groundDropOf(plateau(256), 192, 250)).toBe(-128);
    });

    it("is nothing on flat ground, out of the relief, or on a map without one", () => {
        expect(groundDropOf(plateau(-64), 192, 60)).toBe(0);
        expect(groundDropOf(plateau(-64), -500, -500)).toBe(0);
        expect(groundDropOf(undefined, 192, 250)).toBe(0);
    });

    it("follows the slope between two cells, as the ground is drawn", () => {
        // Half way between the last cell of the plateau (centre at y 344) and the flat one after it (centre at 360).
        expect(groundDropOf(plateau(-64), 192, 352)).toBe(16);
    });
});

describe("the drops kept for the things that do not move", () => {
    it("reads the ground once for a thing that stays, again when it moved or the relief changed", () => {
        const cache = new DropCache<string>();
        const read = vi.fn((x: number, y: number) => x + y);
        expect(cache.dropOf("tree", 10, 20, 1, read)).toBe(30);
        expect(cache.dropOf("tree", 10, 20, 1, read)).toBe(30);
        expect(read).toHaveBeenCalledTimes(1);
        // It moved.
        expect(cache.dropOf("tree", 10, 21, 1, read)).toBe(31);
        expect(read).toHaveBeenCalledTimes(2);
        // The relief changed under it.
        read.mockReturnValue(7);
        expect(cache.dropOf("tree", 10, 21, 2, read)).toBe(7);
        expect(read).toHaveBeenCalledTimes(3);
    });

    it("keeps each thing apart, and forgets one that is gone", () => {
        const cache = new DropCache<string>();
        const read = vi.fn(() => 5);
        cache.dropOf("a", 0, 0, 1, read);
        cache.dropOf("b", 0, 0, 1, read);
        expect(read).toHaveBeenCalledTimes(2);
        cache.forget("a");
        cache.dropOf("a", 0, 0, 1, read);
        cache.dropOf("b", 0, 0, 1, read);
        expect(read).toHaveBeenCalledTimes(3);
    });
});

describe("what stands on the ground among the objects of a map", () => {
    it("is a tree or a desk put on the ground", () => {
        expect(standsOnGround({ cartePiece: false, layer: undefined, elevation: 0 })).toBe(true);
        expect(standsOnGround({ cartePiece: false, layer: "standing", elevation: 0 })).toBe(true);
    });

    it("is not a piece of the Carte tool, a rug, a ceiling lamp, nor anything above the ground", () => {
        // Floors, walls, slabs, stairs, bridges: a building moved piece by piece would tear.
        expect(standsOnGround({ cartePiece: true, layer: undefined, elevation: 0 })).toBe(false);
        expect(standsOnGround({ cartePiece: false, layer: "floor", elevation: 0 })).toBe(false);
        expect(standsOnGround({ cartePiece: false, layer: "overhead", elevation: 0 })).toBe(false);
        // On a raised floor or hung on a wall: it passes over the relief.
        expect(standsOnGround({ cartePiece: false, layer: undefined, elevation: 52 })).toBe(false);
    });

    it("has its foot at the middle of its bottom edge", () => {
        expect(footOf({ x: 100, y: 200, displayWidth: 64, displayHeight: 96 })).toEqual({ x: 132, y: 296 });
    });
});

describe("the objects of a map drawn where their ground is", () => {
    function thing(x: number, y: number, stands = true) {
        const self = {
            x,
            y,
            displayWidth: 32,
            displayHeight: 32,
            drop: 0,
            standsOnGround: () => stands,
            setGroundDrop: (drop: number) => (self.drop = drop),
            getGroundDrop: () => self.drop,
        };
        return self;
    }

    it("gives each one the drop of the ground under its foot, none to what does not stand on it", () => {
        const tree = thing(0, 0);
        const rug = thing(0, 100, false);
        const flat = thing(500, 500);
        const read = vi.fn((x: number, y: number) => (x < 100 ? 40 : 0));
        const drops = new PlacedDrops({
            things: () => [tree, rug, flat],
            version: () => 1,
            shown: () => true,
            dropAt: read,
        });
        drops.update(0);
        expect(tree.drop).toBe(40);
        expect(read).toHaveBeenCalledWith(16, 32);
        expect(rug.drop).toBe(0);
        expect(flat.drop).toBe(0);
        // Only the moved ones are touched at each image.
        expect(drops.moved()).toEqual([tree]);
    });

    it("reads the ground again when the relief changed, and sees a thing that moved within half a second", () => {
        const tree = thing(0, 0);
        let version = 1;
        let depth = 40;
        const read = vi.fn(() => depth);
        const drops = new PlacedDrops({
            things: () => [tree],
            version: () => version,
            shown: () => true,
            dropAt: read,
        });
        drops.update(0);
        drops.update(16);
        drops.update(480);
        expect(read).toHaveBeenCalledTimes(1);
        // The relief changed.
        depth = 12;
        version = 2;
        drops.update(496);
        expect(tree.drop).toBe(12);
        // The tree was moved (another player edits the map).
        tree.y = 320;
        depth = 20;
        drops.update(600);
        expect(tree.drop).toBe(12);
        drops.update(1000);
        expect(tree.drop).toBe(20);
    });

    it("moves nothing and reads nothing while the relief is not shown in 3/4", () => {
        const tree = thing(0, 0);
        let shown = true;
        let version = 1;
        const read = vi.fn(() => 40);
        const drops = new PlacedDrops({
            things: () => [tree],
            version: () => version,
            shown: () => shown,
            dropAt: read,
        });
        drops.update(0);
        expect(drops.moved()).toEqual([tree]);
        shown = false;
        version = 2;
        drops.update(16);
        expect(tree.drop).toBe(0);
        expect(drops.moved()).toEqual([]);
        drops.update(5000);
        drops.update(10_000);
        expect(read).toHaveBeenCalledTimes(1);
    });
});

describe("an object of the map deleted while it was drawn lower", () => {
    it("is left alone when the relief stops being shown in 3/4: it is gone, nothing of it can be asked", () => {
        const drops: number[] = [];
        const tree = {
            x: 0,
            y: 0,
            displayWidth: 32,
            displayHeight: 32,
            active: true,
            drop: 0,
            standsOnGround: () => true,
            setGroundDrop: (drop: number) => {
                // As an Entity: its scene is gone once it is destroyed.
                if (!tree.active) throw new TypeError("Cannot read properties of undefined (reading 'markDirty')");
                tree.drop = drop;
                drops.push(drop);
            },
            getGroundDrop: () => tree.drop,
        };
        let shown = true;
        let version = 1;
        const placed = new PlacedDrops({
            things: () => [tree],
            version: () => version,
            shown: () => shown,
            dropAt: () => 40,
        });
        placed.update(0);
        expect(placed.moved()).toEqual([tree]);
        // Another player deletes it; the editor is opened before the objects are read again.
        tree.active = false;
        shown = false;
        version = 2;
        expect(() => placed.update(100)).not.toThrow();
        expect(placed.moved()).toEqual([]);
        expect(drops).toEqual([40]);
        // And nothing is asked of it when the scene ends.
        tree.active = true;
        shown = true;
        version = 3;
        placed.update(200);
        tree.active = false;
        expect(() => placed.destroy()).not.toThrow();
    });

    it("is no more among the objects moved while the image is drawn", () => {
        const tree = {
            x: 0,
            y: 0,
            displayWidth: 32,
            displayHeight: 32,
            active: true,
            drop: 0,
            standsOnGround: () => true,
            setGroundDrop: (drop: number) => (tree.drop = drop),
            getGroundDrop: () => tree.drop,
        };
        const placed = new PlacedDrops({ things: () => [tree], version: () => 1, shown: () => true, dropAt: () => 40 });
        placed.update(0);
        tree.active = false;
        expect(placed.moved()).toEqual([]);
    });
});

describe("a click on an object drawn lower", () => {
    it("is tested where the object is seen: its own rows are those of the pointer less its drop", () => {
        const pixel = vi.fn((_area: unknown, _x: number, y: number) => y >= 0 && y < 10);
        const object = { scaleY: 1 };
        let drop = 40;
        const test = hitWhereDrawn(pixel, () => drop);
        // Seen 40 px lower: a pointer 45 px under its place is on its 6th row.
        expect(test({}, 3, 45, object)).toBe(true);
        expect(pixel).toHaveBeenLastCalledWith({}, 3, 5, object);
        expect(test({}, 3, 5, object)).toBe(false);
        // Not moved: as before.
        drop = 0;
        expect(test({}, 3, 5, object)).toBe(true);
    });

    it("counts the rows of an object drawn at another size in its own pixels", () => {
        const pixel = vi.fn(() => true);
        const test = hitWhereDrawn(pixel, () => 40);
        test({}, 0, 30, { scaleY: 2 });
        expect(pixel).toHaveBeenLastCalledWith({}, 0, 10, { scaleY: 2 });
    });
});

describe("a drawing laid lower with the ground", () => {
    function fakeGraphics() {
        const calls: string[] = [];
        return {
            calls,
            save: () => calls.push("save"),
            translateCanvas: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
            restore: () => calls.push("restore"),
        };
    }

    it("is drawn between a move down by the drop and its undoing, on each layer", () => {
        const ground = fakeGraphics();
        const glow = fakeGraphics();
        drawLower([ground, glow], 40, () => ground.calls.push("drawn"));
        expect(ground.calls).toEqual(["save", "translate 0 40", "drawn", "restore"]);
        expect(glow.calls).toEqual(["save", "translate 0 40", "restore"]);
    });

    it("is drawn as ever where there is no drop", () => {
        const ground = fakeGraphics();
        drawLower([ground], 0, () => ground.calls.push("drawn"));
        expect(ground.calls).toEqual(["drawn"]);
    });
});
