import { describe, expect, it, vi } from "vitest";
import type { AreaData } from "@workadventure/map-editor";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import {
    goToMeeting,
    meetingRoomLabels,
    meetingToOpenOnEntry,
    roomsOfMap,
    teamsAppUrl,
} from "../../../src/front/external-modules/infogene-calendar/meetingRooms";

const key = "a".repeat(64);
const joinUrl = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d";

function area(id: string, x: number, teams = true): AreaData {
    return {
        id,
        name: id,
        x,
        y: 100,
        width: 96,
        height: 64,
        visible: true,
        properties: teams ? [{ id: `${id}-p`, type: "teamsMeetingRoomPropertyData" }] : [],
    };
}

const daily: CalendarEventInterface = {
    id: "mac:daily:2026-11-17T09:15:00.000Z",
    title: "Daily Produit - Team Indigo",
    description: "",
    start: new Date("2026-11-17T09:15:00.000Z"),
    end: new Date("2026-11-17T09:45:00.000Z"),
    resource: { onlineMeeting: { joinUrl }, meetingKey: key },
};

describe("teamsAppUrl", () => {
    it("opens the Teams app on the same meeting", () => {
        expect(teamsAppUrl(joinUrl)).toBe("msteams:/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d");
        expect(teamsAppUrl("https://teams.microsoft.com/meet/123?p=x")).toBe("msteams:/meet/123?p=x");
    });
});

describe("roomsOfMap", () => {
    it("keeps the Teams meeting rooms, in the order of the map", () => {
        expect(roomsOfMap([area("r1", 0), area("hall", 200, false), area("r2", 400)])).toEqual(["r1", "r2"]);
    });
});

describe("goToMeeting", () => {
    function deps(areaId: string | null, rooms = [area("r1", 0), area("r2", 400)]) {
        const calls: string[] = [];
        return {
            calls,
            openUrl: vi.fn(() => calls.push("open")),
            claim: vi.fn(() => {
                calls.push("claim");
                return Promise.resolve({ areaId });
            }),
            walkTo: vi.fn(() => Promise.resolve()),
            mapUrl: "/~/goyan/office.wam",
            areas: () => rooms,
        };
    }

    it("opens Teams before anything else, inside the click", async () => {
        const d = deps("r2");
        const going = goToMeeting(daily, d);

        // Synchronously, in the click: the browser blocks a later opening.
        expect(d.calls[0]).toBe("open");
        expect(d.openUrl).toHaveBeenCalledWith(teamsAppUrl(joinUrl));
        await going;
        expect(d.calls).toEqual(["open", "claim"]);
    });

    it("walks to the center of the room the meeting got", async () => {
        const d = deps("r2");
        await goToMeeting(daily, d);

        expect(d.claim).toHaveBeenCalledWith({
            mapUrl: "/~/goyan/office.wam",
            meetingKey: key,
            roomAreaIds: ["r1", "r2"],
        });
        expect(d.walkTo).toHaveBeenCalledWith({ x: 448, y: 132 });
    });

    it("only opens Teams when every room is taken", async () => {
        const d = deps(null);
        await goToMeeting(daily, d);

        expect(d.walkTo).not.toHaveBeenCalled();
    });

    it("only opens Teams on a map without any Teams room", async () => {
        const d = deps("r1", [area("hall", 0, false)]);
        await goToMeeting(daily, d);

        expect(d.openUrl).toHaveBeenCalled();
        expect(d.claim).not.toHaveBeenCalled();
        expect(d.walkTo).not.toHaveBeenCalled();
    });
});

describe("meetingRoomLabels", () => {
    it("puts the title of each taken room above it, private meetings included as the server names them", () => {
        const labels = meetingRoomLabels(
            [
                { areaId: "r1", title: "Daily", endsAt: "2026-11-17T10:00:00.000Z" },
                { areaId: "r2", title: "Réunion privée", endsAt: "2026-11-17T10:00:00.000Z" },
                { areaId: "gone", title: "Ancienne", endsAt: "2026-11-17T10:00:00.000Z" },
            ],
            [area("r1", 0), area("r2", 400)],
        );

        expect(labels).toEqual([
            { areaId: "r1", x: 48, y: 100, text: "Daily" },
            { areaId: "r2", x: 448, y: 100, text: "Réunion privée" },
        ]);
    });
});

describe("meetingToOpenOnEntry", () => {
    it("offers the meeting in progress, or starting within its reminder lead", () => {
        expect(meetingToOpenOnEntry([daily], new Date("2026-11-17T09:20:00.000Z"))?.id).toBe(daily.id);
        expect(meetingToOpenOnEntry([daily], new Date("2026-11-17T09:12:00.000Z"))?.id).toBe(daily.id);
        expect(meetingToOpenOnEntry([daily], new Date("2026-11-17T09:00:00.000Z"))).toBeUndefined();
        expect(meetingToOpenOnEntry([daily], new Date("2026-11-17T09:45:00.000Z"))).toBeUndefined();
    });

    it("ignores a meeting without a Teams room key", () => {
        const withoutKey = { ...daily, resource: { onlineMeeting: { joinUrl } } };
        expect(meetingToOpenOnEntry([withoutKey], new Date("2026-11-17T09:20:00.000Z"))).toBeUndefined();
    });
});
