import { get, writable } from "svelte/store";
import type { Writable } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { AvailabilityStatus } from "@workadventure/messages";
import { KnockStatusLink } from "../../../../../src/front/Phaser/Game/Knock/KnockStatusLink";
import type { LockableAreaEntry } from "../../../../../src/front/Stores/CurrentPlayerAreaLockStore";
import type { RequestedStatus } from "../../../../../src/front/Rules/StatusRules/statusRules";

const OWN = "own-area";
const OTHER = "other-area";

function entry(areaId: string, lockState: boolean): LockableAreaEntry {
    return { areaId, propertyId: `prop-${areaId}`, lockState, areaName: areaId };
}

describe("KnockStatusLink", () => {
    let lockableAreas: Writable<LockableAreaEntry[]>;
    let ownAreaId: Writable<string | undefined>;
    let requestedStatus: Writable<RequestedStatus | null>;
    let setStatus: Mock<(status: RequestedStatus | null) => void>;
    /** Stands for the localStorage key that survives a reload. */
    let stored: string | null;
    let link: KnockStatusLink;

    const ownership = {
        get: () => stored,
        set: (value: string | null) => {
            stored = value;
        },
    };

    function create(): KnockStatusLink {
        return new KnockStatusLink({ lockableAreas, ownAreaId, requestedStatus, setStatus, ownership });
    }

    beforeEach(() => {
        lockableAreas = writable([entry(OWN, false)]);
        ownAreaId = writable<string | undefined>(OWN);
        requestedStatus = writable<RequestedStatus | null>(null);
        setStatus = vi.fn<(status: RequestedStatus | null) => void>((status: RequestedStatus | null) =>
            requestedStatus.set(status),
        );
        stored = null;
        link = create();
    });

    it("sets DND when the own desk gets locked", () => {
        lockableAreas.set([entry(OWN, true)]);
        expect(setStatus).toHaveBeenCalledTimes(1);
        expect(setStatus).toHaveBeenCalledWith(AvailabilityStatus.DO_NOT_DISTURB);
    });

    it("restores the previous status when the own desk gets unlocked", () => {
        lockableAreas.set([entry(OWN, true)]);
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).toHaveBeenCalledTimes(2);
        expect(setStatus).toHaveBeenLastCalledWith(null);
    });

    it("restores a non-null previous status (BUSY)", () => {
        requestedStatus.set(AvailabilityStatus.BUSY);
        lockableAreas.set([entry(OWN, true)]);
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).toHaveBeenLastCalledWith(AvailabilityStatus.BUSY);
    });

    it("ignores another desk being locked", () => {
        lockableAreas.set([entry(OWN, false), entry(OTHER, true)]);
        expect(setStatus).not.toHaveBeenCalled();
    });

    it("does nothing when there is no own area", () => {
        ownAreaId.set(undefined);
        lockableAreas.set([entry(OWN, true)]);
        expect(setStatus).not.toHaveBeenCalled();
    });

    it("does nothing when DND was already set, and does not restore later", () => {
        requestedStatus.set(AvailabilityStatus.DO_NOT_DISTURB);
        lockableAreas.set([entry(OWN, true)]);
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).not.toHaveBeenCalled();
        expect(get(requestedStatus)).toBe(AvailabilityStatus.DO_NOT_DISTURB);
    });

    it("does not restore when the user picked another status by hand", () => {
        lockableAreas.set([entry(OWN, true)]);
        requestedStatus.set(AvailabilityStatus.BUSY);
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).toHaveBeenCalledTimes(1);
        expect(get(requestedStatus)).toBe(AvailabilityStatus.BUSY);
    });

    it("restores on visitor accepted, then not again on unlock", () => {
        lockableAreas.set([entry(OWN, true)]);
        link.onVisitorAccepted();
        expect(setStatus).toHaveBeenCalledTimes(2);
        expect(setStatus).toHaveBeenLastCalledWith(null);
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).toHaveBeenCalledTimes(2);
    });

    it("onVisitorAccepted does nothing if the link does not own DND", () => {
        link.onVisitorAccepted();
        expect(setStatus).not.toHaveBeenCalled();
    });

    it("restores when the locked own desk entry disappears (player leaves)", () => {
        lockableAreas.set([entry(OWN, true)]);
        lockableAreas.set([]);
        expect(setStatus).toHaveBeenCalledTimes(2);
        expect(setStatus).toHaveBeenLastCalledWith(null);
    });

    it("does not trigger for a desk already locked at construction", () => {
        link.destroy();
        setStatus.mockClear();
        lockableAreas.set([entry(OWN, true)]);
        link = create();
        expect(setStatus).not.toHaveBeenCalled();
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).not.toHaveBeenCalled();
    });

    it("destroy unsubscribes and leaves a status it does not own", () => {
        requestedStatus.set(AvailabilityStatus.BUSY);
        link.destroy();
        lockableAreas.set([entry(OWN, true)]);
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).not.toHaveBeenCalled();
        expect(get(requestedStatus)).toBe(AvailabilityStatus.BUSY);
    });

    it("destroy restores the previous status when it owns DND (scene restart)", () => {
        requestedStatus.set(AvailabilityStatus.BUSY);
        lockableAreas.set([entry(OWN, true)]);
        setStatus.mockClear();

        link.destroy();

        expect(setStatus).toHaveBeenCalledExactlyOnceWith(AvailabilityStatus.BUSY);
        expect(stored).toBeNull();
        lockableAreas.set([entry(OWN, false)]);
        expect(setStatus).toHaveBeenCalledTimes(1);
    });

    describe("after a reload (new link, the DND it set persisted)", () => {
        /**
         * The state a reloaded page starts from: the requested status and the ownership key survived, the old link
         * is gone. The link of beforeEach owns nothing, so destroying it changes nothing.
         */
        function reloadWith(state: { status: RequestedStatus | null; deskLocked: boolean; key: string | null }): void {
            link.destroy();
            requestedStatus.set(state.status);
            lockableAreas.set(state.deskLocked ? [entry(OWN, true)] : []);
            stored = state.key;
            setStatus.mockClear();
            link = create();
        }

        it("remembers the ownership when it sets DND, and forgets it on restore", () => {
            lockableAreas.set([entry(OWN, true)]);
            expect(JSON.parse(stored ?? "null")).toEqual({ previousStatus: null });
            lockableAreas.set([entry(OWN, false)]);
            expect(stored).toBeNull();
        });

        it("forgets the ownership when the user picks another status by hand", () => {
            lockableAreas.set([entry(OWN, true)]);
            requestedStatus.set(AvailabilityStatus.BUSY);
            expect(stored).toBeNull();
        });

        it("restores the previous status when the own desk is no longer locked", () => {
            reloadWith({
                status: AvailabilityStatus.DO_NOT_DISTURB,
                deskLocked: false,
                key: JSON.stringify({ previousStatus: AvailabilityStatus.BUSY }),
            });

            expect(setStatus).toHaveBeenCalledExactlyOnceWith(AvailabilityStatus.BUSY);
            expect(stored).toBeNull();
        });

        it("takes the ownership back when the own desk is still locked, and restores on unlock", () => {
            reloadWith({
                status: AvailabilityStatus.DO_NOT_DISTURB,
                deskLocked: true,
                key: JSON.stringify({ previousStatus: null }),
            });

            expect(setStatus).not.toHaveBeenCalled();
            expect(stored).not.toBeNull();
            lockableAreas.set([entry(OWN, false)]);
            expect(setStatus).toHaveBeenCalledExactlyOnceWith(null);
            expect(stored).toBeNull();
        });

        it("clears the ownership without restoring when the status is no longer DND", () => {
            reloadWith({
                status: AvailabilityStatus.BUSY,
                deskLocked: false,
                key: JSON.stringify({ previousStatus: null }),
            });

            expect(setStatus).not.toHaveBeenCalled();
            expect(stored).toBeNull();
            expect(get(requestedStatus)).toBe(AvailabilityStatus.BUSY);
        });

        it("ignores an unreadable key", () => {
            reloadWith({ status: AvailabilityStatus.DO_NOT_DISTURB, deskLocked: false, key: "{not json" });

            expect(setStatus).not.toHaveBeenCalled();
            expect(stored).toBeNull();
        });
    });
});
