import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { subMenusStore, SubMenusInterface } from "../../../src/front/Stores/MenuStore";

describe("main menu tabs", () => {
    it("has no global messages tab: sending one lives in Tools", () => {
        const keys = get(subMenusStore).map((menu) => menu.key);
        expect(keys).toContain(SubMenusInterface.settings);
        expect(keys).not.toContain(SubMenusInterface.globalMessages);
    });
});
