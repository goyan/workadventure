import { ICE_SLIPS_MM } from "@workadventure/map-editor";

/**
 * The ice that gives way under the avatar: too thin to bear them over deep water (FrozenWater, iceUnderfoot), it
 * cracks around them, then breaks into a hole of open water they fall into; the hole closes again as it freezes over.
 * The holes the room tells (the ice another player broke) open the same way. Read by the water shader (cracks, broken
 * ice) and by the ground the avatar stands on (no ice in an open hole).
 *
 * On the ice of the server the hole has no clock of its own: the server took the ice of the hole away (its ice back
 * to 0, Meadow.breakIce) and it freezes again by the law of the ice of the map (Stefan's law, at the pace of the
 * water of the map, by its air): hours at -10 °C in real time, never in a thaw. The hole stays open water while the
 * server keeps no ice there, and closes as that ice comes back. A player who follows a weather of their own has no
 * ice of the server: their hole keeps its clock (HOLE_OPEN_MS).
 */

/** How long the ice cracks under a still avatar before it gives way (ms). */
export const CRACK_MS = 1200;
/** The radius of the hole broken around the avatar (map pixels): a tile wide. */
export const HOLE_RADIUS_PX = 24;
/** How long a hole stays open before it has frozen over again (ms), on the ice of a weather of one's own. */
export const HOLE_OPEN_MS = 120_000;
/**
 * On the ice of the server, how long a hole stays open whatever ice the room was last told there (ms): the room is
 * told the ice the server broke a step of its meadow later (2 s), the ice before the break must not close it.
 */
export const HOLE_CONFIRM_MS = 10_000;
/** The breaks the water shader draws at once. */
export const MAX_SHOWN_BREAKS = 4;

export interface IceBreak {
    x: number;
    y: number;
    radius: number;
    /** 0 to 1 while it cracks, then 1 (just broken) to 2 (frozen over again). */
    phase: number;
}

interface Hole {
    x: number;
    y: number;
    openAt: number;
}

export class IceBreaks {
    private holes: readonly Hole[] = [];
    private stress: { x: number; y: number; since: number } | undefined;

    constructor(
        /**
         * The ice the server keeps at a point of the map (mm), as the room was last told it, for a player who follows
         * the weather of the server; undefined for one who follows a weather of their own.
         */
        private readonly serverIce: () => ((x: number, y: number) => number) | undefined = () => undefined,
    ) {}

    /**
     * One step of the avatar at `at` (map pixels), on ice too thin to bear them (`thin`) or not. The point where the
     * ice gives way when it does, undefined otherwise. Moving away from where it cracks starts again further on.
     */
    public step(
        now: number,
        at: { x: number; y: number } | undefined,
        thin: boolean,
    ): { x: number; y: number } | undefined {
        this.holes = this.holes.filter((hole) => this.openShare(hole, now) > 0);
        if (!at || !thin || this.holeAt(at.x, at.y, now)) {
            this.stress = undefined;
            return undefined;
        }
        const stress = this.stress;
        if (!stress || Math.hypot(at.x - stress.x, at.y - stress.y) > HOLE_RADIUS_PX) {
            this.stress = { x: at.x, y: at.y, since: now };
            return undefined;
        }
        if (now - stress.since < CRACK_MS) return undefined;
        this.stress = undefined;
        this.addHole(stress.x, stress.y, now);
        return { x: stress.x, y: stress.y };
    }

    /** A hole opened at a point (the room tells it, or the avatar broke it): one hole where one is already open. */
    public addHole(x: number, y: number, now: number): void {
        if (this.holes.some((hole) => Math.hypot(hole.x - x, hole.y - y) < HOLE_RADIUS_PX)) return;
        this.holes = [...this.holes, { x, y, openAt: now }];
    }

    /** Whether the point is in open water of a hole, which shrinks as it freezes over. */
    public holeAt(x: number, y: number, now: number): boolean {
        return this.holes.some((hole) => Math.hypot(hole.x - x, hole.y - y) < this.openRadius(hole, now));
    }

    /** Whether a hole is open over a rectangle of the map (a pool). */
    public holeIn(rect: { x: number; y: number; width: number; height: number }, now: number): boolean {
        return this.holes.some((hole) => {
            const radius = this.openRadius(hole, now);
            const nearestX = Math.max(rect.x, Math.min(hole.x, rect.x + rect.width));
            const nearestY = Math.max(rect.y, Math.min(hole.y, rect.y + rect.height));
            return radius > 0 && Math.hypot(hole.x - nearestX, hole.y - nearestY) <= radius;
        });
    }

    /** Whether something cracks or a hole is open: the scene is drawn again while it is so. */
    public active(): boolean {
        return this.stress !== undefined || this.holes.length > 0;
    }

    /** The cracks and the holes for the water shader: the crack under the avatar first, then the newest holes. */
    public shown(now: number): IceBreak[] {
        const cracking = this.stress
            ? [
                  {
                      x: this.stress.x,
                      y: this.stress.y,
                      radius: HOLE_RADIUS_PX,
                      phase: Math.min(0.999, (now - this.stress.since) / CRACK_MS),
                  },
              ]
            : [];
        const holes = [...this.holes]
            .sort((a, b) => b.openAt - a.openAt)
            .map((hole) => ({
                x: hole.x,
                y: hole.y,
                radius: HOLE_RADIUS_PX,
                phase: 2 - this.openShare(hole, now),
            }));
        return [...cracking, ...holes].slice(0, MAX_SHOWN_BREAKS);
    }

    /**
     * How open a hole is, from 1 (open water) to 0 (frozen over): on the ice of the server, by the ice it keeps there
     * (closed at the ice one slips on), else by its own clock.
     */
    private openShare(hole: Hole, now: number): number {
        const ice = this.serverIce();
        if (ice) {
            if (now - hole.openAt < HOLE_CONFIRM_MS) return 1;
            return Math.min(1, Math.max(0, 1 - ice(hole.x, hole.y) / ICE_SLIPS_MM));
        }
        return 1 - Math.min(1, Math.max(0, (now - hole.openAt) / HOLE_OPEN_MS));
    }

    /** The open water of a hole: whole at first, closing as the ice takes it again. */
    private openRadius(hole: Hole, now: number): number {
        return HOLE_RADIUS_PX * this.openShare(hole, now);
    }
}
