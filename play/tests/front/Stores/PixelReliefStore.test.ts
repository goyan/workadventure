import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { pixelReliefStore } from "../../../src/front/Stores/EffectsStore";

describe("the relief in 3/4 (pixel art)", () => {
    it("is off until the player turns it on: the ground of the map is then drawn by the other engine", () => {
        expect(get(pixelReliefStore)).toBe(false);
    });
});
