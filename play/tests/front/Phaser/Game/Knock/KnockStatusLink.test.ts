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
    let link: KnockStatusLink;

    function create(): KnockStatusLink {
        return new KnockStatusLink({ lockableAreas, ownAreaId, requestedStatus, setStatus });
    }

    beforeEach(() => {
        lockableAreas = writable([entry(OWN, false)]);
        ownAreaId = writable<string | undefined>(OWN);
        requestedStatus = writable<RequestedStatus | null>(null);
        setStatus = vi.fn<(status: RequestedStatus | null) => void>((status: RequestedStatus | null) =>
            requestedStatus.set(status),
        );
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

    it("destroy unsubscribes and never changes the status", () => {
        lockableAreas.set([entry(OWN, true)]);
        setStatus.mockClear();
        link.destroy();
        lockableAreas.set([entry(OWN, false)]);
        lockableAreas.set([entry(OWN, true)]);
        expect(setStatus).not.toHaveBeenCalled();
    });
});
