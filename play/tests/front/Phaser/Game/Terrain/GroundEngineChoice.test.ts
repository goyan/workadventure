import { describe, expect, it, vi } from "vitest";
import { blocksStateOf, groundEngineOf } from "../../../../../src/front/Phaser/Game/Terrain/GroundEngineChoice";
import { GroundEngines } from "../../../../../src/front/Phaser/Game/Terrain/GroundEngines";

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

describe("the blocks of the relief, kept for where the shaders cannot draw the 3/4", () => {
    const base = { chosen: true, editorOpen: false, basic: false, shader: false };

    it("are never made where the shaders can, whatever the player asks", () => {
        expect(blocksStateOf({ ...base, shader: true })).toEqual({ chosen: false, shown: false });
        expect(blocksStateOf({ ...base, shader: true, editorOpen: true })).toEqual({ chosen: false, shown: false });
    });

    it("are made once the player asks for the 3/4, shown out of the editor and of Basique, kept hidden in them", () => {
        expect(blocksStateOf(base)).toEqual({ chosen: true, shown: true });
        expect(blocksStateOf({ ...base, editorOpen: true })).toEqual({ chosen: true, shown: false });
        expect(blocksStateOf({ ...base, basic: true })).toEqual({ chosen: true, shown: false });
        expect(blocksStateOf({ ...base, chosen: false })).toEqual({ chosen: false, shown: false });
    });

    it("drive the engine of the blocks: none made with capable shaders, made, hidden and destroyed without", () => {
        const made: {
            setHidden: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
            destroy: ReturnType<typeof vi.fn>;
        }[] = [];
        const engines = new GroundEngines(() => {
            const ground = { setHidden: vi.fn(), update: vi.fn(), destroy: vi.fn() };
            made.push(ground);
            return ground;
        });
        // A card whose shaders draw the 3/4: the setting on, the editor opened and closed.
        for (const editorOpen of [false, true, false]) {
            engines.sync(blocksStateOf({ ...base, shader: true, editorOpen }), 0);
        }
        expect(made).toHaveLength(0);
        // A card that cannot.
        engines.sync(blocksStateOf(base), 1);
        expect(made).toHaveLength(1);
        expect(made[0].setHidden).toHaveBeenLastCalledWith(false);
        engines.sync(blocksStateOf({ ...base, editorOpen: true }), 2);
        expect(made[0].setHidden).toHaveBeenLastCalledWith(true);
        expect(made[0].destroy).not.toHaveBeenCalled();
        engines.sync(blocksStateOf({ ...base, chosen: false }), 3);
        expect(made[0].destroy).toHaveBeenCalledTimes(1);
    });
});
