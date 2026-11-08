import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { WAMVersionHash } from "@workadventure/map-editor/src/WAMVersionHash";
import type { FileSystemInterface } from "../Upload/FileSystemInterface";
import type { WebHookService } from "./WebHookService";

const storage = vi.hoisted(() => {
    process.env.API_URL = "http://admin.test";
    process.env.MAP_STORAGE_API_TOKEN = "token";
    process.env.PUSHER_URL = "http://play.test";
    return { readFileAsString: vi.fn(), writeStringAsFile: vi.fn(), listFiles: vi.fn() };
});
vi.mock("../fileSystem", () => ({ fileSystem: storage }));
import { MapListService } from "./MapListService";

const cache = JSON.stringify({ version: WAMVersionHash, maps: {} });
function service(): MapListService {
    return new MapListService(storage as unknown as FileSystemInterface, mock<WebHookService>());
}
beforeEach(() => {
    vi.resetAllMocks();
    storage.readFileAsString.mockResolvedValue(cache);
    storage.writeStringAsFile.mockResolvedValue(undefined);
    storage.listFiles.mockResolvedValue([]);
});

describe("map catalogue memory lifecycle", () => {
    it("releases idle domain limiters after successful requests", async () => {
        const catalogue = service();
        await Promise.all(Array.from({ length: 100 }, (_, index) => catalogue.readCacheFile(`world-${index}`)));
        expect(catalogue).toHaveProperty("limiters.size", 0);
    });

    it("releases the limiter after a failed write", async () => {
        const catalogue = service();
        storage.writeStringAsFile.mockRejectedValue(new Error("storage unavailable"));
        await expect(catalogue.deleteWAMFileInCache("world", "map.wam")).rejects.toThrow("storage unavailable");
        expect(catalogue).toHaveProperty("limiters.size", 0);
    });

    it("keeps concurrent requests for the same domain serialized until the last one finishes", async () => {
        const catalogue = service();
        let release = (): void => {};
        storage.readFileAsString.mockReturnValueOnce(
            new Promise<string>((resolve) => {
                release = (): void => resolve(cache);
            }),
        );
        const first = catalogue.readCacheFile("world");
        const second = catalogue.readCacheFile("world");
        await Promise.resolve();
        await Promise.resolve();
        expect(storage.readFileAsString).toHaveBeenCalledTimes(1);
        expect(catalogue).toHaveProperty("limiters.size", 1);
        release();
        await Promise.all([first, second]);
        expect(storage.readFileAsString).toHaveBeenCalledTimes(2);
        expect(catalogue).toHaveProperty("limiters.size", 0);
    });

    it("preserves catalogue metadata while discarding the parsed map payload", async () => {
        const catalogue = service();
        storage.listFiles.mockResolvedValue(["map.wam"]);
        storage.readFileAsString.mockResolvedValue(
            JSON.stringify({
                version: "1.0.0",
                mapUrl: "map.tmj",
                areas: [],
                entities: {},
                entityCollections: [],
                metadata: { name: "Meeting room" },
                vendor: { retained: "value" },
            }),
        );
        await catalogue.generateCacheFile("world");
        const written: unknown = storage.writeStringAsFile.mock.calls[0]?.[1];
        expect(JSON.parse(String(written))).toMatchObject({
            maps: {
                "map.wam": { mapUrl: "map.tmj", metadata: { name: "Meeting room" }, vendor: { retained: "value" } },
            },
        });
    });
});
