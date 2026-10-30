import { writable } from "svelte/store";
import type { MapPatternSummary } from "../../common/MapPattern";
import type { MapPatternApiErrorCode } from "../Phaser/Game/MapEditor/MapPatternApi";

export type MapEditorPatternState = {
    patterns: MapPatternSummary[];
    loading: boolean;
    error: MapPatternApiErrorCode | undefined;
    /** Items left out by the last paste (prefab not loaded in the map, area without the right to edit areas). */
    ignoredCount: number;
};

export const mapEditorPatternStore = writable<MapEditorPatternState>({
    patterns: [],
    loading: false,
    error: undefined,
    ignoredCount: 0,
});
