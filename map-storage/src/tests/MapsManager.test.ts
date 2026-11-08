import { afterEach, describe, expect, it, vi } from "vitest";
import type { Command } from "@workadventure/map-editor";
import { mock } from "vitest-mock-extended";

vi.hoisted(() => {
    process.env.API_URL = "http://admin.test";
    process.env.MAP_STORAGE_API_TOKEN = "token";
    process.env.PUSHER_URL = "http://play.test";
});
vi.mock("../fileSystem", () => ({
    fileSystem: {
        readFileAsString: vi.fn().mockResolvedValue(
            JSON.stringify({
                version: "1.0.0",
                mapUrl: "map.tmj",
                entityCollections: [],
                areas: [],
                entities: {},
            }),
        ),
    },
}));
import { mapsManager } from "../MapsManager";

const key = "world/map.wam";
afterEach(() => {
    mapsManager.clearAfterUpload(key);
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("map edit cache lifecycle", () => {
    it("keeps command replay history until its existing eviction timeout", async () => {
        vi.useFakeTimers();
        await mapsManager.waitForLock(key, async () => {
            await mapsManager.getOrLoadWamFile(key);
            mapsManager.addCommandToQueue(key, { id: "replay", editMapMessage: undefined });
        });
        expect(mapsManager.getWamFile(key)).toBeDefined();
        expect(mapsManager.getCommandsNewerThan(key, undefined)).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(mapsManager.getWamFile(key)).toBeUndefined();
        expect(mapsManager.getCommandsNewerThan(key, undefined)).toEqual([]);
    });

    it("does not evict a map used by a newer edit when a timed-out callback finishes", async () => {
        vi.useFakeTimers();
        vi.spyOn(console, "error").mockImplementation(() => {});
        let finishFirst = (): void => {};
        let finishSecond = (): void => {};
        const first = mapsManager.waitForLock(key, async () => {
            await mapsManager.getOrLoadWamFile(key);
            await new Promise<void>((resolve) => {
                finishFirst = resolve;
            });
        });
        const timedOut = expect(first).rejects.toThrow("Lock timeout");
        await vi.advanceTimersByTimeAsync(10_000);
        await timedOut;
        const second = mapsManager.waitForLock(key, async () => {
            await mapsManager.getOrLoadWamFile(key);
            await new Promise<void>((resolve) => {
                finishSecond = resolve;
            });
        });
        await vi.advanceTimersByTimeAsync(0);
        finishFirst();
        await vi.advanceTimersByTimeAsync(0);
        expect(mapsManager.getWamFile(key)).toBeDefined();
        finishSecond();
        await second;
        expect(mapsManager.getWamFile(key)).toBeUndefined();
        expect(mapsManager).toHaveProperty("activeEditOperations.size", 0);
    });

    it("releases a map loaded by an edit that fails before changing it", async () => {
        await expect(
            mapsManager.waitForLock(key, async () => {
                await mapsManager.getOrLoadWamFile(key);
                throw new Error("permission denied");
            }),
        ).rejects.toThrow("permission denied");
        expect(mapsManager.getWamFile(key)).toBeUndefined();
    });

    it("releases a map after an operation that made no changes", async () => {
        await mapsManager.waitForLock(key, async () => {
            await mapsManager.getOrLoadWamFile(key);
        });
        expect(mapsManager.getWamFile(key)).toBeUndefined();
    });

    it("retains edits waiting for autosave even after a later request fails", async () => {
        vi.useFakeTimers();
        await mapsManager.waitForLock(key, async () => {
            await mapsManager.getOrLoadWamFile(key);
            await mapsManager.executeCommand(
                key,
                "world",
                mock<Command>({ execute: () => Promise.resolve(undefined) }),
            );
        });
        const pendingMap = mapsManager.getWamFile(key);
        expect(pendingMap).toBeDefined();
        await expect(mapsManager.waitForLock(key, () => Promise.reject(new Error("denied")))).rejects.toThrow("denied");
        expect(mapsManager.getWamFile(key)).toBe(pendingMap);
    });
});
