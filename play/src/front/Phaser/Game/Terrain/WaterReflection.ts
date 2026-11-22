/** A part of the map, in map pixels. */
export interface ReflectedArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * What the water reflects, read by the water shader (GroundSplat) at each drawing: the sky, the clouds passing over
 * it, the glint of the sun on its waves and, at night, the light of the lamps. Each is read from what is already drawn
 * (the thickness of the clouds of CloudLayer, the night veil of NightOverlay): nothing is drawn twice.
 */
export interface WaterReflection {
    /** The colour of the sky over the water and how much of it shows (0: none). */
    sky: { color: number; share: number };
    /** The thickness texture of the clouds, the part of the map it covers, how far the sky has drifted, their tone. */
    clouds: { key: string; area: ReflectedArea; color: number; share: number } | undefined;
    /** Towards the sun on the map (a unit vector, north up, y down) and the strength of its glint (0: none). */
    sun: { x: number; y: number; strength: number };
    /** The night veil: its texture, the part of the map it covered when drawn, its opacity where no lamp shines. */
    lamps: { key: string; area: ReflectedArea; opacity: number } | undefined;
}

export const NO_WATER_REFLECTION: WaterReflection = {
    sky: { color: 0, share: 0 },
    clouds: undefined,
    sun: { x: 0, y: -1, strength: 0 },
    lamps: undefined,
};
