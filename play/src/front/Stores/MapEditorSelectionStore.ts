import { writable } from "svelte/store";

export type MapEditorSelectionState = {
    entityCount: number;
    areaCount: number;
    hasClipboard: boolean;
    hasRectangle: boolean;
    mode: "select" | "move" | "paste";
    busy: boolean;
    error: "blocked" | "failed" | undefined;
};

export const mapEditorSelectionStore = writable<MapEditorSelectionState>({
    entityCount: 0,
    areaCount: 0,
    hasClipboard: false,
    hasRectangle: false,
    mode: "select",
    busy: false,
    error: undefined,
});
