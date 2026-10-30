import { writable } from "svelte/store";
import type { MapPatternSummaryForClient } from "../../common/MapPattern";
import type { MapPatternApiErrorCode } from "../Phaser/Game/MapEditor/MapPatternApi";

/** API errors, plus the refusal of a deletion by someone who is neither the author nor an administrator. */
export type MapPatternStoreError = MapPatternApiErrorCode | "delete-forbidden";

export type MapEditorPatternState = {
    patterns: MapPatternSummaryForClient[];
    loading: boolean;
    error: MapPatternStoreError | undefined;
    /** Items left out by the last paste (prefab not loaded in the map, area without the right to edit areas). */
    ignoredCount: number;
    /** Pattern currently armed in the Paste mode (stamp), highlighted in the list. */
    armedPatternId: string | undefined;
};

export const mapEditorPatternStore = writable<MapEditorPatternState>({
    patterns: [],
    loading: false,
    error: undefined,
    ignoredCount: 0,
    armedPatternId: undefined,
});
