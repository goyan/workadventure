import type { Seat } from "./Seat";

export interface DeskArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

function isInDesk(seat: Seat, desk: DeskArea): boolean {
    return (
        seat.feet.x >= desk.x &&
        seat.feet.x <= desk.x + desk.width &&
        seat.feet.y >= desk.y &&
        seat.feet.y <= desk.y + desk.height
    );
}

/**
 * The seat to sit on at one's personal desk: among the free seats whose feet are inside the desk area, the one
 * nearest to its center. A personal area does not say which chair is "its" chair, and a desk area usually wraps one
 * workstation, so the most central seat is the workstation's one rather than a visitor chair near the edge.
 */
export function findDeskSeat(seats: Seat[], desk: DeskArea, isFree: (seat: Seat) => boolean): Seat | undefined {
    const centerX = desk.x + desk.width / 2;
    const centerY = desk.y + desk.height / 2;
    let nearest: { seat: Seat; distance: number } | undefined;
    for (const seat of seats) {
        if (!isInDesk(seat, desk) || !isFree(seat)) continue;
        const distance = Math.hypot(seat.feet.x - centerX, seat.feet.y - centerY);
        if (!nearest || distance < nearest.distance) nearest = { seat, distance };
    }
    return nearest?.seat;
}

export interface WalkToDeskDependencies {
    seats: Seat[];
    isFree: (seat: Seat) => boolean;
    /** The seat the player sits on, if any. */
    seatedSeatId: string | undefined;
    /** Whether the player already stands in the desk area. */
    inside: boolean;
    moveTo: (target: { x: number; y: number }) => Promise<{ cancelled: boolean }>;
    /** Player.sitOnSeat: refuses while swimming, following, or out of reach. */
    sitOnSeat: (seatId: string) => boolean;
}

/**
 * Goes to one's personal desk and sits on its seat, like a double-click on that seat; without a free seat in the
 * desk, walks to its center and stays standing. Nothing to do when already seated at the desk, or when standing in it
 * with no seat to sit on. Rejects when the walk fails and no seat is within reach.
 */
export async function walkToDesk(desk: DeskArea, deps: WalkToDeskDependencies): Promise<"seated" | "walked" | "none"> {
    const seatedAtDesk = deps.seats.some((seat) => seat.id === deps.seatedSeatId && isInDesk(seat, desk));
    if (seatedAtDesk) return "none";
    const seat = findDeskSeat(deps.seats, desk, deps.isFree);
    if (deps.inside && !seat) return "none";
    const target = seat?.feet ?? { x: desk.x + desk.width / 2, y: desk.y + desk.height / 2 };
    try {
        const result = await deps.moveTo(target);
        if (result.cancelled || !seat) return "walked";
    } catch (error) {
        // Already on the tile of the seat: there is no path to walk, the seat is right there.
        if (!seat) throw error;
    }
    return deps.sitOnSeat(seat.id) ? "seated" : "walked";
}
