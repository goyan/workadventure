import { describe, expect, it } from "vitest";
import {
    getEntityCategory,
    isHiddenFromLibrary,
    isSeatObject,
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

    it("hides the floors and walls of the map tool and of the former catalogs from the library", () => {
        const hidden = (collectionName: string) => isHiddenFromLibrary({ collectionName });
        expect(hidden("Carte Murs")).toBe(true);
        expect(hidden("Infogène Sols")).toBe(true);
        expect(hidden("Infogène Murs fins")).toBe(true);
        expect(hidden("basic furniture")).toBe(false);
        expect(hidden("custom entities")).toBe(false);
    });

    it("recognizes the objects players sit on, by category or name", () => {
        expect(isSeatObject({ tags: [], name: "Couch" })).toBe(true);
        expect(isSeatObject({ tags: ["Canapés"], name: "x.png" })).toBe(true);
        expect(isSeatObject({ tags: ["furniture"], name: "office chair" })).toBe(true);
        expect(isSeatObject({ tags: ["furniture"], name: "Big Shelf" })).toBe(false);
    });
});
