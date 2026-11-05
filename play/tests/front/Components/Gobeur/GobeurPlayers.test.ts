import { describe, expect, it } from "vitest";
import { gobeurCountdownSeconds } from "../../../../src/front/Components/Gobeur/GobeurPlayers";

describe("gobeurCountdownSeconds", () => {
    it("counts down from 5 to 1, then is over", () => {
        expect(gobeurCountdownSeconds(6000, 1000)).toBe(5);
        expect(gobeurCountdownSeconds(6000, 1001)).toBe(5);
        expect(gobeurCountdownSeconds(6000, 2000)).toBe(4);
        expect(gobeurCountdownSeconds(6000, 5999)).toBe(1);
        expect(gobeurCountdownSeconds(6000, 6000)).toBeUndefined();
        expect(gobeurCountdownSeconds(6000, 9000)).toBeUndefined();
    });
});
