import { beforeEach, describe, expect, it } from "vitest";
import { localUserStore } from "../../../src/front/Connection/LocalUserStore";
import { Swimwear, SWIMWEAR_VARIABLE } from "../../../src/front/Phaser/Entity/Swimwear";

describe("saved bath outfit", () => {
    beforeEach(() => localStorage.clear());

    it("leaves the room preference in control until a local choice is saved", () => {
        expect(localUserStore.getSwimwear()).toBeUndefined();
    });

    it.each(Object.values(Swimwear))("remembers %s for the next game session", (style) => {
        localUserStore.setSwimwear(style);
        expect(localUserStore.getSwimwear()).toBe(style);
    });

    it("falls back to automatic for an invalid stored preference", () => {
        localStorage.setItem(SWIMWEAR_VARIABLE, "invalid");
        expect(localUserStore.getSwimwear()).toBe(Swimwear.Auto);
    });
});
