import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { AxiosError } from "axios";
import {
    CalendarError,
    CalendarService,
    canUseCalendars,
    readCalendarConfig,
} from "../../src/pusher/services/CalendarService";
import type { CalendarConfig } from "../../src/pusher/services/CalendarService";

const config: CalendarConfig = { adminApiUrl: "http://admin-api:8080", authorization: "secret-token" };
const calendarId = "59a53748-d07d-4a0a-900a-09c7b5326e66";
const publishedUrl = "https://outlook.office365.com/owa/calendar/abc@infogene.fr/key/calendar.ics";
const source = { id: calendarId, label: "Infogene", host: "outlook.office365.com" };
const event = {
    id: `${calendarId}:revue:2026-11-19T13:00:00.000Z`,
    title: "Revue de sprint",
    description: "",
    start: "2026-11-19T13:00:00.000Z",
    end: "2026-11-19T14:00:00.000Z",
    allDay: false,
    busy: true,
    private: false,
    joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc",
};

function createService(responses: Partial<Record<"get" | "post" | "delete", unknown>> = {}, now = () => 1_000_000) {
    const http = {
        get: vi.fn().mockResolvedValue(responses.get),
        post: vi.fn().mockResolvedValue(responses.post),
        delete: vi.fn().mockResolvedValue(responses.delete),
    };
    return { service: new CalendarService(config, http as unknown as AxiosInstance, now), http };
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
        await promise;
    } catch (e) {
        return e instanceof CalendarError ? e.code : "not a CalendarError";
    }
    return undefined;
}

describe("readCalendarConfig", () => {
    it("is disabled without an Admin API or its token", () => {
        expect(readCalendarConfig({ adminApiUrl: undefined, adminApiToken: "t" })).toBeUndefined();
        expect(readCalendarConfig({ adminApiUrl: "http://a", adminApiToken: undefined })).toBeUndefined();
        expect(readCalendarConfig({ adminApiUrl: "http://a/", adminApiToken: "t" })).toEqual({
            adminApiUrl: "http://a",
            authorization: "t",
        });
    });
});

describe("canUseCalendars", () => {
    it("refuses the technical identities of the NPCs", () => {
        expect(canUseCalendars("a@infogene.fr")).toBe(true);
        expect(canUseCalendars("npc:ada")).toBe(false);
        expect(canUseCalendars("")).toBe(false);
    });
});

describe("CalendarService", () => {
    it("lists the calendars of the user given by the server", async () => {
        const { service, http } = createService({ get: { status: 200, data: { calendars: [source] } } });
        await expect(service.listSources("a@infogene.fr")).resolves.toEqual({ calendars: [source] });
        expect(http.get).toHaveBeenCalledWith("http://admin-api:8080/api/calendars", {
            headers: { Authorization: "secret-token" },
            timeout: 15_000,
            validateStatus: expect.any(Function),
            params: { userIdentifier: "a@infogene.fr" },
        });
    });

    it("adds a calendar for the user given by the server, never another one", async () => {
        const { service, http } = createService({ post: { status: 201, data: source } });
        await expect(
            service.addSource("a@infogene.fr", { label: " Infogene ", url: ` ${publishedUrl} ` }),
        ).resolves.toEqual(source);
        expect(http.post).toHaveBeenCalledWith(
            "http://admin-api:8080/api/calendars",
            { userIdentifier: "a@infogene.fr", label: "Infogene", url: publishedUrl },
            expect.objectContaining({ headers: { Authorization: "secret-token" } }),
        );
    });

    it("refuses an empty label or link before calling the Admin API", async () => {
        const { service, http } = createService();
        expect(await errorCodeOf(service.addSource("a@infogene.fr", { label: " ", url: publishedUrl }))).toBe(
            "invalid",
        );
        expect(
            await errorCodeOf(service.addSource("a@infogene.fr", { label: "x".repeat(41), url: publishedUrl })),
        ).toBe("invalid");
        expect(await errorCodeOf(service.addSource("a@infogene.fr", { label: "Infogene", url: "" }))).toBe("invalid");
        expect(await errorCodeOf(service.addSource("a@infogene.fr", "pas un objet"))).toBe("invalid");
        expect(http.post).not.toHaveBeenCalled();
    });

    it.each([
        [400, "invalid"],
        [409, "quota"],
        [422, "unreachable"],
        [404, "unavailable"],
        [500, "unavailable"],
    ])("maps the Admin API answer %i of an addition to %s", async (status, code) => {
        const { service } = createService({ post: { status, data: {} } });
        expect(await errorCodeOf(service.addSource("a@infogene.fr", { label: "Infogene", url: publishedUrl }))).toBe(
            code,
        );
    });

    it("deletes only a calendar of the user given by the server", async () => {
        const { service, http } = createService({ delete: { status: 204 } });
        await service.deleteSource("a@infogene.fr", calendarId);
        expect(http.delete).toHaveBeenCalledWith(
            `http://admin-api:8080/api/calendars/${calendarId}`,
            expect.objectContaining({ params: { userIdentifier: "a@infogene.fr" } }),
        );
    });

    it("answers not-found for an id that is not a UUID, without calling the Admin API", async () => {
        const { service, http } = createService({ delete: { status: 204 } });
        expect(await errorCodeOf(service.deleteSource("a@infogene.fr", "../map-patterns"))).toBe("not-found");
        expect(http.delete).not.toHaveBeenCalled();
    });

    it("answers not-found when the Admin API does not find the calendar of this user", async () => {
        const { service } = createService({ delete: { status: 404 } });
        expect(await errorCodeOf(service.deleteSource("a@infogene.fr", calendarId))).toBe("not-found");
    });

    it("reads the events of a window of the user given by the server", async () => {
        const { service, http } = createService({
            get: { status: 200, data: { events: [event], failed: [{ id: calendarId, label: "Emeria" }] } },
        });
        const from = new Date("2026-11-16T00:00:00Z");
        const to = new Date("2026-11-23T00:00:00Z");
        await expect(service.events("a@infogene.fr", from, to)).resolves.toEqual({
            events: [event],
            failed: [{ id: calendarId, label: "Emeria" }],
        });
        expect(http.get).toHaveBeenCalledWith(
            "http://admin-api:8080/api/calendar/events",
            expect.objectContaining({
                params: { userIdentifier: "a@infogene.fr", from: from.toISOString(), to: to.toISOString() },
            }),
        );
    });

    it("refuses an event whose join link is not a URL: the browser would open it", async () => {
        const { service } = createService({
            get: { status: 200, data: { events: [{ ...event, joinUrl: "javascript:alert(1)" }], failed: [] } },
        });
        expect(await errorCodeOf(service.events("a@infogene.fr", new Date(0), new Date(1)))).toBe("unavailable");
    });

    it("never lets the Admin API token reach an error", async () => {
        const http = {
            get: vi.fn().mockRejectedValue(
                new AxiosError("connect ECONNREFUSED", "ECONNREFUSED", {
                    headers: { Authorization: "secret-token" },
                } as never),
            ),
        };
        const service = new CalendarService(config, http as unknown as AxiosInstance);
        const error = await service.listSources("a@infogene.fr").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CalendarError);
        expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain("secret-token");
        expect(String((error as Error).cause)).not.toContain("secret-token");
    });

    it("limits a user to 60 queries a minute", () => {
        let now = 1_000_000;
        const { service } = createService({}, () => now);
        for (let index = 0; index < 60; index++) service.assertQueryWithinRate("a@infogene.fr");
        expect(() => service.assertQueryWithinRate("a@infogene.fr")).toThrow(CalendarError);
        service.assertQueryWithinRate("b@infogene.fr");
        now += 60_001;
        expect(() => service.assertQueryWithinRate("a@infogene.fr")).not.toThrow();
    });
});
