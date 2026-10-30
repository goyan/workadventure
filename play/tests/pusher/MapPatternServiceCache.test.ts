import axios from "axios";
import type { AxiosAdapter } from "axios";
import { setupCache } from "axios-cache-interceptor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPatternService } from "../../src/pusher/services/MapPatternService";

// Same call as src/room-api/authentication/AdminAuthenticator.ts, loaded by the pusher process through the Room API:
// it installs a 5 minute GET cache on the default axios instance.
setupCache(axios);

const originalAdapter = axios.defaults.adapter;

afterEach(() => {
    axios.defaults.adapter = originalAdapter;
});

describe("MapPatternService with the process-wide axios cache", () => {
    it("reads the pattern list from the Admin API on every call, so a new pattern shows up at once", async () => {
        let storedPatterns: string[] = [];
        const adapter = vi.fn<AxiosAdapter>((config) =>
            Promise.resolve({
                data: {
                    patterns: storedPatterns.map((name, index) => ({
                        id: `7d0f6c4e-1b0a-4d4e-9d0e-0c9f2f1a3b1${index}`,
                        name,
                        entityCount: 1,
                        areaCount: 0,
                        createdBy: "user-1",
                        createdAt: "2026-10-30T21:33:42.547Z",
                    })),
                },
                status: 200,
                statusText: "OK",
                headers: {},
                config,
            }),
        );
        axios.defaults.adapter = adapter;
        const service = new MapPatternService({ adminApiUrl: "http://admin-api:3000", authorization: "token" });

        expect((await service.list("user-1", false)).patterns).toEqual([]);
        storedPatterns = ["bureau 5x5-2"];
        const second = await service.list("user-1", false);

        expect(adapter).toHaveBeenCalledTimes(2);
        expect(second.patterns.map((pattern) => pattern.name)).toEqual(["bureau 5x5-2"]);
    });
});
