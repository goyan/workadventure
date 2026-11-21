import { describe, expect, it } from "vitest";
import { toolPauseFor } from "../../../../../src/front/Phaser/Game/MapEditor/CatastropheToolPause";
import { EditorToolName } from "../../../../../src/front/Phaser/Game/MapEditor/EditorToolName";

describe("toolPauseFor", () => {
    it("puts the active tool aside when a catastrophe is armed", () => {
        expect(toolPauseFor(true, EditorToolName.TerrainEditor, undefined)).toEqual({
            equip: null,
            paused: EditorToolName.TerrainEditor,
        });
    });

    it("keeps the tool put aside while another catastrophe is armed", () => {
        expect(toolPauseFor(true, undefined, EditorToolName.TerrainEditor)).toEqual({
            paused: EditorToolName.TerrainEditor,
        });
    });

    it("takes the tool back once nothing is armed", () => {
        expect(toolPauseFor(false, undefined, EditorToolName.TerrainEditor)).toEqual({
            equip: EditorToolName.TerrainEditor,
            paused: undefined,
        });
    });

    it("leaves a tool picked meanwhile alone", () => {
        expect(toolPauseFor(false, EditorToolName.EntityEditor, undefined)).toEqual({ paused: undefined });
        expect(toolPauseFor(false, undefined, undefined)).toEqual({ paused: undefined });
    });
});
