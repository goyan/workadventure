import { describe, expect, it } from "vitest";
import { EntityRawPrefab } from "../src";

const prefab = { id: "tree", name: "Tree", tags: [], imagePath: "tree.png", direction: "Down", color: "" };
const seasonal = { spring: "spring.png", summer: "summer.png", autumn: "autumn.png", winter: "winter.png" };

describe("seasonal prefab compatibility", () => {
    it("preserves complete variants", () => {
        expect(EntityRawPrefab.parse({ ...prefab, seasonal }).seasonal).toEqual(seasonal);
    });
    it.each([undefined, {}, { ...seasonal, winter: "" }, { ...seasonal, autumn: 7 }])(
        "keeps the ordinary image for invalid or absent variants %j",
        (value) => {
            const result = EntityRawPrefab.parse({ ...prefab, seasonal: value });
            expect(result.seasonal).toBeUndefined();
            expect(result.imagePath).toBe("tree.png");
        },
    );
});
