// @vitest-environment node

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import FloorLevelStack from "../../../../src/front/Components/Floors/FloorLevelStack.svelte";

const stack = {
    levels: [
        { elevation: 52, name: "Niveau 2" },
        { elevation: 0, name: "Sol" },
    ],
    current: 52,
};

describe("FloorLevelStack", () => {
    it("shows nothing without floors", () => {
        expect(render(FloorLevelStack, { props: { stack: undefined } }).body).not.toContain("Sol");
    });

    it("lists the floors, the current one in white after ▶, the others in grey", () => {
        const { body } = render(FloorLevelStack, { props: { stack } });
        expect(body.indexOf("Niveau 2")).toBeLessThan(body.indexOf("Sol"));
        expect(body).toMatch(/text-white[^>]*>\s*<span[^>]*>▶<\/span>\s*Niveau 2/);
        expect(body).toMatch(/text-gray-400[^>]*>\s*Sol/);
    });
});
