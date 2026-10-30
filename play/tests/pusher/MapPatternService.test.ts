import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import type { MapPatternPayload } from "../../src/common/MapPattern";
import {
    canManagePatterns,
    MapPatternError,
    MapPatternService,
    readMapPatternConfig,
} from "../../src/pusher/services/MapPatternService";
import type { MapPatternConfig } from "../../src/pusher/services/MapPatternService";

const config: MapPatternConfig = { adminApiUrl: "http://admin-api:8080", authorization: "secret-token" };
const patternId = "7d0f6c4e-1b0a-4d4e-9d0e-0c9f2f1a3b11";

const payload: MapPatternPayload = {
    version: 1,
    bounds: { width: 64, height: 32 },
    items: [
        {
            kind: "entity",
            data: { x: 0, y: 0, prefabRef: { collectionName: "Tiles", id: "tile" }, properties: [] },
            dimensions: { width: 32, height: 32 },
        },
    ],
};

const summary = {
    id: patternId,
    name: "Salle",
    entityCount: 1,
    areaCount: 0,
    createdBy: "user-1",
    createdAt: "2026-10-30T10:00:00.000Z",
};

function createService(responses: Partial<Record<"get" | "post" | "delete", unknown>> = {}, now = () => 1_000_000) {
    const http = {
        get: vi.fn().mockResolvedValue(responses.get),
        post: vi.fn().mockResolvedValue(responses.post),
        delete: vi.fn().mockResolvedValue(responses.delete),
    };
    return { service: new MapPatternService(config, http as unknown as AxiosInstance, now), http };
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
        await promise;
    } catch (e) {
        return e instanceof MapPatternError ? e.code : "not a MapPatternError";
    }
    return undefined;
}

describe("readMapPatternConfig", () => {
    it("should be disabled without the Admin API URL or token", () => {
        expect(readMapPatternConfig({ adminApiUrl: undefined, adminApiToken: "t" })).toBeUndefined();
        expect(readMapPatternConfig({ adminApiUrl: "http://a", adminApiToken: "" })).toBeUndefined();
    });

    it("should drop the trailing slash of the URL", () => {
        expect(readMapPatternConfig({ adminApiUrl: "http://a:8080//", adminApiToken: "t" })).toEqual({
            adminApiUrl: "http://a:8080",
            authorization: "t",
        });
    });
});

describe("canManagePatterns", () => {
    const front = "https://wa-beta.goyan.fr";

    it("should grant the right when the Admin API says the user can edit this room", async () => {
        const fetchMember = vi.fn().mockResolvedValue({ canEdit: true });
        await expect(
            canManagePatterns("https://wa-beta.goyan.fr/~/goyan/office.wam", front, { fetchMember }),
        ).resolves.toBe(true);
        expect(fetchMember).toHaveBeenCalledWith("https://wa-beta.goyan.fr/~/goyan/office.wam");
    });

    it("should refuse a user who cannot edit, or whose right is unknown", async () => {
        const url = "https://wa-beta.goyan.fr/~/goyan/office.wam";
        await expect(
            canManagePatterns(url, front, { fetchMember: vi.fn().mockResolvedValue({ canEdit: false }) }),
        ).resolves.toBe(false);
        await expect(
            canManagePatterns(url, front, { fetchMember: vi.fn().mockResolvedValue(undefined) }),
        ).resolves.toBe(false);
    });

    it("should refuse a room of another origin without asking the Admin API", async () => {
        const fetchMember = vi.fn();
        await expect(
            canManagePatterns("https://evil.example/~/goyan/office.wam", front, { fetchMember }),
        ).resolves.toBe(false);
        expect(fetchMember).not.toHaveBeenCalled();
    });
});

describe("MapPatternService", () => {
    it("should relay the list with the Admin API token", async () => {
        const { service, http } = createService({ get: { status: 200, data: { patterns: [summary] } } });
        await expect(service.list()).resolves.toEqual({ patterns: [summary] });
        expect(http.get).toHaveBeenCalledWith(
            "http://admin-api:8080/api/map-patterns",
            expect.objectContaining({ headers: { Authorization: "secret-token" } }),
        );
    });

    it("should relay a pattern with its payload", async () => {
        const { service } = createService({ get: { status: 200, data: { ...summary, payload } } });
        await expect(service.get(patternId)).resolves.toEqual({ ...summary, payload });
    });

    it("should refuse a stored payload that does not match the schema", async () => {
        const { service } = createService({
            get: { status: 200, data: { ...summary, payload: { version: 2, bounds: {}, items: [] } } },
        });
        expect(await errorCodeOf(service.get(patternId))).toBe("unavailable");
    });

    it("should relay not-found and refuse a non UUID id before calling the Admin API", async () => {
        const { service, http } = createService({ get: { status: 404, data: { error: "not-found" } } });
        expect(await errorCodeOf(service.get(patternId))).toBe("not-found");
        http.get.mockClear();
        expect(await errorCodeOf(service.get("../../api/room/create"))).toBe("not-found");
        expect(await errorCodeOf(service.delete("1 OR 1=1"))).toBe("not-found");
        expect(http.get).not.toHaveBeenCalled();
        expect(http.delete).not.toHaveBeenCalled();
    });

    it("should create a pattern with the user identifier taken from the server", async () => {
        const { service, http } = createService({ post: { status: 201, data: summary } });
        await expect(service.create("user-1", "  Salle  ", payload)).resolves.toEqual(summary);
        expect(http.post).toHaveBeenCalledWith(
            "http://admin-api:8080/api/map-patterns",
            { name: "Salle", payload, userIdentifier: "user-1" },
            expect.objectContaining({ headers: { Authorization: "secret-token" } }),
        );
    });

    it("should ignore a userIdentifier smuggled in the payload and never forward it at top level", async () => {
        const { service, http } = createService({ post: { status: 201, data: summary } });
        await service.create("user-1", "Salle", { ...payload, userIdentifier: "attacker" });
        const body = http.post.mock.calls[0][1] as Record<string, unknown>;
        expect(body.userIdentifier).toBe("user-1");
        expect(JSON.stringify(body.payload)).not.toContain("attacker");
    });

    it("should refuse an invalid payload or name before calling the Admin API", async () => {
        const { service, http } = createService({ post: { status: 201, data: summary } });
        expect(await errorCodeOf(service.create("user-1", "Salle", { ...payload, version: 2 }))).toBe("invalid");
        expect(await errorCodeOf(service.create("user-1", "Salle", { ...payload, items: [] }))).toBe("invalid");
        expect(
            await errorCodeOf(
                service.create("user-1", "Salle", {
                    ...payload,
                    items: [{ kind: "entity", data: { x: "0" }, dimensions: { width: 1, height: 1 } }],
                }),
            ),
        ).toBe("invalid");
        expect(await errorCodeOf(service.create("user-1", "   ", payload))).toBe("invalid");
        expect(await errorCodeOf(service.create("user-1", "x".repeat(61), payload))).toBe("invalid");
        expect(http.post).not.toHaveBeenCalled();
    });

    it("should relay 400 as invalid and 409 as quota", async () => {
        expect(
            await errorCodeOf(
                createService({ post: { status: 400, data: { error: "invalid" } } }).service.create("u", "n", payload),
            ),
        ).toBe("invalid");
        expect(
            await errorCodeOf(
                createService({ post: { status: 409, data: { error: "quota" } } }).service.create("u", "n", payload),
            ),
        ).toBe("quota");
    });

    it("should delete a pattern and relay not-found", async () => {
        await expect(createService({ delete: { status: 204 } }).service.delete(patternId)).resolves.toBeUndefined();
        expect(await errorCodeOf(createService({ delete: { status: 404 } }).service.delete(patternId))).toBe(
            "not-found",
        );
    });

    it("should answer unavailable on a 5xx of the Admin API", async () => {
        expect(await errorCodeOf(createService({ get: { status: 500, data: {} } }).service.list())).toBe("unavailable");
    });

    it("should answer unavailable on a network error without leaking the token", async () => {
        const networkError = Object.assign(new Error("connect ECONNREFUSED"), {
            isAxiosError: true,
            code: "ECONNREFUSED",
            config: { headers: { Authorization: "secret-token" } },
        });
        const http = { get: vi.fn().mockRejectedValue(networkError) };
        const service = new MapPatternService(config, http as unknown as AxiosInstance);
        const error = await service.list().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MapPatternError);
        expect((error as MapPatternError).code).toBe("unavailable");
        const exposed = JSON.stringify(error) + String(error) + String((error as MapPatternError).cause);
        expect(exposed).not.toContain("secret-token");
        expect(Object.getOwnPropertyNames(error)).not.toContain("config");
    });

    it("should limit the queries of one user to 60 per minute", () => {
        let time = 1_000_000;
        const { service } = createService({}, () => time);
        for (let i = 0; i < 60; i++) {
            service.assertQueryWithinRate("user-1");
        }
        expect(() => service.assertQueryWithinRate("user-1")).toThrow(MapPatternError);
        // another user is not affected, and the window slides
        expect(() => service.assertQueryWithinRate("user-2")).not.toThrow();
        time += 61_000;
        expect(() => service.assertQueryWithinRate("user-1")).not.toThrow();
    });
});
