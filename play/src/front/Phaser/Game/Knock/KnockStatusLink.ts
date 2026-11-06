import type { Readable, Unsubscriber } from "svelte/store";
import { derived } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import type { LockableAreaEntry } from "../../../Stores/CurrentPlayerAreaLockStore";
import type { RequestedStatus } from "../../../Rules/StatusRules/statusRules";

/**
 * Links the lock of the player's own personal desk with the "Do not disturb" status.
 *
 * Locking the desk switches the player to DND (remembering the previous status); unlocking it,
 * leaving the desk while locked, letting a visitor in, or destroying the link (scene restart)
 * restores that status. The link only "owns" the DND it set itself: if the player changes status
 * by hand in the meantime, or was already in DND when locking, the link never touches the status
 * afterwards.
 *
 * The requested status survives a reload, so the ownership does too (`ownership`, a localStorage
 * key in the game): a new link takes it back if the own desk is still locked, and restores the
 * previous status otherwise.
 */
export class KnockStatusLink {
    private readonly unsubscribers: Unsubscriber[] = [];
    /** Last requested status seen. */
    private currentStatus: RequestedStatus | null = null;
    /** True while the DND currently active was set by this link. */
    private ownsDnd = false;
    /** Status to restore, meaningful only while `ownsDnd` is true. */
    private previousStatus: RequestedStatus | null = null;
    /** Lock state of the own desk: undefined when the player is not inside it. */
    private ownLockState: boolean | undefined = undefined;

    constructor(
        private readonly deps: {
            lockableAreas: Readable<LockableAreaEntry[]>;
            ownAreaId: Readable<string | undefined>;
            requestedStatus: Readable<RequestedStatus | null>;
            setStatus: (status: RequestedStatus | null) => void;
            /** Persisted ownership of the DND, `{ previousStatus }` as JSON; null when the link owns nothing. */
            ownership: { get(): string | null; set(value: string | null): void };
        },
    ) {
        // The status is subscribed first so that `currentStatus` is known when the lock state is first read.
        this.unsubscribers.push(
            deps.requestedStatus.subscribe((status) => {
                this.currentStatus = status;
                // Someone else changed the status: DND is no longer ours.
                if (this.ownsDnd && status !== AvailabilityStatus.DO_NOT_DISTURB) {
                    this.ownsDnd = false;
                    this.deps.ownership.set(null);
                }
            }),
        );

        const ownLockState = derived([deps.lockableAreas, deps.ownAreaId], ([areas, ownAreaId]): boolean | undefined =>
            ownAreaId === undefined ? undefined : areas.find((area) => area.areaId === ownAreaId)?.lockState,
        );

        // The first (synchronous) emission only records the initial state: it is not a transition.
        let initialized = false;
        this.unsubscribers.push(
            ownLockState.subscribe((lockState) => {
                const wasLocked = this.ownLockState === true;
                this.ownLockState = lockState;
                if (!initialized) {
                    initialized = true;
                    this.resumeOwnership(lockState === true);
                    return;
                }
                const isLocked = lockState === true;
                if (!wasLocked && isLocked) {
                    this.onOwnDeskLocked();
                } else if (wasLocked && !isLocked) {
                    this.restore();
                }
            }),
        );
    }

    /** The local player let a visitor in: leave the DND the link set, so that a bubble can form. */
    onVisitorAccepted(): void {
        this.restore();
    }

    /** A link that owns DND restores the previous status: the next scene starts from a clean state. */
    destroy(): void {
        this.restore();
        for (const unsubscribe of this.unsubscribers.splice(0)) {
            unsubscribe();
        }
    }

    private onOwnDeskLocked(): void {
        if (this.currentStatus === AvailabilityStatus.DO_NOT_DISTURB) {
            // Already in DND by the player's own choice: nothing to set, nothing to restore later.
            return;
        }
        this.previousStatus = this.currentStatus;
        this.ownsDnd = true;
        this.deps.ownership.set(JSON.stringify({ previousStatus: this.previousStatus }));
        this.deps.setStatus(AvailabilityStatus.DO_NOT_DISTURB);
    }

    private restore(): void {
        if (!this.ownsDnd) {
            return;
        }
        this.ownsDnd = false;
        this.deps.ownership.set(null);
        this.deps.setStatus(this.previousStatus);
    }

    /** At construction: the DND a previous link (before a reload) set may still be ours. */
    private resumeOwnership(ownDeskLocked: boolean): void {
        const stored = readOwnership(this.deps.ownership.get());
        if (stored === undefined) {
            this.deps.ownership.set(null);
            return;
        }
        if (this.currentStatus !== AvailabilityStatus.DO_NOT_DISTURB) {
            // The player changed status since: nothing left to restore.
            this.deps.ownership.set(null);
            return;
        }
        this.previousStatus = stored.previousStatus;
        this.ownsDnd = true;
        if (!ownDeskLocked) {
            this.restore();
        }
    }
}

/** undefined when there is no stored ownership or when it cannot be read. */
function readOwnership(value: string | null): { previousStatus: RequestedStatus | null } | undefined {
    if (value === null) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || !("previousStatus" in parsed)) {
            return undefined;
        }
        const previousStatus = parsed.previousStatus;
        if (
            previousStatus === null ||
            previousStatus === AvailabilityStatus.BUSY ||
            previousStatus === AvailabilityStatus.BACK_IN_A_MOMENT ||
            previousStatus === AvailabilityStatus.DO_NOT_DISTURB
        ) {
            return { previousStatus };
        }
        return undefined;
    } catch {
        return undefined;
    }
}
