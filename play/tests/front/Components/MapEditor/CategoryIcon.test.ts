import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const LL = readable({});
    return { LL, default: LL };
});

const { categoryIcon } = await import("../../../../src/front/Components/MapEditor/EntityEditor/CategoryIcon");
const icons = await import("../../../../src/front/Components/Icons");

describe("The picture of a category of objects", () => {
    it("is the one of its base category, whatever the case", () => {
        expect(categoryIcon({ kind: "tag", tag: "Seats" })).toBe(icons.IconArmchair);
        expect(categoryIcon({ kind: "special", tag: "most_used" })).toBe(icons.IconStar);
    });

    it("comes from the name of a category the map created, in French or English, accents or not", () => {
        expect(categoryIcon({ kind: "tag", tag: "Neige" })).toBe(icons.IconSnowflake);
        expect(categoryIcon({ kind: "tag", tag: "Sols" })).toBe(icons.IconTexture);
        expect(categoryIcon({ kind: "tag", tag: "Mural" })).toBe(icons.IconPhoto);
        expect(categoryIcon({ kind: "tag", tag: "bathroom" })).toBe(icons.IconBath);
        expect(categoryIcon({ kind: "tag", tag: "Électronique maison" })).toBe(icons.IconDeviceDesktop);
        expect(categoryIcon({ kind: "tag", tag: "Plantes vertes" })).toBe(icons.IconPlant);
    });

    it("does not take a short word for the start of a longer one", () => {
        // "sol" is not "soleil", "car" is not "carton": an unknown name shows its initial.
        expect(categoryIcon({ kind: "tag", tag: "Soleil" })).toBeUndefined();
        expect(categoryIcon({ kind: "tag", tag: "Carton" })).toBeUndefined();
    });
});
