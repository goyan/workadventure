import type { AreaData } from "@workadventure/map-editor";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import type { MeetingRoom, MeetingRoomClaim, MeetingRoomClaimInput } from "../../../common/MacCompanion";
import { reminderLeadMs } from "../../Components/Calendar/CalendarReminder";

/** The Teams app link of a meeting: same path and query as its https link, so the app opens the same meeting. */
export function teamsAppUrl(joinUrl: string): string {
    const url = new URL(joinUrl);
    return `msteams:${url.pathname}${url.search}`;
}

function isTeamsMeetingRoom(area: AreaData): boolean {
    return area.properties.some((property) => property.type === "teamsMeetingRoomPropertyData");
}

/** The Teams meeting rooms of the map, in its order: the first free one goes to the next meeting. */
export function roomsOfMap(areas: readonly AreaData[]): string[] {
    return areas.filter(isTeamsMeetingRoom).map((area) => area.id);
}

export interface GoToMeetingDeps {
    openUrl: (url: string) => void;
    claim: (input: MeetingRoomClaimInput) => Promise<MeetingRoomClaim>;
    walkTo: (point: { x: number; y: number }) => Promise<void>;
    mapUrl: string;
    areas: () => readonly AreaData[];
}

/**
 * "Go there": opens the meeting in the Teams app at once (the browser only allows it within the click), then asks
 * for the meeting's room and walks to its center. No room on the map, or all taken: Teams only.
 */
export function goToMeeting(event: CalendarEventInterface, deps: GoToMeetingDeps): Promise<void> {
    const joinUrl = event.resource?.onlineMeeting?.joinUrl;
    if (joinUrl) deps.openUrl(teamsAppUrl(joinUrl));
    const meetingKey = event.resource?.meetingKey;
    const areas = deps.areas();
    const roomAreaIds = roomsOfMap(areas);
    if (!meetingKey || roomAreaIds.length === 0) return Promise.resolve();
    return deps.claim({ mapUrl: deps.mapUrl, meetingKey, roomAreaIds }).then(({ areaId }) => {
        const room = areas.find((area) => area.id === areaId);
        if (!room) return;
        return deps.walkTo({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
    });
}

/** The title of each taken room, written above the middle of its top edge. Rooms gone from the map are skipped. */
export function meetingRoomLabels(
    rooms: readonly MeetingRoom[],
    areas: readonly AreaData[],
): { areaId: string; x: number; y: number; text: string }[] {
    return rooms.flatMap((room) => {
        const area = areas.find((candidate) => candidate.id === room.areaId);
        return area ? [{ areaId: room.areaId, x: area.x + area.width / 2, y: area.y, text: room.title }] : [];
    });
}

/**
 * The meeting a player who walks into a Teams room may want to open: one with a room key, in progress or starting
 * within its reminder lead.
 */
export function meetingToOpenOnEntry(
    events: Iterable<CalendarEventInterface>,
    now: Date,
): CalendarEventInterface | undefined {
    const time = now.getTime();
    return [...events].find(
        (event) =>
            event.resource?.meetingKey !== undefined &&
            event.start.getTime() - reminderLeadMs(event) <= time &&
            time < event.end.getTime(),
    );
}

/** Whether a point (the feet of the player) is inside one of the given rooms. */
export function roomAt(point: { x: number; y: number }, areas: readonly AreaData[]): AreaData | undefined {
    return areas.find(
        (area) =>
            isTeamsMeetingRoom(area) &&
            point.x >= area.x &&
            point.x < area.x + area.width &&
            point.y >= area.y &&
            point.y < area.y + area.height,
    );
}
