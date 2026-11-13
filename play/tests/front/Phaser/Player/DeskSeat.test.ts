import { describe, expect, it, vi } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import type { Seat } from "@wa/front/Phaser/Player/Seat";
import { findDeskSeat, walkToDesk } from "@wa/front/Phaser/Player/DeskSeat";

// A 6×4-tile desk: center (96, 64).
const desk = { x: 0, y: 0, width: 192, height: 128 };

function seat(id: string, x: number, y: number): Seat {
    return {
        id,
        entityId: `entity-${id}`,
        trigger: "auto",
        direction: PositionMessage_Direction.DOWN,
        depth: 0,
        feet: { x, y },
    };
}

const near = seat("near", 100, 70);
const far = seat("far", 20, 20);
const outside = seat("outside", 300, 64);

function deps(overrides: Partial<Parameters<typeof walkToDesk>[1]> = {}): Parameters<typeof walkToDesk>[1] {
    return {
        seats: [far, near, outside],
        isFree: () => true,
        seatedSeatId: undefined,
        inside: false,
        moveTo: vi.fn().mockResolvedValue({ cancelled: false }),
        sitOnSeat: vi.fn().mockReturnValue(true),
        ...overrides,
    };
}

describe("findDeskSeat", () => {
    it("picks the free seat of the desk nearest to its center", () => {
        expect(findDeskSeat([far, near, outside], desk, () => true)?.id).toBe("near");
    });

    it("takes the next free seat of the desk when the nearest one is taken", () => {
        expect(findDeskSeat([far, near, outside], desk, (candidate) => candidate.id !== "near")?.id).toBe("far");
    });

    it("ignores the seats outside the desk", () => {
        expect(findDeskSeat([outside], desk, () => true)).toBeUndefined();
    });
});

describe("walkToDesk", () => {
    it("runs to the desk seat and sits on it on arrival", async () => {
        const d = deps();

        await expect(walkToDesk(desk, d)).resolves.toBe("seated");

        expect(d.moveTo).toHaveBeenCalledWith({ x: 100, y: 70 });
        expect(d.sitOnSeat).toHaveBeenCalledWith("near");
    });

    it("sits when already next to the seat (no path to walk)", async () => {
        const d = deps({ moveTo: vi.fn().mockRejectedValue(new Error("no path")) });

        await expect(walkToDesk(desk, d)).resolves.toBe("seated");
        expect(d.sitOnSeat).toHaveBeenCalledWith("near");
    });

    it("stays standing when the run is cancelled", async () => {
        const d = deps({ moveTo: vi.fn().mockResolvedValue({ cancelled: true }) });

        await expect(walkToDesk(desk, d)).resolves.toBe("walked");
        expect(d.sitOnSeat).not.toHaveBeenCalled();
    });

    it("reports standing when sitting is refused (swimming, vehicle rules, following...)", async () => {
        const d = deps({ sitOnSeat: vi.fn().mockReturnValue(false) });

        await expect(walkToDesk(desk, d)).resolves.toBe("walked");
    });

    it("walks to the center and stays standing without a free seat in the desk", async () => {
        const d = deps({ isFree: () => false });

        await expect(walkToDesk(desk, d)).resolves.toBe("walked");
        expect(d.moveTo).toHaveBeenCalledWith({ x: 96, y: 64 });
        expect(d.sitOnSeat).not.toHaveBeenCalled();
    });

    it("keeps reporting a failed walk without a seat to fall back on", async () => {
        const error = new Error("no path");
        const d = deps({ isFree: () => false, moveTo: vi.fn().mockRejectedValue(error) });

        await expect(walkToDesk(desk, d)).rejects.toBe(error);
    });

    it("does nothing when already seated at the desk", async () => {
        const d = deps({ inside: true, seatedSeatId: "far" });

        await expect(walkToDesk(desk, d)).resolves.toBe("none");
        expect(d.moveTo).not.toHaveBeenCalled();
    });

    it("sits down when standing inside the desk", async () => {
        const d = deps({ inside: true });

        await expect(walkToDesk(desk, d)).resolves.toBe("seated");
        expect(d.sitOnSeat).toHaveBeenCalledWith("near");
    });

    it("does nothing inside the desk without a free seat", async () => {
        const d = deps({ inside: true, isFree: () => false });

        await expect(walkToDesk(desk, d)).resolves.toBe("none");
        expect(d.moveTo).not.toHaveBeenCalled();
    });

    it("walks over from a seat outside the desk", async () => {
        const d = deps({ seatedSeatId: "outside" });

        await expect(walkToDesk(desk, d)).resolves.toBe("seated");
        expect(d.sitOnSeat).toHaveBeenCalledWith("near");
    });
});
