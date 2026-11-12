import { describe, expect, it, vi } from "vitest";
import type { AreaData } from "@workadventure/map-editor";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import {
    goToMeeting,
    meetingRoomLabels,
    meetingToOpenOnEntry,
    roomsOfMap,
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
    title: "Daily standup",
    description: "",
    start: new Date("2026-11-17T09:15:00.000Z"),
    end: new Date("2026-11-17T09:45:00.000Z"),
    resource: { onlineMeeting: { joinUrl }, meetingKey: key },
};

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

        // Synchronously, in the click: the browser blocks a later opening. The https link opens in a new tab (Teams
        // launcher): navigating the game window to msteams: would unload the page and close the game connection.
        expect(d.calls[0]).toBe("open");
        expect(d.openUrl).toHaveBeenCalledWith(joinUrl);
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

    it("only opens Teams when every room is taken, and says so", async () => {
        const d = deps(null);
        const outcome = await goToMeeting(daily, d);

        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "rooms-full" });
    });

    it("only opens Teams on a map without any Teams room", async () => {
        const d = deps("r1", [area("hall", 0, false)]);
        const outcome = await goToMeeting(daily, d);

        expect(d.openUrl).toHaveBeenCalled();
        expect(d.claim).not.toHaveBeenCalled();
        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "teams-only" });
    });

    it("reports the walk to the room it got", async () => {
        const outcome = await goToMeeting(daily, deps("r2"));

        expect(outcome).toEqual({ kind: "walking" });
    });
});

describe("meetingRoomLabels", () => {
    it("puts the title of each taken room above it, private meetings included as the server names them", () => {
        const labels = meetingRoomLabels(
            [
                { areaId: "r1", title: "Daily", endsAt: "2026-11-17T10:00:00.000Z", mine: false },
                { areaId: "r2", title: "Réunion privée", endsAt: "2026-11-17T10:00:00.000Z", mine: false },
                { areaId: "gone", title: "Ancienne", endsAt: "2026-11-17T10:00:00.000Z", mine: false },
            ],
            [area("r1", 0), area("r2", 400)],
        );

        expect(labels).toEqual([
            { areaId: "r1", x: 48, y: 100, text: "Daily" },
            { areaId: "r2", x: 448, y: 100, text: "Réunion privée" },
        ]);
    });

    it("never writes on an area that is not a Teams meeting room", () => {
        const labels = meetingRoomLabels(
            [{ areaId: "hall", title: "Fabriquée", endsAt: "2026-11-17T10:00:00.000Z", mine: false }],
            [area("hall", 0, false)],
        );

        expect(labels).toEqual([]);
    });
});

describe("meetingToOpenOnEntry", () => {
    const mine = {
        areaId: "r1",
        title: "Daily standup",
        endsAt: "2026-11-17T10:00:00.000Z",
        mine: true,
        meetingKey: key,
    };
    const during = new Date("2026-11-17T09:20:00.000Z");

    it("offers the player's own meeting when they walk into its room", () => {
        expect(meetingToOpenOnEntry([daily], during, mine, new Set())?.id).toBe(daily.id);
        expect(meetingToOpenOnEntry([daily], new Date("2026-11-17T09:12:00.000Z"), mine, new Set())?.id).toBe(daily.id);
    });

    it("offers nothing in a room taken by another meeting, or free", () => {
        const other = { ...mine, mine: false, meetingKey: undefined };
        expect(meetingToOpenOnEntry([daily], during, other, new Set())).toBeUndefined();
        expect(meetingToOpenOnEntry([daily], during, undefined, new Set())).toBeUndefined();
    });

    it("does not offer again a meeting the player already went to with Go there", () => {
        expect(meetingToOpenOnEntry([daily], during, mine, new Set([daily.id]))).toBeUndefined();
    });

    it("offers nothing once the meeting is over", () => {
        expect(meetingToOpenOnEntry([daily], new Date("2026-11-17T09:45:00.000Z"), mine, new Set())).toBeUndefined();
    });
});
