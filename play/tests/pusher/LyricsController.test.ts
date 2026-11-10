import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request } from "express";
import type { ResponseWithUserIdentifier } from "../../src/pusher/middlewares/Authenticated";
import { LyricsController } from "../../src/pusher/controllers/LyricsController";
import type { LyricsServiceResult } from "../../src/pusher/services/LyricsService";

vi.mock("../../src/pusher/middlewares/Authenticated", () => ({
    authenticated: (req: Request, res: ResponseWithUserIdentifier, next: NextFunction): void => {
        if (req.headers.authorization !== "test-session") {
            res.status(401).send();
            return;
        }
        res.userIdentifier = "test-user";
        next();
    },
}));

let server: Server;
let url: string;
const lookup = vi.fn<() => Promise<LyricsServiceResult>>();

beforeEach(async () => {
    lookup.mockResolvedValue({ status: "missing" });
    const app = express();
    new LyricsController(app, { get: lookup });
    server = await new Promise<Server>((resolve) => {
        const running = app.listen(0, "127.0.0.1", () => resolve(running));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    url = `http://127.0.0.1:${address.port}/lyrics`;
});
afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
    vi.clearAllMocks();
});

describe("LyricsController", () => {
    it("requires authentication before calling a provider", async () => {
        const response = await fetch(`${url}?title=Test&artist=Artist`);
        expect(response.status).toBe(401);
        expect(lookup).not.toHaveBeenCalled();
    });
    it("validates the recording, rejects arrays and accepts duration in milliseconds", async () => {
        const headers = { Authorization: "test-session" };
        expect((await fetch(`${url}?title=Test&artist=Artist&durationMs=-1`, { headers })).status).toBe(400);
        expect((await fetch(`${url}?title=Test&title=Other&artist=Artist`, { headers })).status).toBe(400);
        expect(lookup).not.toHaveBeenCalled();
        const response = await fetch(`${url}?title=Test&artist=Artist&durationMs=200000`, { headers });
        expect(response.status).toBe(200);
        expect(lookup).toHaveBeenCalledWith({ title: "Test", artist: "Artist", durationMs: 200000 });
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ status: "missing" });
    });
    it("forwards the provider's cooldown and sanitized errors", async () => {
        lookup.mockResolvedValueOnce({ status: "limited", retryAfterMs: 120_000 });
        const response = await fetch(`${url}?title=Test&artist=Artist`, { headers: { Authorization: "test-session" } });
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("120");
        expect(await response.json()).toEqual({ error: "limited" });
    });
});
