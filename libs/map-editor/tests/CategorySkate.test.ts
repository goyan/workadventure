import { describe, expect, it } from "vitest";
import { CategorySettings } from "../src";

describe("Category settings", () => {
    it("accept skating on the objects of a category", () => {
        expect(CategorySettings.parse({ interaction: "skate", trigger: "auto", layer: "floor" })).toEqual({
            interaction: "skate",
            trigger: "auto",
            layer: "floor",
        });
    });
});
