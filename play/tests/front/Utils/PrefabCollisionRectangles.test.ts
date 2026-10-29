import { describe, expect, it } from "vitest";
import { EntityCollectionRaw, EntityRawPrefab } from "@workadventure/map-editor";
import { getPrefabCollisionRectangles } from "../../../src/front/Utils/PrefabCollisionRectangles";

const prefab = {
    id: "walls:wall:Default:Down",
    name: "wall",
    tags: ["Murs"],
    imagePath: "wall.png",
    direction: "Down",
    color: "Default",
};

describe("getPrefabCollisionRectangles", () => {
    it("should translate the rectangles to the entity position when the prefab declares them", () => {
        // 6px vertical wall in a 64px wide sprite, entity placed on the tile (64, 96).
        expect(getPrefabCollisionRectangles({ x: 64, y: 96 }, [{ x: 29, y: 0, width: 6, height: 32 }])).toEqual([
            { x: 93, y: 96, width: 6, height: 32 },
        ]);
    });

    it("should keep the rectangles in order when the prefab declares several", () => {
        const result = getPrefabCollisionRectangles({ x: 0, y: 0 }, [
            { x: 0, y: 29, width: 32, height: 3 },
            { x: 13, y: 0, width: 6, height: 29 },
        ]);
        expect(result.map((rectangle) => rectangle.height)).toEqual([3, 29]);
    });

    it("should return no rectangle when the prefab declares none", () => {
        expect(getPrefabCollisionRectangles({ x: 10, y: 10 }, undefined)).toEqual([]);
    });
});

describe("EntityRawPrefab collisionRectangles", () => {
    it("should keep the rectangles when they are valid", () => {
        const rectangles = [{ x: 0, y: 29, width: 32, height: 3 }];
        expect(EntityRawPrefab.parse({ ...prefab, collisionRectangles: rectangles }).collisionRectangles).toEqual(
            rectangles,
        );
    });

    it("should drop the rectangles and keep the prefab when one rectangle is invalid", () => {
        const parsed = EntityRawPrefab.parse({
            ...prefab,
            collisionRectangles: [
                { x: 0, y: 29, width: 32, height: 3 },
                { x: 0, y: 0, width: 0, height: 6 },
            ],
        });
        expect(parsed.collisionRectangles).toBeUndefined();
        expect(parsed.name).toBe("wall");
    });

    it("should still parse the whole catalog when one prefab has an invalid rectangle", () => {
        const catalog = EntityCollectionRaw.parse({
            collectionName: "walls",
            tags: [],
            collection: [prefab, { ...prefab, id: "walls:bad:Default:Down", collisionRectangles: "oops" }],
        });
        expect(catalog.collection).toHaveLength(2);
    });
});
