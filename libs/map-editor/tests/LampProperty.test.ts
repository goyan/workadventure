import { describe, expect, it } from "vitest";
import { EntityDataProperty, LampPropertyData } from "../src";

describe("LampPropertyData", () => {
    const base = { id: "lamp-1", type: "lampPropertyData" as const };

    it("lights a square of 12 tiles by default: the size of the light of a lamp is in tiles", () => {
        const parsed = LampPropertyData.parse(base);
        expect(parsed.width).toBe(12);
        expect(parsed.height).toBe(12);
    });

    it("keeps the size that was set, which need not be square", () => {
        const parsed = LampPropertyData.parse({ ...base, width: 20, height: 6 });
        expect(parsed.width).toBe(20);
        expect(parsed.height).toBe(6);
    });

    it("rejects a size that is not a whole number of tiles, or out of range", () => {
        expect(LampPropertyData.safeParse({ ...base, width: 1 }).success).toBe(false);
        expect(LampPropertyData.safeParse({ ...base, width: 61 }).success).toBe(false);
        expect(LampPropertyData.safeParse({ ...base, height: 2.5 }).success).toBe(false);
        expect(LampPropertyData.safeParse({ ...base, height: 0 }).success).toBe(false);
    });

    it("is a property an object of the map can carry", () => {
        const parsed = EntityDataProperty.parse({ ...base, width: 8, height: 8 });
        expect(parsed.type).toBe("lampPropertyData");
    });
});
