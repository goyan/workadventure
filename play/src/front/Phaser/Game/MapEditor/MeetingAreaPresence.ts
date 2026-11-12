import { AbortError } from "@workadventure/shared-utils/src/Abort/AbortError";

/**
 * The remote players still in a meeting area, from their positions, never from the camera: a known player counts
 * when inside the area and not when outside; a player seen inside who is no longer known (the camera moved away,
 * the pusher stopped sending them) still counts while a member of the meeting's space, which they leave as they
 * leave the area.
 */
export function playersStillInMeetingArea(
    knownPlayers: Iterable<{ userUuid: string; inside: boolean }>,
    seenInside: ReadonlySet<string>,
    isMeetingMember: (userUuid: string) => boolean,
): Set<string> {
    const known = new Set<string>();
    const stillThere = new Set<string>();
    for (const { userUuid, inside } of knownPlayers) {
        known.add(userUuid);
        if (inside) stillThere.add(userUuid);
    }
    for (const userUuid of seenInside) {
        if (!known.has(userUuid) && isMeetingMember(userUuid)) stillThere.add(userUuid);
    }
    return stillThere;
}

interface Meeting {
    abortController: AbortController;
    /** Whether the start actually ran: a meeting aborted before its turn has nothing to stop. */
    hasStarted: boolean;
}

interface MeetingArea<T> {
    areaId: string;
    payload: T;
    meeting: Meeting | undefined;
    /** Every start and stop of this meeting, chained so that a stop never overtakes the start it undoes. */
    transition: Promise<void>;
}

/**
 * The meeting areas the local player is in. A meeting only starts once someone else is in the area too,
 * and stops as soon as the player is alone in it again: alone, the player keeps their usual status and
 * nothing of the meeting (space, chat, media) is opened.
 */
export class MeetingAreaPresence<T> {
    private readonly areas = new Map<string, MeetingArea<T>>();

    constructor(
        private readonly hasSomeoneElseInArea: (areaId: string, payload: T) => boolean,
        private readonly startMeeting: (payload: T, signal: AbortSignal) => Promise<void>,
        private readonly stopMeeting: (payload: T) => Promise<void>,
        private readonly onError: (error: unknown) => void,
    ) {}

    public get size(): number {
        return this.areas.size;
    }

    public enter(key: string, areaId: string, payload: T): void {
        this.leave(key);
        this.areas.set(key, { areaId, payload, meeting: undefined, transition: Promise.resolve() });
        this.refresh();
    }

    public leave(key: string): void {
        const area = this.areas.get(key);
        if (!area) {
            return;
        }
        this.areas.delete(key);
        this.stop(area);
    }

    /** Starts or stops each meeting according to who is in its area now. */
    public refresh(): void {
        for (const area of this.areas.values()) {
            const hasSomeoneElse = this.hasSomeoneElseInArea(area.areaId, area.payload);
            if (hasSomeoneElse && !area.meeting) {
                this.start(area);
            } else if (!hasSomeoneElse && area.meeting) {
                this.stop(area);
            }
        }
    }

    /** Forgets every area without stopping its meeting: the scene that owns it is being torn down. */
    public destroy(): void {
        for (const area of this.areas.values()) {
            area.meeting?.abortController.abort(new AbortError("The meeting areas are destroyed"));
        }
        this.areas.clear();
    }

    private start(area: MeetingArea<T>): void {
        const meeting: Meeting = { abortController: new AbortController(), hasStarted: false };
        area.meeting = meeting;
        area.transition = area.transition
            .then(() => {
                if (meeting.abortController.signal.aborted) {
                    return;
                }
                meeting.hasStarted = true;
                return this.startMeeting(area.payload, meeting.abortController.signal);
            })
            .catch((error: unknown) => {
                if (!(error instanceof AbortError)) {
                    this.onError(error);
                }
            });
    }

    private stop(area: MeetingArea<T>): void {
        const meeting = area.meeting;
        if (!meeting) {
            return;
        }
        area.meeting = undefined;
        meeting.abortController.abort(new AbortError("Nobody else is in the meeting area"));
        area.transition = area.transition
            .then(() => (meeting.hasStarted ? this.stopMeeting(area.payload) : undefined))
            .catch(this.onError);
    }
}
