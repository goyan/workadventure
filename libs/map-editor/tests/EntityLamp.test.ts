import { describe, expect, it } from "vitest";
import { EntityRawPrefab } from "../src";

describe("EntityRawPrefab lamp", () => {
    const prefabMinimal = {
        id: "disco-ball",
        name: "Disco ball",
        tags: [],
        imagePath: "disco-ball.png",
        direction: "Down" as const,
        color: "",
    };

    it("keeps a valid lamp definition", () => {
        for (const kind of ["spot", "disco", "neon", "strobe"] as const) {
            expect(EntityRawPrefab.parse({ ...prefabMinimal, lamp: { kind } }).lamp).toEqual({ kind });
        }
    });

    it("keeps the point the light comes from, in pixels from the top-left corner of the image", () => {
        const parsed = EntityRawPrefab.parse({ ...prefabMinimal, lamp: { kind: "spot", anchor: { x: 16, y: 4 } } });
        expect(parsed.lamp).toEqual({ kind: "spot", anchor: { x: 16, y: 4 } });
    });

    it("ignores an invalid lamp definition without rejecting the prefab", () => {
        expect(EntityRawPrefab.parse({ ...prefabMinimal, lamp: { kind: "laser" } }).lamp).toBeUndefined();
        expect(EntityRawPrefab.parse({ ...prefabMinimal, lamp: "spot" }).lamp).toBeUndefined();
        expect(EntityRawPrefab.parse({ ...prefabMinimal, lamp: {} }).lamp).toBeUndefined();
    });

    it("leaves lamp undefined when absent", () => {
        expect(EntityRawPrefab.parse(prefabMinimal).lamp).toBeUndefined();
    });
});
