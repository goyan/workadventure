import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

// Hoisted above the imports below: EnvironmentVariable exits the process when these are missing.
vi.hoisted(() => {
    process.env.API_URL = "http://admin.test";
    process.env.MAP_STORAGE_API_TOKEN = "token";
    process.env.PUSHER_URL = "http://play.test";
});

import type { FileSystemInterface } from "../../Upload/FileSystemInterface";
import { proxyFiles } from "../FileFetcher";

const UPLOADED_IMAGE = "/assets/entities/8b3cf1a1-15fa-4ee4-b900-02db467a90be-tapis-de-course.png";

function request(path: string): { res: Response; headers: Map<string, string>; next: NextFunction } {
    const headers = new Map<string, string>();
    const res = {
        set: (name: string, value: string) => headers.set(name.toLowerCase(), value),
        setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    } as unknown as Response;
    const req = { path, headers: {}, hostname: "map-storage.test" } as unknown as Request;
    const next = vi.fn();
    return { res, headers, next: Object.assign(next, { req }) };
}

function serve(path: string, found: boolean) {
    const fileSystem = {
        serveStaticFile: (_path: string, _res: Response, next: NextFunction) => {
            if (!found) next();
        },
    } as unknown as FileSystemInterface;
    const call = request(path);
    proxyFiles(fileSystem)((call.next as unknown as { req: Request }).req, call.res, call.next);
    return call;
}

describe("proxyFiles", () => {
    it("caches an uploaded image for a year: its name never points to other content", () => {
        const { headers } = serve(UPLOADED_IMAGE, true);
        expect(headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    });

    it("does not let a missing uploaded image be cached, so it shows as soon as its upload ends", () => {
        const { headers, next } = serve(UPLOADED_IMAGE, false);
        expect(next).toHaveBeenCalledOnce();
        expect(headers.get("cache-control")).toBe("no-store");
    });
});
