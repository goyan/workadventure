import { describe, expect, it } from "vitest";
import { AvatarAction, readAvatarAction, takesObjectPlace } from "../../../../src/front/Phaser/Entity/AvatarAction";
import { Swimwear, readSwimwear, resolveSwimwear } from "../../../../src/front/Phaser/Entity/Swimwear";

describe("avatar state from public player variables", () => {
    it("accepts the supported actions and rejects unknown state", () => {
        for (const action of Object.values(AvatarAction)) expect(readAvatarAction(action)).toBe(action);
        for (const value of [undefined, null, {}, "unknown", 42])
            expect(readAvatarAction(value)).toBe(AvatarAction.Idle);
    });
    it("runs on a treadmill like any other action", () => {
        expect(readAvatarAction("run")).toBe(AvatarAction.Run);
    });
    it("places the avatar on the object for lying, sitting on the toilet and running, not for a coffee", () => {
        expect(takesObjectPlace(AvatarAction.Sleep)).toBe(true);
        expect(takesObjectPlace(AvatarAction.Toilet)).toBe(true);
        expect(takesObjectPlace(AvatarAction.Run)).toBe(true);
        expect(takesObjectPlace(AvatarAction.Coffee)).toBe(false);
        expect(takesObjectPlace(AvatarAction.Idle)).toBe(false);
    });
    it("uses known avatar gender without classifying neutral custom bodies", () => {
        expect(resolveSwimwear(Swimwear.Auto, ["female1"])).toBe(Swimwear.TwoPiece);
        expect(resolveSwimwear(Swimwear.Auto, ["male1"])).toBe(Swimwear.Shorts);
        expect(resolveSwimwear(Swimwear.Auto, ["body1", "hair2"])).toBe(Swimwear.Shorts);
        expect(resolveSwimwear(Swimwear.TwoPiece, ["male1"])).toBe(Swimwear.TwoPiece);
        expect(readSwimwear({})).toBe(Swimwear.Auto);
    });
});
