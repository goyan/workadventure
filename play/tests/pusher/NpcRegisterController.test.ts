// @vitest-environment node
import { once } from "node:events";
import type { Server } from "node:http";
import axios from "axios";
import type { AxiosAdapter } from "axios";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    ADMIN_API_URL: undefined,
    ADMIN_API_TOKEN: undefined,
    SECRET_KEY: "test-secret-not-a-credential",
    ADMIN_SOCKETS_TOKEN: undefined,
}));

import { NpcRegisterController } from "../../src/pusher/controllers/NpcRegisterController";
import { NpcRegisterService } from "../../src/pusher/services/NpcRegisterService";
import { jwtTokenManager } from "../../src/pusher/services/JWTTokenManager";

const playUri = "https://wa-beta.goyan.fr/~/carte-antoine-naria-ff0813/office.wam";
const body = { organizationMemberToken: "test-invitation-not-a-credential", playUri };
const member = { userUuid: "npc:ada", email: null, roomUrl: playUri, mapUrlStart: `${playUri}/map` };
const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => {
                    server.close(() => resolve());
                }),
        ),
    );
    vi.restoreAllMocks();
});

async function fixture(data: unknown = member, status = 200, unreachable = false) {
    const adapter = vi.fn<AxiosAdapter>((config) => {
        if (unreachable) return Promise.reject(new Error(`Private request: ${body.organizationMemberToken}`));
        return Promise.resolve({ data, status, statusText: "OK", headers: {}, config });
    });
    const service = new NpcRegisterService(
        { adminApiUrl: "http://admin.test", authorization: "test-admin-credential" },
        axios.create({ adapter }),
    );
    const app = express();
    app.use(express.json());
    new NpcRegisterController(app, service);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address missing");
    const url = `http://127.0.0.1:${address.port}/register`;
    return {
        adapter,
        url,
        post: (payload: unknown = body, ip = "127.0.0.1") =>
            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
                body: JSON.stringify(payload),
            }),
    };
}

describe("NpcRegisterController", () => {
    it("should issue a WA JWT without an access token or tags after Admin API validation", async () => {
        const f = await fixture();
        const response = await f.post({ ...body, tags: ["admin"], accessToken: "untrusted" });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const registered = z
            .object({ authToken: z.string(), userUuid: z.string(), roomUrl: z.string() })
            .strict()
            .parse(await response.json());
        expect(registered.userUuid).toBe("npc:ada");
        expect(registered.roomUrl).toBe(playUri);
        const jwt = await jwtTokenManager.verifyJWTToken(registered.authToken);
        expect(jwt.identifier).toBe("npc:ada");
        expect(jwt.accessToken).toBeUndefined();
        expect(jwt.tags).toBeUndefined();
    });

    it("should return only 403 for an Admin API error in an HTTP 200 response", async () => {
        const f = await fixture({
            status: "error",
            type: "error",
            code: "NPC_AUTH_INVALID",
            details: body.organizationMemberToken,
        });
        const response = await f.post();
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "forbidden" });
    });

    it("should reject invalid bodies and other rooms before calling the Admin API", async () => {
        const f = await fixture();
        const responses = await Promise.all(
            [
                {},
                { ...body, organizationMemberToken: "" },
                { ...body, organizationMemberToken: "x".repeat(2049) },
                { ...body, playUri: "https://wa.goyan.fr/~/carte-antoine-naria-ff0813/office.wam" },
            ].map((payload) => f.post(payload)),
        );
        expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
        expect(f.adapter).not.toHaveBeenCalled();
    });

    it("should return only 503 for an unreachable Admin API", async () => {
        const f = await fixture(undefined, 200, true);
        const response = await f.post();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "unavailable" });
    });

    it("should reject malformed JSON without exposing its raw invitation body", async () => {
        const f = await fixture();
        const response = await fetch(f.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: `{"organizationMemberToken":"${body.organizationMemberToken}",broken`,
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid" });
        expect(f.adapter).not.toHaveBeenCalled();
    });

    it("should return 503 for an Admin API server error", async () => {
        const f = await fixture({}, 503);
        expect((await f.post()).status).toBe(503);
    });

    it("should limit attempts to ten per IP while allowing a different IP", async () => {
        const f = await fixture();
        const responses = await Promise.all(Array.from({ length: 10 }, () => f.post()));
        expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
        expect((await f.post()).status).toBe(429);
        expect((await f.post(body, "127.0.0.2")).status).toBe(200);
        expect(f.adapter).toHaveBeenCalledTimes(11);
    });
});
