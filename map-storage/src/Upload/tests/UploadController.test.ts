import { describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { mock } from "vitest-mock-extended";
import type { FileSystemInterface } from "../FileSystemInterface";
import type { MapListService } from "../../Services/MapListService";

vi.hoisted(() => {
    process.env.API_URL = "http://admin.test";
    process.env.MAP_STORAGE_API_TOKEN = "token";
    process.env.PUSHER_URL = "http://play.test";
});
vi.mock("../../Services/Authentication", () => ({ passportAuthenticator: vi.fn() }));
import { UploadController } from "../UploadController";

describe("upload limiter lifecycle", () => {
    it("releases successful and failed uploads and serializes a shared storage key", async () => {
        const controller = new UploadController(mock<Express>(), mock<FileSystemInterface>(), mock<MapListService>());
        await Promise.all(
            Array.from({ length: 100 }, (_, index) =>
                controller["limitUpload"](`world-${index}/map.wam`, () => Promise.resolve()),
            ),
        );
        expect(controller).toHaveProperty("uploadLimiter.size", 0);
        await expect(
            controller["limitUpload"]("world/map.wam", () => Promise.reject(new Error("write failed"))),
        ).rejects.toThrow("write failed");
        expect(controller).toHaveProperty("uploadLimiter.size", 0);

        let release = (): void => {};
        const first = controller["limitUpload"](
            "world/map.wam",
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        );
        const secondTask = vi.fn().mockResolvedValue(undefined);
        const second = controller["limitUpload"]("world/map.wam", secondTask);
        await Promise.resolve();
        await Promise.resolve();
        expect(secondTask).not.toHaveBeenCalled();
        expect(controller).toHaveProperty("uploadLimiter.size", 1);
        release();
        await Promise.all([first, second]);
        expect(secondTask).toHaveBeenCalledOnce();
        expect(controller).toHaveProperty("uploadLimiter.size", 0);
    });
});
