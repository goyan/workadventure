import { mapEditorPatternStore } from "../../../Stores/MapEditorPatternStore";
import type { MapPatternApiErrorCode } from "./MapPatternApi";
import { deleteMapPattern, listMapPatterns, MapPatternApiError } from "./MapPatternApi";

let latestRefresh = 0;

export function patternErrorCodeOf(error: unknown): MapPatternApiErrorCode {
    return error instanceof MapPatternApiError ? error.code : "unavailable";
}

/** Reloads the list. Only the latest call writes the store, so a slow answer cannot overwrite a newer one. */
export async function refreshMapPatterns(roomUrl: string): Promise<void> {
    const refresh = ++latestRefresh;
    mapEditorPatternStore.update((state) => ({ ...state, loading: true, error: undefined }));
    try {
        const patterns = await listMapPatterns(roomUrl);
        if (refresh === latestRefresh) {
            mapEditorPatternStore.update((state) => ({ ...state, patterns, loading: false }));
        }
    } catch (error: unknown) {
        if (refresh === latestRefresh) {
            mapEditorPatternStore.update((state) => ({ ...state, loading: false, error: patternErrorCodeOf(error) }));
        }
    }
}

/** Deletes a pattern then reloads the list; a failure is published in the store, not thrown. */
export async function removeMapPattern(roomUrl: string, id: string): Promise<void> {
    try {
        await deleteMapPattern(roomUrl, id);
    } catch (error: unknown) {
        mapEditorPatternStore.update((state) => ({ ...state, error: patternErrorCodeOf(error) }));
        return;
    }
    await refreshMapPatterns(roomUrl);
}

export function setMapPatternError(error: MapPatternApiErrorCode | undefined): void {
    mapEditorPatternStore.update((state) => ({ ...state, error }));
}

export function setPatternIgnoredCount(ignoredCount: number): void {
    mapEditorPatternStore.update((state) => ({ ...state, ignoredCount }));
}
