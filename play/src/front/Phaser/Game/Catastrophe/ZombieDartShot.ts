import { NERF_DART_RANGE_PX, zombieDartAim } from "@workadventure/map-editor";
import type { ZombieDartMessage } from "@workadventure/messages";

/**
 * A dart is sent into the horde when a zombie walks this near its barrel: its range, and what a zombie runs while it
 * flies (5 m/s for 1.2 s). A dart that cannot reach any is not sent: the room is told only what may kill.
 */
const NEAR_PX = NERF_DART_RANGE_PX + 192;

/** The horde of the room as the Nerf reads it (ZombieView). */
export interface ZombieDartTarget {
    step(): number | undefined;
    walkingNear(x: number, y: number, range: number): boolean;
}

/**
 * The dart a shot of the Nerf of this player sends into the horde: from its barrel at (x, y), the way (dx, dy) it
 * fires, at the step the crowd of this browser is at. Undefined when it sends none: no horde drawn, a player in
 * Basique (the horde does not exist for them), on a floor or in the air (the horde runs on the ground), or no zombie
 * near enough.
 */
export function zombieDartOf(
    target: ZombieDartTarget | undefined,
    basic: boolean,
    floorZ: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
): ZombieDartMessage | undefined {
    if (!target || basic || floorZ >= 2) return undefined;
    const shotStep = target.step();
    if (shotStep === undefined || !target.walkingNear(x, y, NEAR_PX)) return undefined;
    const aim = zombieDartAim({
        fromX: x,
        fromY: y,
        toX: x + dx * NERF_DART_RANGE_PX,
        toY: y + dy * NERF_DART_RANGE_PX,
    });
    return aim && { ...aim, shotStep };
}
