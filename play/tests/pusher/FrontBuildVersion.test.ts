import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { Application, Request, Response } from "express";
import { FrontController } from "../../src/pusher/controllers/FrontController";

const fixture = vi.hoisted(() => ({
    html: "",
}));

vi.mock("fs", () => ({
    default: {
        existsSync: () => true,
        readFileSync: () => fixture.html,
    },
}));

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    FRONT_ENVIRONMENT_VARIABLES: {},
}));

vi.mock("../../src/pusher/services/AdminService", () => ({
    adminService: {
        getCapabilities: () => Promise.resolve({}),
    },
}));

vi.mock("../../src/pusher/services/MetaTagsBuilder", () => ({
    MetaTagsBuilder: class {
        getRedirectUrl(): Promise<undefined> {
            return Promise.resolve(undefined);
        }
        getMeta(): Promise<{ favIcons: { src: string }[] }> {
            return Promise.resolve({ favIcons: [{ src: "/icon.png" }] });
        }
        getMapDetails(): Promise<undefined> {
            return Promise.resolve(undefined);
        }
    },
}));

describe("frontend build identity", () => {
    beforeEach(() => {
        fixture.html = '<html><head><script src="/assets/front-a.js"></script></head><body></body></html>';
    });

    it("serves the loaded page's build identity from the uncached version endpoint", async () => {
        const app = mock<Application>();
        new FrontController(app);
        const req = mock<Request>();
        req.header.mockReturnValue("https");
        req.get.mockReturnValue("play.example.org");
        req.originalUrl = "/";
        const res = mock<Response>();
        res.set.mockReturnValue(res);
        res.type.mockReturnValue(res);

        const page = app.get.mock.calls.find(([path]) => path === "/")?.[1];
        const version = app.get.mock.calls.find(([path]) => path === "/build-version")?.[1];
        if (typeof page !== "function" || typeof version !== "function") {
            throw new Error("Frontend routes were not registered");
        }
        await page(req, res);
        const html: unknown = res.send.mock.calls[0]?.[0];
        if (typeof html !== "string") {
            throw new Error("Frontend did not return HTML");
        }
        const loadedVersion = html.match(/<meta name="wa-build-version" content="([a-f0-9]{64})"/)?.[1];
        expect(loadedVersion).toBeDefined();

        version(req, res);

        expect(res.json).toHaveBeenCalledWith({ version: loadedVersion });
        expect(res.set.mock.calls).toContainEqual(["Cache-Control", "no-store"]);
    });

    it("changes the build identity when the deployed frontend assets change", () => {
        const req = mock<Request>();

        function getVersion(): unknown {
            const app = mock<Application>();
            new FrontController(app);
            const res = mock<Response>();
            res.set.mockReturnValue(res);
            const handler = app.get.mock.calls.find(([path]) => path === "/build-version")?.[1];
            if (typeof handler !== "function") {
                throw new Error("Build version route was not registered");
            }
            handler(req, res);
            return res.json.mock.calls[0]?.[0];
        }

        const previousVersion = getVersion();
        expect(getVersion()).toEqual(previousVersion);
        fixture.html = fixture.html.replace("front-a.js", "front-b.js");

        expect(getVersion()).not.toEqual(previousVersion);
    });
});
