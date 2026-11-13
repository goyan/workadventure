import { describe, expect, it, vi } from "vitest";
import type { AreaData } from "@workadventure/map-editor";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import {
    goToMeeting,
    MeetingArrival,
    meetingKeyHere,
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
    function deps(
        areaId: string | null,
        rooms = [area("r1", 0), area("r2", 400)],
        cancelled = false,
        reachable: { x: number; y: number } | null = { x: 432, y: 144 },
    ) {
        const calls: string[] = [];
        return {
            calls,
            claim: vi.fn(() => {
                calls.push("claim");
                return Promise.resolve({ areaId });
            }),
            onRoom: vi.fn((id: string) => calls.push(`room:${id}`)),
            reachablePointIn: vi.fn((_room: AreaData) => reachable ?? undefined),
            standsIn: vi.fn((_room: AreaData) => false),
            walkTo: vi.fn((_point: { x: number; y: number }) => {
                calls.push("walk");
                return Promise.resolve({ cancelled });
            }),
            mapUrl: "/~/goyan/office.wam",
            areas: () => rooms,
        };
    }

    it("never opens Teams in the click: the new tab would hide the game and cancel the walk", async () => {
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        const d = deps("r2");
        await goToMeeting(daily, d);

        // The game tab keeps the focus during the walk: Teams is offered once the avatar is in the room.
        expect(open).not.toHaveBeenCalled();
        expect(d.calls).toEqual(["claim", "room:r2", "walk"]);
        open.mockRestore();
    });

    it("walks to the free point of the room the meeting got that a way leads to, once its arrival is watched", async () => {
        const d = deps("r2");
        await goToMeeting(daily, d);

        expect(d.claim).toHaveBeenCalledWith({
            mapUrl: "/~/goyan/office.wam",
            meetingKey: key,
            roomAreaIds: ["r1", "r2"],
        });
        expect(d.reachablePointIn).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }));
        expect(d.onRoom).toHaveBeenCalledWith("r2");
        expect(d.walkTo).toHaveBeenCalledWith({ x: 432, y: 144 });
    });

    it("walks towards the center when no free point of the room can be reached (a locked room is walked to)", async () => {
        const d = deps("r2", undefined, false, null);
        await goToMeeting(daily, d);

        expect(d.walkTo).toHaveBeenCalledWith({ x: 448, y: 132 });
    });

    it("stays put and says the room could not be booked when the claim fails", async () => {
        const d = deps("r2");
        d.claim.mockRejectedValueOnce(new Error("Mac companion request failed: 500"));
        const outcome = await goToMeeting(daily, d);

        expect(d.onRoom).not.toHaveBeenCalled();
        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "claim-failed", error: "Mac companion request failed: 500" });
    });

    it("does not walk when the avatar already stands in the room: its arrival is noticed at once", async () => {
        const d = deps("r2");
        d.standsIn.mockReturnValue(true);
        const outcome = await goToMeeting(daily, d);

        expect(d.standsIn).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }));
        expect(d.onRoom).toHaveBeenCalledWith("r2");
        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "walking", areaId: "r2", cancelled: false });
    });

    it("says no way leads to the room when no point of it can be looked for", async () => {
        const d = deps("r2");
        d.reachablePointIn.mockImplementationOnce(() => {
            throw new Error("No collision grid");
        });
        const outcome = await goToMeeting(daily, d);

        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "no-path", areaId: "r2", error: "No collision grid" });
    });

    it("says no way leads to the room when the walk cannot start", async () => {
        const d = deps("r2");
        d.walkTo.mockRejectedValueOnce(new Error("No path found"));
        const outcome = await goToMeeting(daily, d);

        expect(outcome).toEqual({ kind: "no-path", areaId: "r2", error: "No path found" });
    });

    it("stays put when every room is taken, and says so", async () => {
        const d = deps(null);
        const outcome = await goToMeeting(daily, d);

        expect(d.onRoom).not.toHaveBeenCalled();
        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "rooms-full" });
    });

    it("stays put on a map without any Teams room", async () => {
        const d = deps("r1", [area("hall", 0, false)]);
        const outcome = await goToMeeting(daily, d);

        expect(d.claim).not.toHaveBeenCalled();
        expect(d.walkTo).not.toHaveBeenCalled();
        expect(outcome).toEqual({ kind: "teams-only" });
    });

    it("reports the walk to the room it got, and whether it was cut short", async () => {
        expect(await goToMeeting(daily, deps("r2"))).toEqual({ kind: "walking", areaId: "r2", cancelled: false });
        expect(await goToMeeting(daily, deps("r2", undefined, true))).toEqual({
            kind: "walking",
            areaId: "r2",
            cancelled: true,
        });
    });
});

describe("MeetingArrival", () => {
    const rooms = [area("r1", 0), area("r2", 400)];
    const mapUrl = "/~/goyan/office.wam";
    const during = new Date("2026-11-17T09:20:00.000Z");
    const inR1 = { x: 48, y: 132 };
    const inR2 = { x: 448, y: 132 };
    const hall = { x: 250, y: 132 };

    it("gives the meeting once, when the player stands in the room it claimed", () => {
        const arrival = new MeetingArrival();
        arrival.expect(daily, "r2", mapUrl);

        expect(arrival.check(hall, rooms, mapUrl, during)).toBeUndefined();
        expect(arrival.check(inR2, rooms, mapUrl, during)?.id).toBe(daily.id);
        expect(arrival.check(inR2, rooms, mapUrl, during)).toBeUndefined();
    });

    it("does not mistake another room on the way for the one it claimed", () => {
        const arrival = new MeetingArrival();
        arrival.expect(daily, "r2", mapUrl);

        expect(arrival.check(inR1, rooms, mapUrl, during)).toBeUndefined();
        expect(arrival.pendingEventId()).toBe(daily.id);
    });

    it("gives the meeting when the walk ends in the room, even before the next periodic check", () => {
        const arrival = new MeetingArrival();
        const walk = arrival.expect(daily, "r2", mapUrl);

        expect(arrival.walkEnded(walk, inR2, rooms, mapUrl, during)?.id).toBe(daily.id);
        expect(arrival.pendingEventId()).toBeUndefined();
    });

    it("forgets the arrival when the walk is cut short or ends outside the room", () => {
        const cut = new MeetingArrival();
        const walk = cut.expect(daily, "r2", mapUrl);
        expect(cut.walkEnded(walk, hall, rooms, mapUrl, during)).toBeUndefined();
        expect(cut.check(inR2, rooms, mapUrl, during)).toBeUndefined();

        const beside = new MeetingArrival();
        const besideWalk = beside.expect(daily, "r2", mapUrl);
        expect(beside.walkEnded(besideWalk, hall, rooms, mapUrl, during)).toBeUndefined();
        expect(beside.pendingEventId()).toBeUndefined();
    });

    it("lets a later Go there replace the arrival watched, without the first walk forgetting it", () => {
        const arrival = new MeetingArrival();
        const first = arrival.expect(daily, "r1", mapUrl);
        arrival.expect(daily, "r2", mapUrl);

        // The first walk is cancelled by the second one: the second arrival is still awaited.
        expect(arrival.walkEnded(first, hall, rooms, mapUrl, during)).toBeUndefined();
        expect(arrival.check(inR1, rooms, mapUrl, during)).toBeUndefined();
        expect(arrival.check(inR2, rooms, mapUrl, during)?.id).toBe(daily.id);
    });

    it("forgets the arrival on another map, once the meeting is over, or when cancelled", () => {
        const otherMap = new MeetingArrival();
        otherMap.expect(daily, "r2", mapUrl);
        expect(otherMap.check(inR2, rooms, "/~/goyan/garden.wam", during)).toBeUndefined();
        expect(otherMap.pendingEventId()).toBeUndefined();

        const over = new MeetingArrival();
        over.expect(daily, "r2", mapUrl);
        expect(over.check(inR2, rooms, mapUrl, daily.end)).toBeUndefined();
        expect(over.pendingEventId()).toBeUndefined();

        const cancelled = new MeetingArrival();
        cancelled.expect(daily, "r2", mapUrl);
        cancelled.cancel();
        expect(cancelled.check(inR2, rooms, mapUrl, during)).toBeUndefined();
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

describe("meetingKeyHere", () => {
    const rooms = [area("r1", 0), area("r2", 400)];
    const mine = {
        areaId: "r2",
        title: "Daily standup",
        endsAt: "2026-11-17T10:00:00.000Z",
        mine: true,
        meetingKey: key,
    };

    it("gives the key of the user's meeting whose room the feet stand in", () => {
        expect(meetingKeyHere({ x: 448, y: 132 }, rooms, [mine])).toBe(key);
    });

    it("gives nothing out of the room, in another room, or in the room of someone else's meeting", () => {
        expect(meetingKeyHere({ x: 250, y: 132 }, rooms, [mine])).toBeUndefined();
        expect(meetingKeyHere({ x: 48, y: 132 }, rooms, [mine])).toBeUndefined();
        expect(
            meetingKeyHere({ x: 448, y: 132 }, rooms, [
                { areaId: "r2", title: "Other", endsAt: mine.endsAt, mine: false },
            ]),
        ).toBeUndefined();
    });
});
