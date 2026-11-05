import { describe, expect, it } from "vitest";
import {
    getEntityCategory,
    isStructureObject,
    listCategories,
    withCategory,
} from "../../../src/front/Utils/EntityCategory";

describe("EntityCategory", () => {
    it("takes the first meaningful tag, whatever its case", () => {
        expect(getEntityCategory({ tags: ["basic", "furniture"] })).toBe("Furniture");
        expect(getEntityCategory({ tags: ["Custom", "piscines"] })).toBe("Piscines");
        expect(getEntityCategory({ tags: [] })).toBeUndefined();
        expect(getEntityCategory({ tags: ["basic"] })).toBeUndefined();
    });

    it("lists each category once, sorted", () => {
        expect(
            listCategories([{ tags: ["furniture"] }, { tags: ["Furniture", "basic"] }, { tags: ["bathroom"] }]),
        ).toEqual(["Bathroom", "Furniture"]);
    });

    it("puts the chosen category first, once", () => {
        expect(withCategory(["Custom", "eau", "Piscines"], "piscines")).toEqual(["Piscines", "eau"]);
    });

    it("keeps floors and walls apart from the objects", () => {
        expect(isStructureObject({ tags: ["Murs"], collectionName: "x" })).toBe(true);
        expect(isStructureObject({ tags: [], collectionName: "Infogène Sols" })).toBe(true);
        expect(isStructureObject({ tags: ["furniture"], collectionName: "basic furniture" })).toBe(false);
        expect(isStructureObject({ tags: ["Plantes murales"], collectionName: "Déco" })).toBe(false);
    });
});
