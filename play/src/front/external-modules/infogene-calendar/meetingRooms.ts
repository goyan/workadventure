import type { AreaData } from "@workadventure/map-editor";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import type { MeetingRoom, MeetingRoomClaim, MeetingRoomClaimInput } from "../../../common/MacCompanion";
import { reminderLeadMs } from "../../Components/Calendar/CalendarReminder";

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
 * "Go there": opens the meeting's https link in a new tab at once (the browser only allows it within the click; the
 * Teams page hands it to the app), then asks for the meeting's room and walks to its center. Never a navigation of
 * the game window: an msteams: link opened there unloads the page and closes the game connection for good.
 * No room on the map, or all taken: Teams only.
 */
export function goToMeeting(event: CalendarEventInterface, deps: GoToMeetingDeps): Promise<void> {
    const joinUrl = event.resource?.onlineMeeting?.joinUrl;
    if (joinUrl) deps.openUrl(joinUrl);
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
        // Only on a Teams meeting room: a title never lands on another area of the map.
        const area = areas.find((candidate) => candidate.id === room.areaId && isTeamsMeetingRoom(candidate));
        return area ? [{ areaId: room.areaId, x: area.x + area.width / 2, y: area.y, text: room.title }] : [];
    });
}

/**
 * The meeting a player who walks into a Teams room may want to open: theirs only (the room's key, given by the server
 * to its guests), in progress or starting within its reminder lead, unless they already went there with "Go there".
 */
export function meetingToOpenOnEntry(
    events: Iterable<CalendarEventInterface>,
    now: Date,
    room: MeetingRoom | undefined,
    joined: ReadonlySet<string>,
): CalendarEventInterface | undefined {
    if (!room?.mine || !room.meetingKey) return undefined;
    const time = now.getTime();
    return [...events].find(
        (event) =>
            event.resource?.meetingKey === room.meetingKey &&
            !joined.has(event.id) &&
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
