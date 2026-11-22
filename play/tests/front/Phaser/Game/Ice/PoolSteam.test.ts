import { describe, expect, it } from "vitest";
import { poolsSteamIn } from "@wa/front/Phaser/Game/Ice/FrozenPoolsView";

describe("the steam of a heated pool", () => {
    it("rises in a dry cold that lays no hoar frost, as at -33 °C and 63 % of humidity", () => {
        expect(poolsSteamIn({ frost: 0, ice: 1 })).toBe(true);
    });

    it("rises under a hoar frost, and not in a mild air", () => {
        expect(poolsSteamIn({ frost: 0.4, ice: 0 })).toBe(true);
        expect(poolsSteamIn({ frost: 0, ice: 0 })).toBe(false);
    });
});
