import { writable } from "svelte/store";

export type MapEditorSelectionState = {
    entityCount: number;
    areaCount: number;
    hasClipboard: boolean;
    hasRectangle: boolean;
    mode: "select" | "move" | "paste";
    busy: boolean;
    error: "blocked" | "failed" | "personalArea" | undefined;
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

/**
 * Which kinds of content a selection rectangle picks up. Floors and walls of the Map tool cover whole rooms, so they
 * are left out by default: a rectangle drawn around furniture would otherwise take (and delete) the floor under it.
 */
export type MapEditorSelectionFilters = {
    objects: boolean;
    mapLayer: boolean;
    areas: boolean;
};

export const mapEditorSelectionFiltersStore = writable<MapEditorSelectionFilters>({
    objects: true,
    mapLayer: false,
    areas: true,
});
