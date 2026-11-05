import { describe, expect, it } from "vitest";
import {
    getCategorySettings,
    getObjectInteraction,
    listMapCategories,
} from "../../../src/front/Utils/ObjectCategories";

const object = (
    tags: string[],
    name = "x.png",
    extra: { sittable?: boolean; water?: [] | [{ x: 0; y: 0; width: 1; height: 1 }] } = {},
) => ({
    tags,
    name,
    ...extra,
});

describe("ObjectCategories", () => {
    it("gives base categories their interaction, and lets the map change it", () => {
        expect(getCategorySettings("Seats", undefined)).toEqual({
            interaction: "sit",
            trigger: "auto",
            layer: undefined,
        });
        expect(getCategorySettings("seats", { seats: { interaction: "sit", trigger: "key" } })).toEqual({
            interaction: "sit",
            trigger: "key",
        });
        expect(getCategorySettings("Unknown", undefined)).toBeUndefined();
    });

    it("takes the object's choice first, then its category, then its name", () => {
        expect(getObjectInteraction(object(["Seats"], "x", { sittable: false }), undefined).interaction).toBe("none");
        expect(getObjectInteraction(object(["Seats"]), { seats: { interaction: "sit", trigger: "key" } })).toEqual({
            interaction: "sit",
            trigger: "key",
        });
        expect(getObjectInteraction(object(["Furniture"], "Couch"), undefined)).toEqual({
            interaction: "sit",
            trigger: "auto",
        });
        expect(getObjectInteraction(object(["Furniture"], "Big shelf"), undefined).interaction).toBe("none");
    });

    it("lets a category the map created carry an interaction", () => {
        const map = { bancs: { interaction: "sit" as const, trigger: "auto" as const } };
        expect(getObjectInteraction(object(["Bancs"]), map).interaction).toBe("sit");
        expect(
            listMapCategories(map)
                .map(({ id, base }) => ({ id, base }))
                .at(-1),
        ).toEqual({ id: "bancs", base: false });
    });
});
