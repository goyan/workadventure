import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import {
    canCreateMap,
    isCreationAllowed,
    MapCreationError,
    MapCreationService,
    readMapCreationConfig,
    roomPathFromUrl,
} from "../../src/pusher/services/MapCreationService";
import type { MapCreationConfig } from "../../src/pusher/services/MapCreationService";

const config: MapCreationConfig = {
    creatorTag: "admin",
    maxPerUserPerHour: 2,
    adminApiUrl: "http://admin-api:8080",
    authorization: "secret-token",
    mapStorageUrl: "http://map-storage:3000",
};

function mapsResponse(paths: string[], status = 200) {
    return {
        status,
        data: { version: "1.0.0", maps: Object.fromEntries(paths.map((path) => [path, { mapUrl: "office.tmj" }])) },
    };
}

/** Answer of POST /api/room/create, as documented in the Admin API README of the selfhost. */
function created(folder: string) {
    return {
        status: 201,
        data: {
            folder,
            roomUrl: `/~/${folder}/office.wam`,
            wamUrl: `https://wa-beta.goyan.fr/map-storage/${folder}/office.wam`,
        },
    };
}

function createService(options: { existing?: string[]; responses?: unknown[]; now?: () => number } = {}) {
    const responses = [...(options.responses ?? [])];
    const http = {
        get: vi.fn().mockResolvedValue(mapsResponse(options.existing ?? [])),
        post: vi.fn().mockImplementation(() => Promise.resolve(responses.shift() ?? created("carte-salle-a1b2c3"))),
    };
    const service = new MapCreationService(config, http as unknown as AxiosInstance, options.now ?? (() => 1_000_000));
    return { service, http };
}

describe("roomPathFromUrl", () => {
    const front = "https://wa-beta.goyan.fr";

    it("should return the path in map-storage when the URL is a room of this world", () => {
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/goyan/office.wam", front)).toBe("goyan/office.wam");
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/goyan/office.wam?x=1#start", front)).toBe(
            "goyan/office.wam",
        );
    });

    it("should refuse a room of another origin", () => {
        expect(roomPathFromUrl("https://evil.example/~/goyan/office.wam", front)).toBeUndefined();
        expect(roomPathFromUrl("http://wa-beta.goyan.fr/~/goyan/office.wam", front)).toBeUndefined();
    });

    it("should refuse a URL that is not a /~/ wam room or tries a traversal", () => {
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/_/global/maps.example/map.json", front)).toBeUndefined();
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/../etc/office.wam", front)).toBeUndefined();
        // The URL parser resolves encoded dot segments itself: whatever remains never contains ".." and never leaves /~/.
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/a/%2e%2e/office.wam", front) ?? "").not.toContain("..");
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/a/..%2f..%2fetc/office.wam", front)).toBeUndefined();
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/goyan/office.tmj", front)).toBeUndefined();
    });

    it("should refuse everything when the front URL is not configured or the room URL is not a URL", () => {
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/goyan/office.wam", "")).toBeUndefined();
        expect(roomPathFromUrl("not a url", front)).toBeUndefined();
    });
});

describe("MapCreationService.roomExists", () => {
    it("should be true only for a room listed by map-storage", async () => {
        const { service } = createService({ existing: ["goyan/office.wam"] });
        await expect(service.roomExists("goyan/office.wam")).resolves.toBe(true);
        await expect(service.roomExists("other/office.wam")).resolves.toBe(false);
    });
});

describe("canCreateMap", () => {
    it("should allow a user who can edit and has the creator tag", () => {
        expect(canCreateMap(true, ["admin"], "admin")).toBe(true);
    });

    it("should refuse a user without the creator tag", () => {
        expect(canCreateMap(true, ["editor"], "admin")).toBe(false);
    });

    it("should refuse a user who cannot edit even with the creator tag", () => {
        expect(canCreateMap(false, ["admin"], "admin")).toBe(false);
    });

    it("should let any editor create maps when the tag is the development wildcard", () => {
        expect(canCreateMap(true, [], "*")).toBe(true);
        expect(canCreateMap(false, [], "*")).toBe(false);
    });
});

describe("readMapCreationConfig", () => {
    const environment = {
        creatorTag: "admin",
        maxPerUserPerHour: 5,
        adminApiUrl: "http://admin-api:8080/",
        adminApiToken: "t",
        mapStorageUrl: "http://map-storage:3000/",
        production: false,
    };

    it("should use the Admin API token and strip the trailing slashes", () => {
        expect(readMapCreationConfig(environment)).toEqual({
            creatorTag: "admin",
            maxPerUserPerHour: 5,
            adminApiUrl: "http://admin-api:8080",
            authorization: "t",
            mapStorageUrl: "http://map-storage:3000",
        });
    });

    it("should disable the feature when the Admin API is not configured", () => {
        expect(readMapCreationConfig({ ...environment, adminApiUrl: undefined })).toBeUndefined();
        expect(readMapCreationConfig({ ...environment, adminApiToken: undefined })).toBeUndefined();
    });

    it("should disable the feature when map-storage cannot be listed", () => {
        expect(readMapCreationConfig({ ...environment, mapStorageUrl: undefined })).toBeUndefined();
    });

    it("should disable the feature when the development wildcard tag is used in production", () => {
        expect(readMapCreationConfig({ ...environment, creatorTag: "*", production: true })).toBeUndefined();
        expect(readMapCreationConfig({ ...environment, creatorTag: "*" })).toBeDefined();
        expect(readMapCreationConfig({ ...environment, production: true })).toBeDefined();
    });
});

describe("MapCreationService.createMap", () => {
    it("should ask the Admin API for a map with the trimmed name and the user, and return its room", async () => {
        const { service, http } = createService({ responses: [created("carte-zone-bureau-nord-a1b2c3")] });
        const result = await service.createMap("user-1", "  Zone Bureau Nord ");
        expect(result).toEqual({
            folder: "carte-zone-bureau-nord-a1b2c3",
            roomUrl: "/~/carte-zone-bureau-nord-a1b2c3/office.wam",
        });
        expect(http.post).toHaveBeenCalledWith(
            "http://admin-api:8080/api/room/create",
            { name: "Zone Bureau Nord", userIdentifier: "user-1" },
            expect.objectContaining({ headers: { Authorization: "secret-token" } }),
        );
        expect(http.get).not.toHaveBeenCalled();
    });

    it("should reject an empty or too long name without calling the Admin API", async () => {
        const { service, http } = createService();
        await expect(service.createMap("user-1", "   ")).rejects.toMatchObject({ code: "invalid-name" });
        await expect(service.createMap("user-1", "x".repeat(61))).rejects.toMatchObject({ code: "invalid-name" });
        expect(http.post).not.toHaveBeenCalled();
    });

    it("should translate each refusal of the Admin API", async () => {
        const { service } = createService({
            responses: [
                { status: 400, data: { error: "INVALID_NAME" } },
                { status: 403, data: { error: "NOT_ADMIN" } },
                { status: 409, data: { error: "MAP_LIMIT_REACHED", max: 30 } },
                { status: 503, data: { error: "MAP_CREATION_DISABLED" } },
                { status: 503, data: { error: "MAP_STORAGE_UNAVAILABLE" } },
                { status: 401, data: "" },
            ],
        });
        // One user per call: the hourly limit of a user must not hide the answer of the Admin API.
        const codes = await Promise.all(
            [0, 1, 2, 3, 4, 5].map((i) =>
                service.createMap(`user-${i}`, "Salle").catch((e: unknown) => (e as MapCreationError).code),
            ),
        );
        expect(codes).toEqual([
            "invalid-name",
            "forbidden",
            "quota-total",
            "storage-failure",
            "storage-failure",
            "storage-failure",
        ]);
    });

    it("should refuse a room that is not a created map, so an exit never points elsewhere", async () => {
        const { service } = createService({
            responses: [
                { status: 201, data: { folder: "goyan", roomUrl: "/~/goyan/office.wam" } },
                { status: 201, data: { folder: "carte-a-111111", roomUrl: "https://evil.example/~/x.wam" } },
                { status: 201, data: { folder: "carte-../goyan", roomUrl: "/~/carte-../goyan/office.wam" } },
                { status: 201, data: "not json" },
            ],
        });
        const results = await Promise.allSettled([0, 1, 2, 3].map((i) => service.createMap(`user-${i}`, "Salle")));
        for (const result of results) {
            expect(result).toMatchObject({ status: "rejected", reason: { code: "storage-failure" } });
        }
    });

    it("should limit the creations of one user per hour, and let a new hour start fresh", async () => {
        let now = 1_000_000;
        const { service } = createService({ now: () => now });
        await service.createMap("user-1", "Un");
        await service.createMap("user-1", "Deux");
        await expect(service.createMap("user-1", "Trois")).rejects.toMatchObject({ code: "rate-limit" });
        await expect(service.createMap("user-2", "Autre")).resolves.toBeDefined();
        now += 60 * 60 * 1000 + 1;
        await expect(service.createMap("user-1", "Trois")).resolves.toBeDefined();
    });

    it("should not count a failed creation against the user hourly limit", async () => {
        const { service } = createService({ responses: [{ status: 503 }, { status: 409 }] });
        await expect(service.createMap("user-1", "Un")).rejects.toMatchObject({ code: "storage-failure" });
        await expect(service.createMap("user-1", "Deux")).rejects.toMatchObject({ code: "quota-total" });
        await expect(service.createMap("user-1", "Trois")).resolves.toBeDefined();
        await expect(service.createMap("user-1", "Quatre")).resolves.toBeDefined();
    });
});

describe("isCreationAllowed", () => {
    const pusherUrl = "https://wa-beta.goyan.fr/";
    const room = "https://wa-beta.goyan.fr/~/goyan/office.wam";

    function dependencies(member: { canEdit: boolean; tags: string[] } | undefined, exists = true) {
        return {
            fetchMember: vi.fn().mockResolvedValue(member),
            roomExists: vi.fn().mockResolvedValue(exists),
        };
    }

    it("should allow an editor with the creator tag in an existing room", async () => {
        const deps = dependencies({ canEdit: true, tags: ["admin"] });
        await expect(isCreationAllowed(room, pusherUrl, "admin", deps)).resolves.toBe(true);
        expect(deps.fetchMember).toHaveBeenCalledWith("https://wa-beta.goyan.fr/~/goyan/office.wam");
    });

    it("should not even ask the Admin API when the room URL is not a room of this world", async () => {
        const deps = dependencies({ canEdit: true, tags: ["admin"] });
        await expect(
            isCreationAllowed("https://evil.example/~/goyan/office.wam", pusherUrl, "admin", deps),
        ).resolves.toBe(false);
        expect(deps.fetchMember).not.toHaveBeenCalled();
    });

    it("should refuse without listing the maps when the user has no right", async () => {
        const deps = dependencies({ canEdit: true, tags: ["editor"] });
        await expect(isCreationAllowed(room, pusherUrl, "admin", deps)).resolves.toBe(false);
        expect(deps.roomExists).not.toHaveBeenCalled();
    });

    it("should refuse when the Admin API cannot say who the user is", async () => {
        const deps = dependencies(undefined);
        await expect(isCreationAllowed(room, pusherUrl, "admin", deps)).resolves.toBe(false);
        expect(deps.roomExists).not.toHaveBeenCalled();
    });

    it("should refuse when the room does not exist in map-storage", async () => {
        const deps = dependencies({ canEdit: true, tags: ["admin"] }, false);
        await expect(isCreationAllowed(room, pusherUrl, "admin", deps)).resolves.toBe(false);
    });

    it("should refuse everything when PUSHER_URL is not an absolute URL", async () => {
        const deps = dependencies({ canEdit: true, tags: ["admin"] });
        await expect(isCreationAllowed(room, "/", "admin", deps)).resolves.toBe(false);
        expect(deps.fetchMember).not.toHaveBeenCalled();
    });
});

describe("MapCreationService limits under concurrency", () => {
    it("should let only two of three parallel creations pass when one user may create two per hour", async () => {
        const { service, http } = createService();
        const results = await Promise.allSettled([
            service.createMap("user-1", "Un"),
            service.createMap("user-1", "Deux"),
            service.createMap("user-1", "Trois"),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
        const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
        expect(rejected[0].reason).toMatchObject({ code: "rate-limit" });
        expect(http.post).toHaveBeenCalledTimes(2);
    });

    it("should free the reserved slot when the creation fails, so the user can try again", async () => {
        const { service } = createService({ responses: [{ status: 500 }] });
        await expect(service.createMap("user-1", "Un")).rejects.toMatchObject({ code: "storage-failure" });
        await expect(service.createMap("user-1", "Deux")).resolves.toBeDefined();
        await expect(service.createMap("user-1", "Trois")).resolves.toBeDefined();
    });
});

describe("MapCreationService network failures", () => {
    const networkError = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:3000"), {
        isAxiosError: true,
        code: "ECONNREFUSED",
        config: { headers: { Authorization: "secret-token" } },
    });

    function everything(error: unknown): string {
        const parts: string[] = [];
        for (let current: unknown = error; current instanceof Error; current = current.cause) {
            parts.push(current.message, JSON.stringify(current, Object.getOwnPropertyNames(current)));
        }
        return parts.join(" ");
    }

    it("should turn a refused connection to the Admin API into a storage failure without the token", async () => {
        const { service, http } = createService();
        http.post.mockRejectedValue(networkError);
        const error = await service.createMap("user-1", "Salle").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MapCreationError);
        expect(error).toMatchObject({ code: "storage-failure" });
        expect(everything(error)).not.toContain("secret-token");
    });

    it("should turn a failure to list the maps into a storage failure without the token", async () => {
        const { service, http } = createService();
        http.get.mockRejectedValue(networkError);
        const error = await service.roomExists("goyan/office.wam").catch((e: unknown) => e);
        expect(error).toMatchObject({ code: "storage-failure" });
        expect(everything(error)).not.toContain("secret-token");
    });
});

describe("MapCreationService.assertQueryWithinRate", () => {
    it("should refuse the thirty-first query of a minute and accept again when the minute is over", () => {
        let now = 1_000_000;
        const { service } = createService({ now: () => now });
        for (let i = 0; i < 30; i++) {
            service.assertQueryWithinRate("user-1");
        }
        expect(() => service.assertQueryWithinRate("user-1")).toThrow(MapCreationError);
        expect(() => service.assertQueryWithinRate("user-2")).not.toThrow();
        now += 60_001;
        expect(() => service.assertQueryWithinRate("user-1")).not.toThrow();
    });
});

describe("roomPathFromUrl edge cases", () => {
    const front = "https://wa-beta.goyan.fr/";

    it("should drop the user info because the URL is rebuilt from its path", () => {
        expect(roomPathFromUrl("https://attacker@wa-beta.goyan.fr/~/goyan/office.wam", front)).toBe("goyan/office.wam");
    });

    it("should refuse another port, a double slash and an encoded slash", () => {
        expect(roomPathFromUrl("https://wa-beta.goyan.fr:8443/~/goyan/office.wam", front)).toBeUndefined();
        expect(roomPathFromUrl("https://wa-beta.goyan.fr//~/goyan/office.wam", front)).toBeUndefined();
        expect(roomPathFromUrl("https://wa-beta.goyan.fr/~/goyan%2foffice.wam", front)).toBeUndefined();
    });
});
