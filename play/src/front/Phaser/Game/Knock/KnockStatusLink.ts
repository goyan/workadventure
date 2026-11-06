import type { Readable, Unsubscriber } from "svelte/store";
import { derived } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import type { LockableAreaEntry } from "../../../Stores/CurrentPlayerAreaLockStore";
import type { RequestedStatus } from "../../../Rules/StatusRules/statusRules";

/**
 * Links the lock of the player's own personal desk with the "Do not disturb" status.
 *
 * Locking the desk switches the player to DND (remembering the previous status); unlocking it,
 * leaving the desk while locked, or letting a visitor in restores that status. The link only
 * "owns" the DND it set itself: if the player changes status by hand in the meantime, or was
 * already in DND when locking, the link never touches the status afterwards.
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
        },
    ) {
        // The status is subscribed first so that `currentStatus` is known when the lock state is first read.
        this.unsubscribers.push(
            deps.requestedStatus.subscribe((status) => {
                this.currentStatus = status;
                // Someone else changed the status: DND is no longer ours.
                if (this.ownsDnd && status !== AvailabilityStatus.DO_NOT_DISTURB) {
                    this.ownsDnd = false;
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

    destroy(): void {
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
        this.deps.setStatus(AvailabilityStatus.DO_NOT_DISTURB);
    }

    private restore(): void {
        if (!this.ownsDnd) {
            return;
        }
        this.ownsDnd = false;
        this.deps.setStatus(this.previousStatus);
    }
}
