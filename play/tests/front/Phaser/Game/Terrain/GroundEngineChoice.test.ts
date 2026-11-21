import { describe, expect, it } from "vitest";
import { groundEngineOf } from "../../../../../src/front/Phaser/Game/Terrain/GroundEngineChoice";

describe("which engine draws the ground", () => {
    const base = { chosen: true, editorOpen: false, basic: false, shader: true };

    it("the flat one, as ever, until the player asks for the relief in 3/4", () => {
        expect(groundEngineOf({ ...base, chosen: false })).toBe("flat");
        expect(groundEngineOf({ ...base, chosen: false, shader: false })).toBe("flat");
    });

    it("the shaders in 3/4 once asked, where the graphics card runs them", () => {
        expect(groundEngineOf(base)).toBe("oblique");
    });

    it("the blocks in 3/4 where it cannot", () => {
        expect(groundEngineOf({ ...base, shader: false })).toBe("blocks");
    });

    it("the flat one in the map editor and in Basique, whatever was asked", () => {
        expect(groundEngineOf({ ...base, editorOpen: true })).toBe("flat");
        expect(groundEngineOf({ ...base, basic: true })).toBe("flat");
        expect(groundEngineOf({ ...base, editorOpen: true, shader: false })).toBe("flat");
        expect(groundEngineOf({ ...base, basic: true, shader: false })).toBe("flat");
    });
});
