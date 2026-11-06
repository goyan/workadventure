import { beforeEach, describe, expect, it } from "vitest";
import { localUserStore } from "../../../src/front/Connection/LocalUserStore";
import { Swimwear, SWIMWEAR_VARIABLE, SWIMWEAR_COLOR_VARIABLE } from "../../../src/front/Phaser/Entity/Swimwear";

describe("saved bath outfit", () => {
    beforeEach(() => localStorage.clear());

    it("leaves the room preference in control until a local choice is saved", () => {
        expect(localUserStore.getSwimwear()).toBeUndefined();
    });

    it.each(Object.values(Swimwear))("remembers %s for the next game session", (style) => {
        localUserStore.setSwimwear(style);
        expect(localUserStore.getSwimwear()).toBe(style);
    });

    it("remembers a valid color and clears it when returning to default", () => {
        localUserStore.setSwimwearColor("#3D9B7B");
        expect(localUserStore.getSwimwearColor()).toBe("#3d9b7b");
        localUserStore.setSwimwearColor(undefined);
        expect(localUserStore.getSwimwearColor()).toBeUndefined();
    });

    it("ignores invalid remote or stored colors", () => {
        localStorage.setItem(SWIMWEAR_COLOR_VARIABLE, "url(invalid)");
        expect(localUserStore.getSwimwearColor()).toBeUndefined();
        localUserStore.setSwimwearColor("#xyz");
        expect(localUserStore.getSwimwearColor()).toBeUndefined();
    });

    it("falls back to automatic for an invalid stored preference", () => {
        localStorage.setItem(SWIMWEAR_VARIABLE, "invalid");
        expect(localUserStore.getSwimwear()).toBe(Swimwear.Auto);
    });
});
