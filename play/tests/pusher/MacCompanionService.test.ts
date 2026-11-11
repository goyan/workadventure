import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import {
    MacCompanionError,
    MacCompanionService,
    MAX_UPLOAD_BYTES,
} from "../../src/pusher/services/MacCompanionService";
import type { CalendarConfig } from "../../src/pusher/services/CalendarService";

const config: CalendarConfig = { adminApiUrl: "http://admin-api:8080", authorization: "secret-token" };
const companionToken = "wac_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const meetingKey = "a".repeat(64);

function createService(
    responses: Partial<Record<"get" | "post" | "put" | "delete", unknown>> = {},
    now = () => 1_000_000,
) {
    const http = {
        get: vi.fn().mockResolvedValue(responses.get),
        post: vi.fn().mockResolvedValue(responses.post),
        put: vi.fn().mockResolvedValue(responses.put),
        delete: vi.fn().mockResolvedValue(responses.delete),
    };
    return { service: new MacCompanionService(config, http as unknown as AxiosInstance, now), http };
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
        await promise;
    } catch (e) {
        return e instanceof MacCompanionError ? e.code : "not a MacCompanionError";
    }
    return undefined;
}

describe("MacCompanionService.uploadMeetings", () => {
    it("sends the companion token in its own header, never in the Admin API authorization", async () => {
        const { service, http } = createService({ put: { status: 204, data: "" } });

        await service.uploadMeetings(companionToken, { meetings: [] }, 20);

        expect(http.put).toHaveBeenCalledWith(
            "http://admin-api:8080/api/companion/meetings",
            { meetings: [] },
            expect.objectContaining({
                headers: { Authorization: "secret-token", "X-Companion-Token": companionToken },
            }),
        );
    });

    it("refuses a body over 64 KB without calling the Admin API", async () => {
        const { service, http } = createService({ put: { status: 204, data: "" } });

        expect(await errorCodeOf(service.uploadMeetings(companionToken, {}, MAX_UPLOAD_BYTES + 1))).toBe("too-large");
        expect(http.put).not.toHaveBeenCalled();
    });

    it("limits a token to 30 uploads a minute", async () => {
        const { service } = createService({ put: { status: 204, data: "" } });
        await Promise.all(
            Array.from({ length: 30 }, () => service.uploadMeetings(companionToken, { meetings: [] }, 20)),
        );

        expect(await errorCodeOf(service.uploadMeetings(companionToken, { meetings: [] }, 20))).toBe("rate-limit");
    });

    it("tells an unknown or revoked token apart from a disabled feature", async () => {
        expect(await errorCodeOf(createService({ put: { status: 401 } }).service.uploadMeetings("wac_x", {}, 2))).toBe(
            "unauthorized",
        );
        expect(await errorCodeOf(createService({ put: { status: 404 } }).service.uploadMeetings("wac_x", {}, 2))).toBe(
            "disabled",
        );
        expect(await errorCodeOf(createService({ put: { status: 400 } }).service.uploadMeetings("wac_x", {}, 2))).toBe(
            "invalid",
        );
    });

    it("never lets the token reach an error message", async () => {
        const { service, http } = createService();
        http.put.mockRejectedValue(new Error(`boom ${companionToken}`));

        try {
            await service.uploadMeetings(companionToken, {}, 2);
        } catch (e) {
            expect(String(e)).not.toContain(companionToken);
            expect(JSON.stringify(e)).not.toContain(companionToken);
        }
    });
});

describe("MacCompanionService tokens", () => {
    it("lists, creates and revokes the tokens of the authenticated user", async () => {
        const token = {
            id: "59a53748-d07d-4a0a-900a-09c7b5326e66",
            label: "MacBook",
            createdAt: "2026-11-11T15:00:00.000Z",
            lastUsedAt: null,
        };
        const { service, http } = createService({
            get: { status: 200, data: { tokens: [token] } },
            post: { status: 201, data: { ...token, token: companionToken } },
            delete: { status: 204 },
        });

        expect(await service.listTokens("herve@infogene.fr")).toEqual({ tokens: [token] });
        expect(await service.createToken("herve@infogene.fr", { label: "MacBook" })).toEqual({
            ...token,
            token: companionToken,
        });
        await service.deleteToken("herve@infogene.fr", token.id);

        expect(http.post.mock.calls[0]?.[1]).toEqual({ userIdentifier: "herve@infogene.fr", label: "MacBook" });
        expect(http.delete.mock.calls[0]?.[1]).toEqual(
            expect.objectContaining({ params: { userIdentifier: "herve@infogene.fr" } }),
        );
    });

    it("reports a disabled feature and a full quota", async () => {
        expect(await errorCodeOf(createService({ get: { status: 404 } }).service.listTokens("u"))).toBe("disabled");
        expect(
            await errorCodeOf(createService({ post: { status: 409 } }).service.createToken("u", { label: "m" })),
        ).toBe("quota");
    });
});

describe("MacCompanionService meeting rooms", () => {
    it("claims a room for the authenticated user, whatever user the body names", async () => {
        const { service, http } = createService({ post: { status: 200, data: { areaId: "r1" } } });

        const claim = await service.claimRoom("herve@infogene.fr", {
            userIdentifier: "someone@else.fr",
            mapUrl: "/~/goyan/office.wam",
            meetingKey,
            roomAreaIds: ["r1", "r2"],
        });

        expect(claim).toEqual({ areaId: "r1" });
        expect(http.post.mock.calls[0]?.[1]).toEqual({
            userIdentifier: "herve@infogene.fr",
            mapUrl: "/~/goyan/office.wam",
            meetingKey,
            roomAreaIds: ["r1", "r2"],
        });
    });

    it("refuses a claim for a meeting the user is not invited to", async () => {
        const { service } = createService({ post: { status: 403 } });

        expect(await errorCodeOf(service.claimRoom("u", { mapUrl: "/m", meetingKey, roomAreaIds: ["r1"] }))).toBe(
            "forbidden",
        );
    });

    it("drops anything but room, title and end from the shared view", async () => {
        const { service } = createService({
            get: {
                status: 200,
                data: {
                    rooms: [
                        {
                            areaId: "r1",
                            title: "Daily",
                            endsAt: "2026-11-11T16:15:00.000Z",
                            joinUrl: "https://teams.microsoft.com/meet/1",
                            meetingKey,
                        },
                    ],
                },
            },
        });

        expect(await service.listRooms("/~/goyan/office.wam")).toEqual({
            rooms: [{ areaId: "r1", title: "Daily", endsAt: "2026-11-11T16:15:00.000Z" }],
        });
    });
});
