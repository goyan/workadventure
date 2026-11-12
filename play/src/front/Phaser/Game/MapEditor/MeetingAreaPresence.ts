import { AbortError } from "@workadventure/shared-utils/src/Abort/AbortError";

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
 * The meeting areas the local player is in. A meeting only starts once someone else is in the area too: alone,
 * the player keeps their usual status and nothing of the meeting (space, chat, media) is opened. Once started, it
 * only stops when the local player leaves the area: whether the others are still there cannot be told reliably,
 * since the front only knows the players around the camera, and a meeting cut by a camera move is worse than one
 * kept open for a player left alone in the room.
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

    /** Starts the meeting of each area someone else is in now. A started meeting is left running (see the class). */
    public refresh(): void {
        for (const area of this.areas.values()) {
            if (!area.meeting && this.hasSomeoneElseInArea(area.areaId, area.payload)) {
                this.start(area);
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
        meeting.abortController.abort(new AbortError("The player left the meeting area"));
        area.transition = area.transition
            .then(() => (meeting.hasStarted ? this.stopMeeting(area.payload) : undefined))
            .catch(this.onError);
    }
}
