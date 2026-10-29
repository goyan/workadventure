import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import {
    canCreateMap,
    isCreationAllowed,
    MapCreationError,
    MapCreationService,
    readMapCreationConfig,
    roomPathFromUrl,
    slugifyMapName,
} from "../../src/pusher/services/MapCreationService";
import type { MapCreationConfig } from "../../src/pusher/services/MapCreationService";

const config: MapCreationConfig = {
    template: "blank-grass",
    creatorTag: "admin",
    maxTotal: 3,
    maxPerUserPerHour: 2,
    mapStorageUrl: "http://map-storage:3000",
    authorization: "Bearer secret-token",
};

function mapsResponse(paths: string[], status = 200) {
    return {
        status,
        data: { version: "1.0.0", maps: Object.fromEntries(paths.map((path) => [path, { mapUrl: "office.tmj" }])) },
    };
}

function createService(
    options: { existing?: string[]; copyStatuses?: number[]; now?: () => number; suffixes?: string[] } = {},
) {
    const copyStatuses = [...(options.copyStatuses ?? [])];
    const suffixes = [...(options.suffixes ?? ["a1b2c3", "d4e5f6", "0a0b0c"])];
    const http = {
        get: vi.fn().mockResolvedValue(mapsResponse(options.existing ?? [])),
        post: vi.fn().mockImplementation(() => Promise.resolve({ status: copyStatuses.shift() ?? 201 })),
    };
    const service = new MapCreationService(
        config,
        http as unknown as AxiosInstance,
        options.now ?? (() => 1_000_000),
        () => suffixes.shift() ?? "ffffff",
    );
    return { service, http };
}

describe("slugifyMapName", () => {
    it("should keep only lowercase ASCII letters and single dashes when the name has accents and spaces", () => {
        expect(slugifyMapName("Salle de réunion n°2 !")).toBe("salle-de-reunion-n-2");
    });

    it("should never contain a path separator when the name tries a path traversal", () => {
        expect(slugifyMapName("../../goyan/office")).toBe("goyan-office");
    });

    it("should fall back to a default when nothing usable remains", () => {
        expect(slugifyMapName("???")).toBe("bureau");
    });

    it("should not end with a dash when the truncation cuts inside a separator", () => {
        const slug = slugifyMapName(`${"a".repeat(29)} b`);
        expect(slug.length).toBeLessThanOrEqual(30);
        expect(slug.endsWith("-")).toBe(false);
    });
});

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
        template: "blank-grass",
        creatorTag: "admin",
        maxTotal: 20,
        maxPerUserPerHour: 5,
        mapStorageUrl: "http://map-storage:3000/",
        production: false,
        bearerToken: undefined,
        user: undefined,
        password: undefined,
    };

    it("should disable the feature when no write credential is set", () => {
        expect(readMapCreationConfig(environment)).toBeUndefined();
    });

    it("should disable the feature when the template is missing", () => {
        expect(readMapCreationConfig({ ...environment, template: undefined, bearerToken: "t" })).toBeUndefined();
    });

    it("should prefer the bearer token over the Basic credentials and strip the trailing slash", () => {
        const result = readMapCreationConfig({ ...environment, bearerToken: "t", user: "u", password: "p" });
        expect(result?.authorization).toBe("Bearer t");
        expect(result?.mapStorageUrl).toBe("http://map-storage:3000");
    });

    it("should build a Basic header when only the user and the password are set", () => {
        const result = readMapCreationConfig({ ...environment, user: "u", password: "p" });
        expect(result?.authorization).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
    });

    it("should disable the feature when only the user is set", () => {
        expect(readMapCreationConfig({ ...environment, user: "u" })).toBeUndefined();
    });
});

describe("MapCreationService.createMap", () => {
    it("should copy the configured template into a prefixed folder when the name is valid", async () => {
        const { service, http } = createService();
        const result = await service.createMap("user-1", "Zone Bureau Nord");
        expect(result).toEqual({
            folder: "carte-zone-bureau-nord-a1b2c3",
            roomUrl: "/~/carte-zone-bureau-nord-a1b2c3/office.wam",
        });
        expect(http.post).toHaveBeenCalledWith(
            "http://map-storage:3000/copy",
            { source: "blank-grass", destination: "carte-zone-bureau-nord-a1b2c3" },
            expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } }),
        );
    });

    it("should reject an empty or too long name without calling map-storage", async () => {
        const { service, http } = createService();
        await expect(service.createMap("user-1", "   ")).rejects.toMatchObject({ code: "invalid-name" });
        await expect(service.createMap("user-1", "x".repeat(61))).rejects.toMatchObject({ code: "invalid-name" });
        expect(http.get).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();
    });

    it("should refuse when the maximum number of created maps is reached, counting only prefixed folders", async () => {
        const { service, http } = createService({
            existing: [
                "carte-a-111111/office.wam",
                "carte-b-222222/office.wam",
                "carte-c-333333/office.wam",
                "goyan/office.wam",
            ],
        });
        await expect(service.createMap("user-1", "Quatre")).rejects.toMatchObject({ code: "quota-total" });
        expect(http.post).not.toHaveBeenCalled();
    });

    it("should not count the maps that were not created from the editor", async () => {
        const { service } = createService({
            existing: ["goyan/office.wam", "goyan-wall-prefabs/office.wam", "autre/office.wam", "x/office.wam"],
        });
        await expect(service.createMap("user-1", "Premier")).resolves.toMatchObject({ folder: "carte-premier-a1b2c3" });
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

    it("should try another suffix when the folder already exists", async () => {
        const { service, http } = createService({ copyStatuses: [409, 201] });
        const result = await service.createMap("user-1", "Salle");
        expect(result.folder).toBe("carte-salle-d4e5f6");
        expect(http.post).toHaveBeenCalledTimes(2);
    });

    it("should give up after three collisions", async () => {
        const { service, http } = createService({ copyStatuses: [409, 409, 409] });
        await expect(service.createMap("user-1", "Salle")).rejects.toBeInstanceOf(MapCreationError);
        expect(http.post).toHaveBeenCalledTimes(3);
    });

    it("should report a storage failure without leaking the response when map-storage refuses the copy", async () => {
        const { service } = createService({ copyStatuses: [401] });
        const error = await service.createMap("user-1", "Salle").catch((e: unknown) => e);
        expect(error).toMatchObject({ code: "storage-failure" });
        expect((error as Error).message).not.toContain("secret-token");
    });

    it("should report a storage failure when the list of maps cannot be read", async () => {
        const { service, http } = createService();
        http.get.mockResolvedValue({ status: 500, data: "boom" });
        await expect(service.createMap("user-1", "Salle")).rejects.toMatchObject({ code: "storage-failure" });
        expect(http.post).not.toHaveBeenCalled();
    });

    it("should not count a failed creation against the user hourly limit", async () => {
        const { service } = createService({ copyStatuses: [500, 500, 201, 201] });
        await expect(service.createMap("user-1", "Un")).rejects.toMatchObject({ code: "storage-failure" });
        await expect(service.createMap("user-1", "Deux")).rejects.toMatchObject({ code: "storage-failure" });
        await expect(service.createMap("user-1", "Trois")).resolves.toBeDefined();
        await expect(service.createMap("user-1", "Quatre")).resolves.toBeDefined();
    });
});

describe("readMapCreationConfig in production", () => {
    const environment = {
        template: "blank-grass",
        creatorTag: "admin",
        maxTotal: 20,
        maxPerUserPerHour: 5,
        mapStorageUrl: "http://map-storage:3000",
        production: true,
        bearerToken: "t",
        user: undefined,
        password: undefined,
    };

    it("should disable the feature when the development wildcard tag is used in production", () => {
        expect(readMapCreationConfig({ ...environment, creatorTag: "*" })).toBeUndefined();
        expect(readMapCreationConfig({ ...environment, creatorTag: "*", production: false })).toBeDefined();
    });

    it("should keep the feature enabled in production with a real tag", () => {
        expect(readMapCreationConfig(environment)).toBeDefined();
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

    it("should let only one of two parallel creations pass when the total limit leaves room for one", async () => {
        const { service } = createService({ existing: ["carte-a-111111/office.wam", "carte-b-222222/office.wam"] });
        const results = await Promise.allSettled([
            service.createMap("user-1", "Un"),
            service.createMap("user-2", "Deux"),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
        expect(rejected[0].reason).toMatchObject({ code: "quota-total" });
    });

    it("should free the reserved slot when the creation fails, so the user can try again", async () => {
        const { service } = createService({ copyStatuses: [500, 201] });
        await expect(service.createMap("user-1", "Un")).rejects.toMatchObject({ code: "storage-failure" });
        await expect(service.createMap("user-1", "Deux")).resolves.toBeDefined();
        await expect(service.createMap("user-1", "Trois")).resolves.toBeDefined();
    });
});

describe("MapCreationService network failures", () => {
    const networkError = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:3000"), {
        isAxiosError: true,
        code: "ECONNREFUSED",
        config: { headers: { Authorization: "Bearer secret-token" } },
    });

    function everything(error: unknown): string {
        const parts: string[] = [];
        for (let current: unknown = error; current instanceof Error; current = current.cause) {
            parts.push(current.message, JSON.stringify(current, Object.getOwnPropertyNames(current)));
        }
        return parts.join(" ");
    }

    it("should turn a refused connection on the copy into a storage failure without the credential", async () => {
        const { service, http } = createService();
        http.post.mockRejectedValue(networkError);
        const error = await service.createMap("user-1", "Salle").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MapCreationError);
        expect(error).toMatchObject({ code: "storage-failure" });
        expect(everything(error)).not.toContain("secret-token");
    });

    it("should turn a failure to list the maps into a storage failure without the credential", async () => {
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
