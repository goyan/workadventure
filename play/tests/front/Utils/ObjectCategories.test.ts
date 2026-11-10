import { describe, expect, it } from "vitest";
import { AvatarAction } from "../../../src/front/Phaser/Entity/AvatarAction";
import {
    getCategorySettings,
    getObjectInteraction,
    isTreadmillBelt,
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

    it("reads an unchecked seat box as 'not a seat', not as 'no action'", () => {
        expect(getObjectInteraction(object(["Misc"], "Tapis de course", { sittable: false }), undefined)).toEqual({
            interaction: AvatarAction.Run,
            trigger: "key",
        });
        expect(getObjectInteraction(object(["Sport"], "x", { sittable: false }), undefined).interaction).toBe(
            AvatarAction.Run,
        );
        expect(getObjectInteraction(object(["Furniture"], "Chair", { sittable: false }), undefined).interaction).toBe(
            "none",
        );
    });

    it("recognizes action objects and lets map categories assign or override actions", () => {
        for (const [name, action] of [
            ["Bed", AvatarAction.Sleep],
            ["Toilet", AvatarAction.Toilet],
            ["Coffee machine", AvatarAction.Coffee],
            ["Tapis de course", AvatarAction.Run],
            ["Treadmill", AvatarAction.Run],
        ] as const) {
            expect(getObjectInteraction(object(["Furniture"], name), undefined)).toEqual({
                interaction: action,
                trigger: "key",
            });
        }
        expect(getObjectInteraction(object(["Beds"]), undefined).interaction).toBe(AvatarAction.Sleep);
        expect(getObjectInteraction(object(["Toilets"]), undefined).interaction).toBe(AvatarAction.Toilet);
        expect(getObjectInteraction(object(["Sport"]), undefined)).toEqual({
            interaction: AvatarAction.Run,
            trigger: "key",
        });
        expect(getObjectInteraction(object(["Furniture"], "Tapis"), undefined).interaction).toBe("none");
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

    it("treats an animated object you run on as a belt that only moves with a runner", () => {
        const animation = { frameCount: 5, frameRate: 15 };
        expect(isTreadmillBelt({ ...object(["Sport"]), animation }, undefined)).toBe(true);
        expect(isTreadmillBelt({ ...object(["Misc"], "Tapis de course"), animation }, undefined)).toBe(true);
        expect(isTreadmillBelt(object(["Sport"]), undefined)).toBe(false);
        expect(isTreadmillBelt({ ...object(["Decoration"], "Aquarium"), animation }, undefined)).toBe(false);
    });

    it("an object of the ice rinks category makes players skate", () => {
        expect(getObjectInteraction(object(["rinks"], "patinoire.png"), undefined)).toEqual({
            interaction: "iceSkate",
            trigger: "auto",
        });
    });

    it("ice rinks lie on the floor", () => {
        expect(getCategorySettings("rinks", undefined)?.layer).toBe("floor");
    });

    it("a map category may be set to skate", () => {
        expect(
            getObjectInteraction(object(["glace"]), { glace: { interaction: "iceSkate", trigger: "auto" } })
                .interaction,
        ).toBe("iceSkate");
    });
});
