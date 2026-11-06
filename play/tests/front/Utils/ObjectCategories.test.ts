import { describe, expect, it } from "vitest";
import { AvatarAction } from "../../../src/front/Phaser/Entity/AvatarAction";
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

    it("recognizes action objects and lets map categories assign or override actions", () => {
        for (const [name, action] of [
            ["Bed", AvatarAction.Sleep],
            ["Toilet", AvatarAction.Toilet],
            ["Coffee machine", AvatarAction.Coffee],
        ] as const) {
            expect(getObjectInteraction(object(["Furniture"], name), undefined)).toEqual({
                interaction: action,
                trigger: "key",
            });
        }
        expect(getObjectInteraction(object(["Beds"]), undefined).interaction).toBe(AvatarAction.Sleep);
        expect(getObjectInteraction(object(["Toilets"]), undefined).interaction).toBe(AvatarAction.Toilet);
        expect(
            getObjectInteraction(object(["Dance floor"]), {
                "dance floor": { interaction: AvatarAction.Dance, trigger: "auto" },
            }),
        ).toEqual({ interaction: AvatarAction.Dance, trigger: "auto" });
        expect(
            getObjectInteraction(object(["Beds"]), { beds: { interaction: AvatarAction.Coffee, trigger: "key" } })
                .interaction,
        ).toBe(AvatarAction.Coffee);
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
