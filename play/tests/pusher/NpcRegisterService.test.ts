// @vitest-environment node
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import axios from "axios";
import type { AxiosAdapter } from "axios";
import { setupCache } from "axios-cache-interceptor";
import * as Sentry from "@sentry/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NpcRegistrationRequest } from "../../src/pusher/services/NpcRegisterService";
import { NpcRegisterService } from "../../src/pusher/services/NpcRegisterService";

// Reproduce the cache installed by the Room API on the process-wide instance.
setupCache(axios);
const originalAdapter = axios.defaults.adapter;
const playUri = "https://wa-beta.goyan.fr/~/carte-antoine-naria-ff0813/office.wam";
const request: NpcRegistrationRequest = { organizationMemberToken: "invitation/with?reserved#characters", playUri };
const member = { userUuid: "npc:ada", email: null, roomUrl: playUri, mapUrlStart: `${playUri}/map` };
const config = { adminApiUrl: "http://admin.test/", authorization: "test-admin-credential" };

afterEach(() => {
    axios.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
});

describe("NpcRegisterService", () => {
    it("should revalidate the same invitation on every GET despite the default axios cache", async () => {
        let accepted = true;
        const adapter = vi.fn<AxiosAdapter>((config) =>
            Promise.resolve({
                data: accepted ? member : { status: "error", code: "NPC_AUTH_INVALID" },
                status: 200,
                statusText: "OK",
                headers: {},
                config,
            }),
        );
        axios.defaults.adapter = adapter;
        const service = new NpcRegisterService(config);

        expect(await service.register(request)).toEqual({ status: "ok", userUuid: "npc:ada", roomUrl: playUri });
        accepted = false;
        expect(await service.register(request)).toEqual({ status: "forbidden" });
        expect(adapter).toHaveBeenCalledTimes(2);
        const options = adapter.mock.calls[0][0];
        expect(options.url).toBe("http://admin.test/api/login-url/invitation%2Fwith%3Freserved%23characters");
        expect(options.headers.get("Authorization")).toBe(config.authorization);
        expect(options.params).toEqual({ playUri });
        expect(options.maxRedirects).toBe(0);
    });

    it("should refuse a human identity or an unexpected room in the Admin API response", async () => {
        const results = await Promise.all(
            [
                { ...member, status: "error" },
                { ...member, userUuid: "human@example.org" },
                { ...member, roomUrl: "https://wa.goyan.fr/~/goyan/office.wam" },
                { ...member, email: "human@example.org" },
            ].map((data) => {
                const adapter: AxiosAdapter = (config) =>
                    Promise.resolve({ data, status: 200, statusText: "OK", headers: {}, config });
                const service = new NpcRegisterService(config, axios.create({ adapter }));
                return service.register(request);
            }),
        );
        expect(results).toEqual(Array(4).fill({ status: "forbidden" }));
    });

    it("should allow another attempt after the minute expires", () => {
        let now = 0;
        const service = new NpcRegisterService(config, axios.create(), () => now);
        for (let i = 0; i < 10; i++) expect(service.acceptRequest("test-ip")).toBe(true);
        expect(service.acceptRequest("test-ip")).toBe(false);
        now = 60_001;
        expect(service.acceptRequest("test-ip")).toBe(true);
    });

    it("should omit the invitation URL from Sentry HTTP breadcrumbs", async () => {
        const breadcrumb = vi.fn();
        Sentry.init({
            dsn: "https://public@example.test/1",
            integrations: [Sentry.httpIntegration({ spans: false })],
            transport: () => ({
                send: () => Promise.resolve({ statusCode: 200 }),
                flush: () => Promise.resolve(true),
            }),
            beforeBreadcrumb: (value) => {
                breadcrumb(value);
                return value;
            },
        });
        // Sentry instruments built-ins through a require hook; Vitest loads them through Vite first.
        createRequire(import.meta.url)("node:http");
        const server = createServer((_req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(member));
        });
        server.listen(0, "127.0.0.1");
        try {
            await once(server, "listening");
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("Test server address missing");
            const adminApiUrl = `http://127.0.0.1:${address.port}`;
            const http = axios.create();
            await http.get(`${adminApiUrl}/instrumentation-check`);
            expect(breadcrumb.mock.calls.some(([value]) => value.category === "http")).toBe(true);
            breadcrumb.mockClear();
            const service = new NpcRegisterService({ ...config, adminApiUrl }, http);
            expect(await service.register(request)).toEqual({ status: "ok", userUuid: "npc:ada", roomUrl: playUri });
            expect(breadcrumb.mock.calls.filter(([value]) => value.category === "http")).toEqual([]);
        } finally {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
            await Sentry.close();
        }
    });
});
