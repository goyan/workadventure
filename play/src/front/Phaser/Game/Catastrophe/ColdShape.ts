import {
    airBroughtTo,
    COLD_CORE_SHARE,
    coldCelsius,
    coldShare,
    coldTiles,
    hoarFrost,
    warmedCold,
} from "@workadventure/map-editor";
import type { ColdAir } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";

/** A mass this many degrees colder than the air of the map is drawn whole; less cold, fainter. */
const FULL_STRENGTH_DEGREES = 60;
/** The frost on the ground is laid in this many bands between the core of a mass and its rim. */
const FROST_BANDS = 14;
/** A mass held under an air that is not known is seen as against a mild air (°C). */
export const UNKNOWN_AIR_CELSIUS = 10;
/** A wisp of mist creeps from the core to past the rim in this long (ms), then comes again from the core. */
const MIST_CREEP_MS = 9000;
/** How far past the rim a wisp of mist goes before it is gone, in shares of the radius. */
const MIST_REACH = 1.15;
/** A crystal twinkles once in this long (ms), more or less: each has its own beat. */
const TWINKLE_MS = 1300;

/** A draw from 0 to 1 that only depends on its seed: the same mist and the same crystals for everyone. */
function draw(seed: number): number {
    let mixed = Math.imul((seed + 1) ^ 0x9e3779b9, 0x85ebca6b);
    mixed ^= mixed >>> 13;
    mixed = Math.imul(mixed, 0xc2b2ae35);
    mixed ^= mixed >>> 16;
    return (mixed >>> 0) / 4294967296;
}

/**
 * How much of its look a mass of air at `temperature` has under an air of the map at `mapCelsius`, from 0 (no colder
 * than that air: nothing to see) to 1 (FULL_STRENGTH_DEGREES colder, and more).
 */
export function coldStrength(temperature: number, mapCelsius: number): number {
    if (!Number.isFinite(temperature) || !Number.isFinite(mapCelsius)) return 0;
    return Math.min(1, Math.max(0, (mapCelsius - temperature) / FULL_STRENGTH_DEGREES));
}

/** A band of the frost a mass lays on the ground, between two distances from its middle (shares of its radius). */
export interface ColdFrostBand {
    inner: number;
    outer: number;
    /** How white the ground is there, 0 to 1. */
    frost: number;
}

/**
 * How white the ground is with frost under a mass of air at `temperature`, `away` from its middle (shares of its
 * radius), under an air of the map `air`: the hoar frost of the air of the ground there (hoarFrost of the air of the
 * map brought to the temperature the mass gives that distance, as coldAirOver gives it). So the frost is that of the
 * rule of the frost, not a drawing of its own: thick where the air is a few degrees under zero and still holds
 * vapour, thinner in the extreme cold of the core, none where the air of the rim is still over zero. Under an air
 * whose humidity is not known, the cold itself whitens the ground (coldShare), as much as the mass is colder than
 * the map.
 */
export function coldFrostAt(temperature: number, air: ColdAir | undefined, away: number): number {
    const share = coldShare(away);
    if (air === undefined || air.humidity === undefined || !Number.isFinite(air.humidity)) {
        return share * coldStrength(temperature, air?.temperature ?? UNKNOWN_AIR_CELSIUS);
    }
    if (!(temperature < air.temperature)) return 0;
    const here = airBroughtTo(air, air.temperature + (temperature - air.temperature) * share);
    return hoarFrost({ temperature: here.temperature, humidity: here.humidity ?? 0, windSpeed: here.windSpeed });
}

/**
 * The frost a mass lays on the ground, as it is drawn: its core, then bands out to its rim, each as white as the
 * frost of the ground there (coldFrostAt), a band taking a little of its two neighbours: the air of a mass mixes
 * with the air around it, and its frost has no edge drawn with a compass.
 */
export function coldFrostBands(temperature: number, air: ColdAir | undefined): ColdFrostBand[] {
    const wide = (1 - COLD_CORE_SHARE) / FROST_BANDS;
    const raw = [coldFrostAt(temperature, air, 0)];
    for (let band = 0; band < FROST_BANDS; band++) {
        raw.push(coldFrostAt(temperature, air, COLD_CORE_SHARE + (band + 0.5) * wide));
    }
    // Past the rim there is no frost of the mass.
    const at = (band: number): number => (band < 0 ? raw[0] : band >= raw.length ? 0 : raw[band]);
    const bands: ColdFrostBand[] = [];
    for (let band = 0; band < raw.length; band++) {
        const frost = band === 0 ? raw[0] : 0.25 * at(band - 1) + 0.5 * at(band) + 0.25 * at(band + 1);
        const inner = band === 0 ? 0 : COLD_CORE_SHARE + (band - 1) * wide;
        bands.push({ inner, outer: band === 0 ? COLD_CORE_SHARE : inner + wide, frost });
    }
    return bands;
}

/** A wisp of the mist of a mass of cold air: where it is (shares of the radius), how wide, how visible. */
export interface ColdWisp {
    x: number;
    y: number;
    size: number;
    alpha: number;
}

/**
 * The mist that lies on the ground of a mass of cold air, `elapsed` ms after it came: `count` wisps that creep from
 * its core outwards (cold air is heavy: it pours out along the ground), each on its own way, widening and fading
 * past the rim. Still in reduced motion.
 */
export function coldMist(elapsed: number, count: number, reduced: boolean): ColdWisp[] {
    const wisps: ColdWisp[] = [];
    const time = reduced || !Number.isFinite(elapsed) ? 0 : Math.max(0, elapsed);
    for (let index = 0; index < count; index++) {
        const turn = 2 * Math.PI * (index / count + draw(index * 3) * 0.6);
        const pace = 0.6 + draw(index * 3 + 1) * 0.8;
        // Where along its way it is, from the core (0) to its end past the rim (1).
        const along = (draw(index * 3 + 2) + (time * pace) / MIST_CREEP_MS) % 1;
        const away = along * MIST_REACH;
        wisps.push({
            x: Math.cos(turn) * away,
            // The ground is seen from above and a little aslant: the mist lies flatter than it is wide.
            y: Math.sin(turn) * away,
            size: 0.22 + 0.3 * along,
            // It comes out of nothing at the core and thins to nothing at its end.
            alpha: Math.min(1, along * 4) * (1 - along) ** 1.5,
        });
    }
    return wisps;
}

/**
 * The crystals of ice that glitter in the air of a mass of cold air: `count` of them spread over its disc (shares of
 * its radius), each twinkling at its own beat. Lit and still in reduced motion.
 */
export function coldSparkles(
    elapsed: number,
    count: number,
    reduced: boolean,
): { x: number; y: number; alpha: number }[] {
    const sparkles: { x: number; y: number; alpha: number }[] = [];
    const time = reduced || !Number.isFinite(elapsed) ? 0 : Math.max(0, elapsed);
    for (let index = 0; index < count; index++) {
        const turn = 2 * Math.PI * draw(index * 5 + 100);
        // Spread evenly over the disc, not crowded in its middle.
        const away = Math.sqrt(draw(index * 5 + 101)) * 0.98;
        const beat = TWINKLE_MS * (0.6 + draw(index * 5 + 102) * 0.9);
        const phase = draw(index * 5 + 103);
        const lit = reduced ? 0.5 + 0.5 * phase : Math.sin(Math.PI * ((time / beat + phase) % 1)) ** 6;
        sparkles.push({ x: Math.cos(turn) * away, y: Math.sin(turn) * away, alpha: lit });
    }
    return sparkles;
}

/** A mass of cold air as a browser shows it: what the server last told of it, and until when it is held. */
export interface ShownCold {
    x: number;
    y: number;
    radiusTiles: number;
    temperature: number;
    /** When it was first told, and until when it is held if nothing more is told (ms of the game). */
    beganAt: number;
    until: number;
}

type ColdReport = Pick<CatastropheMessage, "x" | "y" | "radiusTiles" | "impactInMs" | "temperature">;

/** The mass of a message of the server: where its player holds it, as wide and as cold as the server kept it. */
export function tellCold(known: ShownCold | undefined, message: ColdReport, receivedAt: number): ShownCold {
    return {
        x: message.x,
        y: message.y,
        radiusTiles: coldTiles(message.radiusTiles),
        temperature: coldCelsius(message.temperature),
        beganAt: known?.beganAt ?? receivedAt,
        until: receivedAt + message.impactInMs,
    };
}

/**
 * The temperature of a mass at `now` (ms of the game): what the server told while it is held; then it warms where
 * it lies by the rule of the server (warmedCold), `times` minutes of the map for a minute of the clock, towards the
 * air of the map at `mapCelsius`, sooner in its wind (`windSpeed`, km/h). Undefined once it is that air, or let go under an air that is not known: gone.
 */
export function coldAt(
    shown: ShownCold,
    now: number,
    mapCelsius: number | undefined,
    times: number,
    windSpeed?: number,
): number | undefined {
    if (now < shown.until) return shown.temperature;
    if (mapCelsius === undefined || !Number.isFinite(mapCelsius)) return undefined;
    const pace = Number.isFinite(times) && times > 0 ? times : 1;
    const warmed = warmedCold(shown.temperature, mapCelsius, ((now - shown.until) / 60_000) * pace, windSpeed);
    return warmed < mapCelsius ? warmed : undefined;
}
