import { describe, expect, it } from "vitest";
import { CALL_STRIP_INSET_PX, isOffscreen } from "../../../src/front/Stores/CallStripStore";

const view = { x: 0, y: 0, width: 800, height: 600 };

describe("isOffscreen", () => {
    it("counts an avatar out as soon as its bubble leaves the view", () => {
        expect(isOffscreen(false, { x: 400, y: 300 }, view)).toBe(false);
        expect(isOffscreen(false, { x: 801, y: 300 }, view)).toBe(true);
        expect(isOffscreen(false, { x: 400, y: -1 }, view)).toBe(true);
    });

    it("brings it back only once well inside the view: no blinking at the edge", () => {
        expect(isOffscreen(true, { x: 800 - CALL_STRIP_INSET_PX / 2, y: 300 }, view)).toBe(true);
        expect(isOffscreen(true, { x: 800 - CALL_STRIP_INSET_PX - 1, y: 300 }, view)).toBe(false);
    });
});
