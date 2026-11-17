import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import {
    OBJECT_SHADOW_RISE,
    readShadowCasters,
    wallShadowBoxes,
} from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowCasters";
import type { ShadowSourceEntity } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowCasters";

function entity(overrides: Partial<ShadowSourceEntity> & Pick<ShadowSourceEntity, "prefab">): ShadowSourceEntity {
    return { x: 100, y: 200, displayWidth: 64, displayHeight: 96, elevation: 0, ...overrides };
}

describe("wallShadowBoxes", () => {
    it("stands a horizontal wall on its foot, the bottom of its face, as high as its tiles", () => {
        const model = new MapLayerModel();
        // On the line 2, over the column 1: drawn on the row 2, its foot on the bottom of that row (y = 96).
        model.setWall("h", 1, 2, "blanc");
        model.setWall("h", 2, 2, "blanc");
        expect(wallShadowBoxes(model)).toEqual([{ x: 32, y: 90, width: 64, height: 6, rise: 32 }]);
    });

    it("gives a high wall its height: two tiles high, 64 px", () => {
        const model = new MapLayerModel();
        model.setWall("h", 1, 4, "blanc", 2);
        expect(wallShadowBoxes(model)).toEqual([{ x: 32, y: 154, width: 32, height: 6, rise: 64 }]);
    });

    it("stands a vertical wall on the ground a row lower than its top is drawn, where the avatars meet it", () => {
        const model = new MapLayerModel();
        model.setWall("v", 3, 1, "blanc");
        model.setWall("v", 3, 2, "blanc");
        expect(wallShadowBoxes(model)).toEqual([{ x: 90, y: 64, width: 12, height: 64, rise: 32 }]);
    });
});

describe("readShadowCasters", () => {
    it("reads the tall objects (castsShadow) by their collision, at the height of an object", () => {
        const { casters } = readShadowCasters([
            entity({
                prefab: {
                    collectionName: "Mobilier",
                    id: "armoire",
                    castsShadow: true,
                    collisionRectangles: [{ x: 0, y: 64, width: 64, height: 32 }],
                },
            }),
            // A low object lets the light pass.
            entity({ prefab: { collectionName: "Mobilier", id: "table" } }),
        ]);
        expect(casters?.boxes).toEqual([{ x: 100, y: 264, width: 64, height: 32, rise: OBJECT_SHADOW_RISE }]);
        expect(casters?.trees).toEqual([]);
    });

    it("reads every tree of the nature catalogue, not only the ones that sway: bare, snowy and seasonal ones too", () => {
        // The ids placed on the team map (read in the game on 2026-11-17).
        const ids = [
            "Nature:nature-5:Default:Down",
            "Nature:snow-tree-4:Default:Down",
            "Nature:seasonal-1:Default:Down",
            "Nature:winter-auto-3:Default:Down",
        ];
        const { casters } = readShadowCasters(ids.map((id) => entity({ prefab: { collectionName: "Nature", id } })));
        expect(casters?.trees).toHaveLength(4);
    });

    it("reads the small things of the nature catalogue (rocks, grass, flowers, stumps) as low details, not as trees", () => {
        const { casters } = readShadowCasters([
            entity({
                displayWidth: 46,
                displayHeight: 33,
                prefab: { collectionName: "Nature", id: "Nature:detail-rocks-2:Default:Down" },
            }),
            // Of a tree family, yet lower than two tiles: a stump, a bush.
            entity({
                displayWidth: 48,
                displayHeight: 40,
                prefab: { collectionName: "Nature", id: "Nature:nature-9:Default:Down" },
            }),
        ]);
        expect(casters?.trees).toEqual([]);
        expect(casters?.details).toHaveLength(2);
        const [rock] = casters?.details ?? [];
        // Its foot at the bottom middle of its image, never higher than its image.
        expect(rock.x).toBe(123);
        expect(rock.y).toBe(233);
        expect(rock.crownHeight + rock.crownRadius).toBeLessThanOrEqual(33);
        expect(rock.trunkWidth).toBe(0);
    });

    it("reads a tree as its own picture laid on the ground when the trees are set to realistic", () => {
        const picture = { key: "oak:0", source: {}, cutX: 0, cutY: 0, cutWidth: 64, cutHeight: 96 };
        const tree = entity({ prefab: { collectionName: "Nature", id: "Nature:tree-oak" }, picture });
        const categories = { walls: true, objects: true, trees: true, details: true, treeShape: "realistic" as const };
        const realistic = readShadowCasters([tree], undefined, categories);
        expect(realistic.casters?.trees).toEqual([]);
        // Its foot at the bottom middle of its image, as wide and as high as it is shown.
        expect(realistic.casters?.pictures).toEqual([{ x: 132, y: 296, width: 64, height: 96, picture }]);
        // The shape is part of what is drawn: going back to ovals reads the map again.
        const oval = readShadowCasters([tree], realistic.signature);
        expect(oval.casters?.trees).toHaveLength(1);
        expect(oval.casters?.pictures).toEqual([]);
        // A tree whose picture cannot be read keeps its oval.
        const unread = readShadowCasters(
            [entity({ prefab: { collectionName: "Nature", id: "Nature:tree-oak" } })],
            undefined,
            categories,
        );
        expect(unread.casters?.trees).toHaveLength(1);
    });

    it("leaves out the categories turned off, and reads the map again when one is turned back on", () => {
        const entities = [
            entity({ prefab: { collectionName: "Nature", id: "Nature:tree-oak" } }),
            entity({
                displayWidth: 46,
                displayHeight: 33,
                prefab: { collectionName: "Nature", id: "Nature:detail-rocks-2:Default:Down" },
            }),
            entity({
                prefab: { collectionName: "Furniture", id: "cupboard", castsShadow: true, collisionGrid: [[1]] },
            }),
        ];
        const all = readShadowCasters(entities);
        expect(all.casters?.trees).toHaveLength(1);
        expect(all.casters?.details).toHaveLength(1);
        expect(all.casters?.boxes.length).toBeGreaterThan(0);
        const none = readShadowCasters(entities, all.signature, {
            walls: false,
            objects: false,
            trees: false,
            details: false,
        });
        expect(none.signature).not.toBe(all.signature);
        expect(none.casters).toEqual({ boxes: [], trees: [], details: [], pictures: [] });
        expect(readShadowCasters(entities, none.signature).casters?.trees).toHaveLength(1);
    });

    it("reads the trees of the nature catalogue as a crown on a trunk, the foot at the bottom middle of the image", () => {
        const { casters } = readShadowCasters([
            entity({ prefab: { collectionName: "Nature", id: "Nature:tree-oak" } }),
        ]);
        expect(casters?.boxes).toEqual([]);
        expect(casters?.trees).toHaveLength(1);
        const [tree] = casters?.trees ?? [];
        expect(tree.x).toBe(132);
        expect(tree.y).toBe(296);
        expect(tree.crownRadius).toBeGreaterThan(16);
        expect(tree.crownRadius).toBeLessThan(32);
        expect(tree.crownHeight + tree.crownRadius).toBeLessThanOrEqual(96);
        expect(tree.crownHeight).toBeGreaterThan(48);
    });

    it("leaves out what stands on a raised floor (shadows are cast on the ground only) and the walking animals", () => {
        const { casters } = readShadowCasters([
            entity({ elevation: 64, prefab: { collectionName: "Nature", id: "Nature:tree-oak" } }),
            entity({
                prefab: {
                    collectionName: "Animaux",
                    id: "canard",
                    castsShadow: true,
                    wander: { sheetPath: "canard.png" },
                    collisionRectangles: [{ x: 0, y: 0, width: 32, height: 32 }],
                },
            }),
        ]);
        expect(casters).toEqual({ boxes: [], trees: [], details: [], pictures: [] });
    });

    it("does not read the walls again when nothing changed since a signature", () => {
        const tree = entity({ prefab: { collectionName: "Nature", id: "Nature:tree-oak" } });
        const { signature } = readShadowCasters([tree]);
        expect(readShadowCasters([tree], signature).casters).toBeUndefined();
        expect(readShadowCasters([{ ...tree, x: 101 }], signature).casters?.trees).toHaveLength(1);
    });

    it("changes its signature only when something that casts a shadow changes", () => {
        const tree = entity({ prefab: { collectionName: "Nature", id: "Nature:tree-oak" } });
        const table = entity({ prefab: { collectionName: "Mobilier", id: "table" } });
        const first = readShadowCasters([tree, table]).signature;
        expect(readShadowCasters([tree]).signature).toBe(first);
        expect(readShadowCasters([{ ...tree, x: 101 }]).signature).not.toBe(first);
    });
});
