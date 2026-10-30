import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMapPattern,
    deleteMapPattern,
    getMapPattern,
    listMapPatterns,
    MapPatternApiError,
} from "../../../../src/front/Phaser/Game/MapEditor/MapPatternApi";
import type { MapPatternPayload } from "../../../../src/common/MapPattern";

const roomUrl = "https://wa-beta.goyan.fr/~/goyan/office.wam";
const patternId = "7d0f6c4e-1b0a-4d4e-9d0e-0c9f2f1a3b11";
const summary = {
    id: patternId,
    name: "Salle",
    entityCount: 1,
    areaCount: 0,
    canDelete: true,
    createdAt: "2026-10-30T10:00:00.000Z",
};
const payload: MapPatternPayload = {
    version: 1,
    bounds: { width: 32, height: 32 },
    items: [
        {
            kind: "entity",
            data: { x: 0, y: 0, prefabRef: { collectionName: "Tiles", id: "tile" }, properties: [] },
            dimensions: { width: 32, height: 32 },
        },
    ],
};

function answer(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
        await promise;
    } catch (e) {
        return e instanceof MapPatternApiError ? e.code : "not a MapPatternApiError";
    }
    return undefined;
}

describe("MapPatternApi", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("should list patterns with the room URL in the query", async () => {
        const fetchMock = vi.fn().mockResolvedValue(answer(200, { patterns: [summary] }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(listMapPatterns(roomUrl)).resolves.toEqual([summary]);
        expect(String(fetchMock.mock.calls[0][0])).toMatch(
            new RegExp(`/map-patterns\\?roomUrl=${encodeURIComponent(roomUrl)}$`),
        );
    });

    it("should send the room URL in the body of a creation", async () => {
        const fetchMock = vi.fn().mockResolvedValue(answer(201, summary));
        vi.stubGlobal("fetch", fetchMock);

        await createMapPattern(roomUrl, "Salle", payload);

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe("POST");
        expect(JSON.parse(typeof init.body === "string" ? init.body : "")).toEqual({ roomUrl, name: "Salle", payload });
    });

    it("should read a pattern and delete a pattern", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(200, { ...summary, payload })));
        await expect(getMapPattern(roomUrl, patternId)).resolves.toEqual({ ...summary, payload });

        const fetchMock = vi.fn().mockResolvedValue(answer(204));
        vi.stubGlobal("fetch", fetchMock);
        await expect(deleteMapPattern(roomUrl, patternId)).resolves.toBeUndefined();
        expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    });

    it.each([
        [400, "invalid"],
        [403, "forbidden"],
        [409, "quota"],
        [429, "rate-limit"],
        [502, "unavailable"],
        [500, "unavailable"],
    ])("should map HTTP %i to %s", async (status, code) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(status, { error: "x" })));
        expect(await errorCodeOf(listMapPatterns(roomUrl))).toBe(code);
    });

    it("should tell a missing pattern from a disabled feature", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(404, { error: "not-found" })));
        expect(await errorCodeOf(getMapPattern(roomUrl, patternId))).toBe("not-found");

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(404, { error: "disabled" })));
        expect(await errorCodeOf(listMapPatterns(roomUrl))).toBe("unavailable");
    });

    it("should answer unavailable on a network error or an unexpected body", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        expect(await errorCodeOf(listMapPatterns(roomUrl))).toBe("unavailable");

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(200, { patterns: "nope" })));
        expect(await errorCodeOf(listMapPatterns(roomUrl))).toBe("unavailable");
    });
});
