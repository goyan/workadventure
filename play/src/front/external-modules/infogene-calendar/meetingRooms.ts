import type { AreaData } from "@workadventure/map-editor";
import { asError } from "catch-unknown";
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
 * What "Go there" did: walked (or tried to) to the room the meeting got, or stayed put, in which case Teams is offered
 * at once: no room on the map (`teams-only`), every room taken (`rooms-full`), the room could not be asked for
 * (`claim-failed`: the server refused or did not answer), or no way leads to the room the meeting got (`no-path`).
 */
export type GoToMeetingOutcome =
    | { kind: "walking"; areaId: string; cancelled: boolean }
    | { kind: "teams-only" }
    | { kind: "rooms-full" }
    | { kind: "claim-failed"; error: string }
    | { kind: "no-path"; areaId: string; error: string };

export interface GoToMeetingDeps {
    claim: (input: MeetingRoomClaimInput) => Promise<MeetingRoomClaim>;
    /** Called with the room the meeting got, right before walking there: its arrival is watched from then on. */
    onRoom: (areaId: string) => void;
    /** The free point of the room nearest its center that a way leads to, if any (see PathfindingManager). */
    reachablePointIn: (room: AreaData) => { x: number; y: number } | undefined;
    /** Whether the player (their feet) already stands in the room. */
    standsIn: (room: AreaData) => boolean;
    walkTo: (point: { x: number; y: number }) => Promise<{ cancelled: boolean }>;
    mapUrl: string;
    areas: () => readonly AreaData[];
}

/**
 * "Go there": asks for the meeting's room and walks into it, to its free point nearest the center (a table often
 * covers the center itself). Teams is not opened here: a new tab in the click would put the game in the background,
 * which stops the avatar's walk (see Player), so it is offered on arrival. A room is given at any time before the end,
 * as Teams lets one join early. When the avatar cannot go, the outcome says why; this function never rejects.
 */
export async function goToMeeting(event: CalendarEventInterface, deps: GoToMeetingDeps): Promise<GoToMeetingOutcome> {
    const meetingKey = event.resource?.meetingKey;
    const areas = deps.areas();
    const roomAreaIds = roomsOfMap(areas);
    if (!meetingKey || roomAreaIds.length === 0) return { kind: "teams-only" };
    let claim: MeetingRoomClaim;
    try {
        claim = await deps.claim({ mapUrl: deps.mapUrl, meetingKey, roomAreaIds });
    } catch (e) {
        return { kind: "claim-failed", error: asError(e).message };
    }
    const room = areas.find((area) => area.id === claim.areaId);
    if (!room) return { kind: "rooms-full" };
    // Already there (a second "Go there"): no walk, which would find no path to its own tile; the arrival is seen.
    if (deps.standsIn(room)) {
        deps.onRoom(room.id);
        return { kind: "walking", areaId: room.id, cancelled: false };
    }
    try {
        // No free point reached: the center, as a locked room is walked to and the avatar stops at its door.
        const point = deps.reachablePointIn(room) ?? { x: room.x + room.width / 2, y: room.y + room.height / 2 };
        deps.onRoom(room.id);
        const walk = await deps.walkTo(point);
        return { kind: "walking", areaId: room.id, cancelled: walk.cancelled };
    } catch (e) {
        return { kind: "no-path", areaId: room.id, error: asError(e).message };
    }
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

/** The key of the user's own meeting whose taken room the point (the feet of the player) is in, if any. */
export function meetingKeyHere(
    point: { x: number; y: number },
    areas: readonly AreaData[],
    rooms: readonly MeetingRoom[],
): string | undefined {
    const here = roomAt(point, areas);
    const room = here && rooms.find((candidate) => candidate.areaId === here.id);
    return room?.mine ? room.meetingKey : undefined;
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
