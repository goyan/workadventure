import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
    deleteMapPattern,
    listMapPatterns,
    MapPatternApiError,
} from "../../../../src/front/Phaser/Game/MapEditor/MapPatternApi";
import { removeMapPattern } from "../../../../src/front/Phaser/Game/MapEditor/MapPatternActions";
import { mapEditorPatternStore } from "../../../../src/front/Stores/MapEditorPatternStore";

vi.mock("../../../../src/front/Phaser/Game/MapEditor/MapPatternApi", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    deleteMapPattern: vi.fn(),
    listMapPatterns: vi.fn(),
}));

const roomUrl = "https://wa-beta.goyan.fr/~/goyan/office.wam";
const patternId = "7d0f6c4e-1b0a-4d4e-9d0e-0c9f2f1a3b11";

describe("removeMapPattern", () => {
    beforeEach(() => {
        vi.mocked(deleteMapPattern).mockReset();
        vi.mocked(listMapPatterns).mockReset().mockResolvedValue([]);
        mapEditorPatternStore.set({ patterns: [], loading: false, error: undefined, ignoredCount: 0 });
    });

    it("should explain that only the author or an administrator can delete when the API answers 403", async () => {
        vi.mocked(deleteMapPattern).mockRejectedValue(new MapPatternApiError("forbidden"));

        await removeMapPattern(roomUrl, patternId);

        expect(get(mapEditorPatternStore).error).toBe("delete-forbidden");
        expect(listMapPatterns).not.toHaveBeenCalled();
    });

    it("should keep the other API errors as they are", async () => {
        vi.mocked(deleteMapPattern).mockRejectedValue(new MapPatternApiError("unavailable"));

        await removeMapPattern(roomUrl, patternId);

        expect(get(mapEditorPatternStore).error).toBe("unavailable");
    });

    it("should reload the list after a successful deletion", async () => {
        vi.mocked(deleteMapPattern).mockResolvedValue();

        await removeMapPattern(roomUrl, patternId);

        expect(listMapPatterns).toHaveBeenCalledWith(roomUrl);
        expect(get(mapEditorPatternStore).error).toBeUndefined();
    });
});
