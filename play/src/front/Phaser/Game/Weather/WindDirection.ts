/** The 8 points of the compass, clockwise from north. */
export const COMPASS_POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * The point of the compass a wind comes from, given in degrees as weather services do (0 north, 90 east): each point is
 * a sector of 45° centred on it, north being [337.5 ; 22.5[. Undefined for an angle that is not a number.
 */
export function compassPointOf(windFrom: number): CompassPoint | undefined {
    if (!Number.isFinite(windFrom)) return undefined;
    const degrees = ((windFrom % 360) + 360) % 360;
    return COMPASS_POINTS[Math.floor((degrees + 22.5) / 45) % COMPASS_POINTS.length];
}

/** How to draw the arrow of a wind: where it goes, and the pixel-art arrow to turn by quarter turns to get there. */
export interface WindArrow {
    /** Degrees where the wind goes (its point + 180°), north up as on the map. */
    towards: number;
    /** The diagonal arrow (pointing north-east) rather than the straight one (pointing north). */
    diagonal: boolean;
    /** Clockwise quarter turns of that arrow: a quarter turn keeps its pixels sharp, any other angle blurs them. */
    quarterTurns: number;
}

export function windArrowOf(point: CompassPoint): WindArrow {
    const towards = (COMPASS_POINTS.indexOf(point) * 45 + 180) % 360;
    return { towards, diagonal: towards % 90 !== 0, quarterTurns: Math.floor(towards / 90) };
}
