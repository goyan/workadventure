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

/**
 * What "Go there" did: walked (or tried to) to the room the meeting got, or stayed put as no room could be given, in
 * which case Teams is offered at once.
 */
export type GoToMeetingOutcome =
    | { kind: "walking"; areaId: string; cancelled: boolean }
    | { kind: "teams-only" }
    | { kind: "rooms-full" };

export interface GoToMeetingDeps {
    claim: (input: MeetingRoomClaimInput) => Promise<MeetingRoomClaim>;
    /** Called with the room the meeting got, right before walking there: its arrival is watched from then on. */
    onRoom: (areaId: string) => void;
    walkTo: (point: { x: number; y: number }) => Promise<{ cancelled: boolean }>;
    mapUrl: string;
    areas: () => readonly AreaData[];
}

/**
 * "Go there": asks for the meeting's room and walks to its center. Teams is not opened here: a new tab in the click
 * would put the game in the background, which stops the avatar's walk (see Player), so it is offered on arrival.
 * A room is given at any time before the end, as Teams lets one join early. No room on the map, or all taken: the
 * avatar stays, and the outcome says which.
 */
export async function goToMeeting(event: CalendarEventInterface, deps: GoToMeetingDeps): Promise<GoToMeetingOutcome> {
    const meetingKey = event.resource?.meetingKey;
    const areas = deps.areas();
    const roomAreaIds = roomsOfMap(areas);
    if (!meetingKey || roomAreaIds.length === 0) return { kind: "teams-only" };
    const claim = await deps.claim({ mapUrl: deps.mapUrl, meetingKey, roomAreaIds });
    const room = areas.find((area) => area.id === claim.areaId);
    if (!room) return { kind: "rooms-full" };
    deps.onRoom(room.id);
    const walk = await deps.walkTo({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
    return { kind: "walking", areaId: room.id, cancelled: walk.cancelled };
}

/**
 * The arrival in the room "Go there" claimed, so that Teams is offered there once. Read from where the avatar really
 * stands: a walk can end beside the room (its center taken) or never end. Forgotten when the walk is cut short or ends
 * outside the room, on another map, at the end of the meeting, or when another "Go there" replaces it.
 */
export class MeetingArrival {
    private pending: { event: CalendarEventInterface; areaId: string; mapUrl: string; walk: number } | undefined;
    private lastWalk = 0;

    /** Starts watching the arrival in a room; returns the walk's number, given back to walkEnded. */
    public expect(event: CalendarEventInterface, areaId: string, mapUrl: string): number {
        this.lastWalk += 1;
        this.pending = { event, areaId, mapUrl, walk: this.lastWalk };
        return this.lastWalk;
    }

    /** The meeting whose arrival is awaited: its room must not remind the player of it on the way in. */
    public pendingEventId(): string | undefined {
        return this.pending?.event.id;
    }

    /** The meeting, once, when the player (their feet) stands in the room it claimed. */
    public check(
        point: { x: number; y: number },
        areas: readonly AreaData[],
        mapUrl: string,
        now: Date,
    ): CalendarEventInterface | undefined {
        const pending = this.pending;
        if (!pending) return undefined;
        if (mapUrl !== pending.mapUrl || now.getTime() >= pending.event.end.getTime()) {
            this.pending = undefined;
            return undefined;
        }
        if (roomAt(point, areas)?.id !== pending.areaId) return undefined;
        this.pending = undefined;
        return pending.event;
    }

    /**
     * The walk ended, reached or cut short: the meeting if the player stands in its room, else the arrival is
     * forgotten (no question about Teams out of the room; walking in later reminds as any entry does).
     */
    public walkEnded(
        walk: number,
        point: { x: number; y: number },
        areas: readonly AreaData[],
        mapUrl: string,
        now: Date,
    ): CalendarEventInterface | undefined {
        // A walk replaced by a later "Go there" says nothing about the arrival now awaited.
        if (this.pending?.walk !== walk) return undefined;
        const arrived = this.check(point, areas, mapUrl, now);
        this.pending = undefined;
        return arrived;
    }

    public cancel(): void {
        this.pending = undefined;
    }
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
