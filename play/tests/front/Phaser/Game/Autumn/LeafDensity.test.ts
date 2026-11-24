import { describe, expect, it } from "vitest";
import {
    LEAF_DENSITY_CELL_PX,
    leafDensityAt,
    leafDensityField,
    leafTreesOf,
    leafWindKey,
    quantizeWind,
    type LeafTree,
} from "../../../../../src/front/Phaser/Game/Autumn/LeafDensity";

const tree: LeafTree = { x: 500, y: 500, width: 64 };
/** No wind to speak of: the leaves lie all around the foot. */
const calm = quantizeWind(0, undefined);
/** A strong wind from the west: it blows the leaves east. */
const westerly = quantizeWind(60, 270);

describe("quantizeWind", () => {
    it("points where the wind goes, as the falling leaves: from the north, south; from the east, west", () => {
        const north = quantizeWind(30, 0);
        expect(north.toX).toBeCloseTo(0);
        expect(north.toY).toBeCloseTo(1);
        const east = quantizeWind(30, 90);
        expect(east.toX).toBeCloseTo(-1);
        expect(east.toY).toBeCloseTo(0);
    });

    it("blows to the south-east without a real wind, a light breeze", () => {
        const breeze = quantizeWind(undefined, undefined);
        expect(breeze.toX).toBeCloseTo(Math.SQRT1_2);
        expect(breeze.toY).toBeCloseTo(Math.SQRT1_2);
        expect(breeze.level).toBe(1);
    });

    it("ignores small changes of the real wind: 16 directions, 5 strengths", () => {
        expect(leafWindKey(quantizeWind(21, 268))).toBe(leafWindKey(quantizeWind(24, 273)));
        expect(leafWindKey(quantizeWind(21, 268))).not.toBe(leafWindKey(quantizeWind(21, 292)));
        expect(quantizeWind(0, 0).level).toBe(0);
        expect(quantizeWind(200, 0).level).toBe(4);
    });
});

describe("leafDensityAt", () => {
    it("is nothing far from every tree, and nothing without trees", () => {
        expect(leafDensityAt(100, 100, [], westerly, 1)).toBe(0);
        expect(leafDensityAt(tree.x + 400, tree.y, [tree], westerly, 1)).toBe(0);
        expect(leafDensityAt(tree.x, tree.y - 300, [tree], westerly, 1)).toBe(0);
    });

    it("is thickest at the foot and thins out away from it", () => {
        const foot = leafDensityAt(tree.x, tree.y, [tree], calm, 1);
        const near = leafDensityAt(tree.x + 24, tree.y, [tree], calm, 1);
        const far = leafDensityAt(tree.x + 48, tree.y, [tree], calm, 1);
        expect(foot).toBeGreaterThan(near);
        expect(near).toBeGreaterThan(far);
        expect(far).toBeGreaterThan(0);
    });

    it("lies all around the tree in a calm", () => {
        const east = leafDensityAt(tree.x + 40, tree.y, [tree], calm, 1);
        expect(leafDensityAt(tree.x - 40, tree.y, [tree], calm, 1)).toBeCloseTo(east);
    });

    it("trails downwind: more leaves where the wind goes than where it comes from", () => {
        expect(leafDensityAt(tree.x + 60, tree.y, [tree], westerly, 1)).toBeGreaterThan(
            leafDensityAt(tree.x - 60, tree.y, [tree], westerly, 1),
        );
        // A strong wind carries leaves much further than the calm does.
        expect(leafDensityAt(tree.x + 150, tree.y, [tree], calm, 1)).toBe(0);
        expect(leafDensityAt(tree.x + 150, tree.y, [tree], westerly, 1)).toBeGreaterThan(0);
        expect(leafDensityAt(tree.x - 150, tree.y, [tree], westerly, 1)).toBe(0);
    });

    it("grows as autumn goes", () => {
        const early = leafDensityAt(tree.x + 30, tree.y, [tree], calm, 0.1);
        const late = leafDensityAt(tree.x + 30, tree.y, [tree], calm, 1);
        expect(late).toBeGreaterThan(early);
    });

    it("adds up under two trees without going over 1", () => {
        const other: LeafTree = { x: tree.x + 40, y: tree.y, width: 64 };
        const both = leafDensityAt(tree.x + 20, tree.y, [tree, other], calm, 1);
        expect(both).toBeGreaterThan(leafDensityAt(tree.x + 20, tree.y, [tree], calm, 1));
        expect(both).toBeLessThanOrEqual(1);
    });
});

describe("leafDensityField", () => {
    it("is the density at the middle of each cell, cell by cell", () => {
        const area = { x: 320, y: 400, width: 400, height: 200 };
        const field = leafDensityField(area, [tree], westerly, 0.8);
        const size = LEAF_DENSITY_CELL_PX;
        const firstCol = Math.floor(area.x / size);
        const firstRow = Math.floor(area.y / size);
        expect(field.columns).toBe(Math.floor((area.x + area.width - 1) / size) - firstCol + 1);
        let some = 0;
        for (let row = 0; row < field.rows; row++) {
            for (let col = 0; col < field.columns; col++) {
                const x = (firstCol + col) * size + size / 2;
                const y = (firstRow + row) * size + size / 2;
                const value = field.values[row * field.columns + col];
                expect(value).toBeCloseTo(leafDensityAt(x, y, [tree], westerly, 0.8), 5);
                if (value > 0) some++;
            }
        }
        expect(some).toBeGreaterThan(10);
    });
});

describe("leafTreesOf", () => {
    function entity(id: string, seasonal: unknown, x = 0, visible = true) {
        return {
            x,
            y: 0,
            displayWidth: 64,
            displayHeight: 96,
            visible,
            getPrefab: () => ({ id, seasonal }),
        };
    }
    const changing = { summer: "oak.png", autumn: "oak-autumn.png" };

    it("keeps the trees that lose their leaves, by their foot", () => {
        expect(leafTreesOf([entity("Nature:tree-1-2:Default:Down", changing, 32)], () => true)).toEqual([
            { x: 64, y: 95, width: 64 },
        ]);
    });

    it("leaves out evergreens and palms (same image in autumn and in summer), other objects, and hidden or indoor trees", () => {
        const evergreen = { summer: "fir.png", autumn: "fir.png" };
        expect(
            leafTreesOf(
                [
                    entity("Nature:tree-3-1:Default:Down", evergreen),
                    entity("Infogène Mobilier:chaise", changing),
                    entity("Nature:tree-1-2:Default:Down", changing, 0, false),
                ],
                () => true,
            ),
        ).toEqual([]);
        expect(leafTreesOf([entity("Nature:tree-1-2:Default:Down", changing)], () => false)).toEqual([]);
    });
});
