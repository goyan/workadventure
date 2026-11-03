import { describe, expect, it } from "vitest";
import { EntityRawPrefab } from "../src";

describe("EntityRawPrefab wander", () => {
    const prefabMinimal = {
        id: "duck",
        name: "Duck",
        tags: [],
        imagePath: "duck.png",
        direction: "Down" as const,
        color: "",
    };

    it("keeps a valid wander definition", () => {
        const parsed = EntityRawPrefab.parse({ ...prefabMinimal, wander: { sheetPath: "canard-sheet.png" } });
        expect(parsed.wander).toEqual({ sheetPath: "canard-sheet.png" });
    });

    it("ignores an invalid wander definition without rejecting the prefab", () => {
        expect(EntityRawPrefab.parse({ ...prefabMinimal, wander: { sheetPath: 3 } }).wander).toBeUndefined();
        expect(EntityRawPrefab.parse({ ...prefabMinimal, wander: "x" }).wander).toBeUndefined();
    });

    it("leaves wander undefined when absent", () => {
        expect(EntityRawPrefab.parse(prefabMinimal).wander).toBeUndefined();
    });
});
