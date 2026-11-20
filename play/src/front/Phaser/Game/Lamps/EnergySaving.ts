/**
 * The energy saving of a map (`settings.lighting.energySaving`): its lamps that stand outdoors go out by day, while the
 * sky gives light enough, and come back as it gets dark. A rule of the browser, read where an RGB lamp decides how much
 * it shines (RgbLamps): it writes nothing in the shared state of the lamps, so a lamp put out by the saving comes back
 * as its switch left it.
 *
 * Everything it reads is the same for every player of the map: the clock of the server, the sun of the place of the
 * map, and the weather of the map; nothing personal (the darkness of the night, the night turned off, the seasonal
 * theme, the clouds hidden).
 */

/** The sun lights the ground fully from this elevation (degrees) up, under a clear sky. */
export const FULL_DAYLIGHT_ELEVATION = 15;
/** The lamps outdoors go out once the daylight (daylightOf) reaches this level... */
export const ENERGY_SAVING_OUT_AT = 0.25;
/** ...and come back once it falls under this one: a cloud or a dusk that hesitates does not make them blink. */
export const ENERGY_SAVING_BACK_BELOW = 0.18;
/** A lamp put out or lit again by the saving fades over this long. */
export const ENERGY_SAVING_FADE_MS = 1500;

/** Between the two levels, the last instant outside of them decides: looked for back in time by such steps... */
const LOOK_BACK_STEP_MS = 60_000;
/** ...as far back as this; the lamps are on when nothing decided. */
const LOOK_BACK_MS = 6 * 3_600_000;
/** A decision this recent is kept while the daylight stays between the two levels, instead of being looked for again. */
const KEEP_DECISION_MS = 10_000;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * How much daylight there is, 0 to 1: the elevation of the sun (nothing when it is on the horizon or under it, all of
 * it from FULL_DAYLIGHT_ELEVATION) times what the weather lets through (skyWeatherFactor).
 */
export function daylightOf(sunElevation: number, weatherFactor: number): number {
    if (!Number.isFinite(sunElevation) || !Number.isFinite(weatherFactor)) return 0;
    return clamp01(sunElevation / FULL_DAYLIGHT_ELEVATION) * clamp01(weatherFactor);
}

/**
 * Whether the saving puts the lamps outdoors out at an instant (milliseconds), from the daylight at any instant
 * (undefined: not known, and nothing is put out). At or above ENERGY_SAVING_OUT_AT: out; under
 * ENERGY_SAVING_BACK_BELOW: on; in between, as at the last instant outside of the two levels, looked for back in time.
 * It depends on the instant alone, not on what a browser saw before: a player who just came sees what the others see.
 */
export function energySavingAt(at: number, daylightAt: (at: number) => number | undefined): boolean {
    for (let back = 0; back <= LOOK_BACK_MS; back += LOOK_BACK_STEP_MS) {
        const level = daylightAt(at - back);
        if (level === undefined) return false;
        if (level >= ENERGY_SAVING_OUT_AT) return true;
        if (level < ENERGY_SAVING_BACK_BELOW) return false;
    }
    return false;
}

/**
 * energySavingAt, worked out at most once a second; between the two levels the last decision is kept while it is
 * recent, so that the past is only looked through when a player comes while the daylight is between them.
 */
export class EnergySavingClock {
    private decision: { at: number; saving: boolean } | undefined;

    constructor(private readonly daylightAt: (at: number) => number | undefined) {}

    public savingAt(at: number): boolean {
        const { decision } = this;
        if (decision && Math.floor(decision.at / 1000) === Math.floor(at / 1000)) return decision.saving;
        const level = this.daylightAt(at);
        let saving: boolean;
        if (level === undefined) {
            saving = false;
        } else if (level >= ENERGY_SAVING_OUT_AT) {
            saving = true;
        } else if (level < ENERGY_SAVING_BACK_BELOW) {
            saving = false;
        } else if (decision && at >= decision.at && at - decision.at <= KEEP_DECISION_MS) {
            saving = decision.saving;
        } else {
            saving = energySavingAt(at, this.daylightAt);
        }
        this.decision = { at, saving };
        return saving;
    }
}

/** The part of a lamp of the map needed to know where it stands (an `Entity` fits). */
export interface StandingObject {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    /** Map pixels above the ground (a lamp on a raised floor). */
    getElevation(): number;
}

/**
 * Where a lamp stands on the ground: the middle of the foot of its image, on the ground under it when it stands on a
 * raised floor. Not where its light comes from: the bulb of a street lamp can hang over a wall or a roof.
 */
export function lampFootOnGround(lamp: StandingObject): { x: number; y: number } {
    return { x: lamp.x + lamp.displayWidth / 2, y: lamp.y + lamp.displayHeight - 1 + lamp.getElevation() };
}

/**
 * Whether the saving puts this lamp out now: `saving` (the map asks for it, and the daylight is enough) and the lamp
 * stands outdoors (`outdoorAt`, undefined while the outdoors of the map are not known: no lamp is put out then). A lamp
 * in a room, or standing in a wall (on a facade), keeps its light.
 */
export function isLampSaved(
    saving: boolean,
    outdoorAt: ((x: number, y: number) => boolean) | undefined,
    lamp: StandingObject,
): boolean {
    if (!saving || !outdoorAt) return false;
    const foot = lampFootOnGround(lamp);
    return outdoorAt(foot.x, foot.y);
}
