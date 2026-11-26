import { hash01 } from "../Autumn/LeafPalette";

/**
 * The trails of the planes high over the map. A plane may cross the map in each slot of time, the same for everyone
 * (drawn from the server time); its trail stays where it was left in the air, so it drifts with the clouds, and
 * spreads and fades as it ages. In map pixels and seconds.
 */
export const CONTRAIL_SLOT_SECONDS = 120;
/** The longest a trail lasts (a persistent one, in moist air); a short one is gone in a few tens of seconds. */
export const CONTRAIL_LIFE_SECONDS = 110;
/** Shortest life of a trail: dry air, it dissolves a little way behind the plane. */
const SHORT_LIFE_SECONDS = 22;
/** Ground speed of a plane: slow enough for the trail to age, spread and fade while it is crossing the map. */
const PLANE_SPEED = 200;
/** Share of the slots with no plane at all, and with two (the others have one): not too many trails at once. */
const NO_PLANE_CHANCE = 0.4;
const TWO_PLANES_CHANCE = 0.15;

/** How many planes cross the map in a slot of time: 0, 1 or 2, the same for everyone. */
function planesIn(slot: number): number {
    const draw = hash01(slot, 211);
    if (draw < NO_PLANE_CHANCE) return 0;
    return draw < 1 - TWO_PLANES_CHANCE ? 1 : 2;
}
/** How far before and after the map a plane flies, so its trail comes in and goes out of the map. */
const RUN_UP = 900;
/** The wind at the height of the planes against the wind of the clouds, and its fastest (map pixels a second). */
const HIGH_WIND = 2;
const HIGH_WIND_MAX = 60;
/** Opacity of a trail at night, against its opacity by day. */
const NIGHT_TRAIL = 0.35;
/** At most this many trails at once (the uniforms of the shader). */
export const MAX_CONTRAILS = 3;

type Vector = { x: number; y: number };

/** Screen pixels a map pixel takes where the trails start to fade, zooming in, and where they are gone. */
const ZOOM_WHOLE = 0.55;
const ZOOM_GONE = 0.95;

/**
 * How much of the trails and their planes shows at this zoom (screen pixels a map pixel takes): they fly higher than
 * the clouds, so the camera passes under them sooner (the clouds go between 0.8 and 1.4).
 */
export function contrailZoomFade(screenScale: number): number {
    if (!Number.isFinite(screenScale)) return 1;
    return 1 - Math.max(0, Math.min(1, (screenScale - ZOOM_WHOLE) / (ZOOM_GONE - ZOOM_WHOLE)));
}

export interface Contrail {
    /** Where the first point of the trail is now, in map pixels (it drifts with the sky). */
    x: number;
    y: number;
    /** The way the trail runs in the air (a unit vector): the plane's heading, less the drift of the air. */
    direction: Vector;
    /** Length of the trail so far, map pixels. */
    length: number;
    /** Map pixels of trail laid a second: a point of it `d` behind the plane is `d / speed` seconds old. */
    speed: number;
    /** 1 while the plane is still flying (its light shows at the head of the trail). */
    flying: boolean;
    /** Opacity of the whole trail, fainter at night: full up to 20 % of clouds, none from about 90 %. */
    strength: number;
    /** How bright the lights of the plane are, blinking: from dusk on, as the trail fades out. */
    lights: number;
    /** Seconds a point of the trail lasts before it has dissolved: short in dry air, long when it persists. */
    life: number;
    /** The drift of the air (map pixels a second): the older trail leans and spreads downwind. */
    wind: Vector;
    /**
     * How the plane turns, 1 / the radius of its arc (map pixels), > 0 to the left of `direction` (towards
     * (-direction.y, direction.x)); 0 straight. Its trail is that arc, from the first point on.
     */
    curvature: number;
}

/** Share of the planes flying straight across; the others turn, wide, to join their route. */
const STRAIGHT_CHANCE = 0.45;
/** How far a turning plane turns while it crosses the map, radians. */
const TURN_MIN = 0.26;
const TURN_MAX = 1.4;

/**
 * The point `distance` along an arc that leaves the origin along `direction` and turns by `curvature` (straight: 0),
 * as in the shader.
 */
export function arcPoint(direction: Vector, curvature: number, distance: number): Vector {
    const left = { x: -direction.y, y: direction.x };
    if (Math.abs(curvature) < 1e-7) return { x: direction.x * distance, y: direction.y * distance };
    const angle = curvature * distance;
    const forward = Math.sin(angle) / curvature;
    const aside = (1 - Math.cos(angle)) / curvature;
    return { x: direction.x * forward + left.x * aside, y: direction.y * forward + left.y * aside };
}

/**
 * The trails over the map at `epoch` (ms), `groundDrift` the pace of the clouds (map pixels a second); `daylight` 1 by day, 0 at
 * night; `cloudiness` 0 to 1.
 */
export function contrails(
    epoch: number,
    groundDrift: Vector,
    map: { width: number; height: number },
    daylight: number,
    cloudiness: number,
): Contrail[] {
    // Seen through a clear sky only: full up to 20 % of clouds, none from about 90 %.
    const clear = Math.max(0, 1 - Math.max(0, cloudiness - 0.2) * 1.4);
    const day = Math.max(0, Math.min(1, daylight));
    // The trail by day, and at night still, fainter, lit by the moon and the towns below; the plane's lights from the
    // second half of the dusk on (the plane itself is then too dark to be seen).
    const strength = (NIGHT_TRAIL + (1 - NIGHT_TRAIL) * day) * clear;
    const lights = Math.max(0, 1 - day * 2) * clear;
    if (strength <= 0 && lights <= 0) return [];
    // The wind up where the planes fly (10 to 12 km) blows harder than on the ground: the way of the ground wind, the
    // shown one, at twice its pace, kept under a third of the plane's speed (a jet stream against an airliner).
    const pace = Math.hypot(groundDrift.x, groundDrift.y);
    const high = pace > 0 ? Math.min(pace * HIGH_WIND, HIGH_WIND_MAX) / pace : 0;
    const drift = { x: groundDrift.x * high, y: groundDrift.y * high };
    const now = epoch / 1000;
    const slot = Math.floor(now / CONTRAIL_SLOT_SECONDS);
    const trails: Contrail[] = [];
    const planes = [slot - 1, slot].flatMap((index) =>
        Array.from({ length: planesIn(index) }, (_, plane) => ({ index: index * 4 + plane, slotIndex: index })),
    );
    for (const { index, slotIndex } of planes) {
        if (trails.length >= MAX_CONTRAILS) break;
        const heading = hash01(index, 223) * 2 * Math.PI;
        const ground = { x: Math.cos(heading), y: Math.sin(heading) };
        // The plane passes over a point of the map, flying from RUN_UP before it to RUN_UP after it.
        const over = {
            x: map.width * (0.15 + 0.7 * hash01(index, 227)),
            y: map.height * (0.15 + 0.7 * hash01(index, 229)),
        };
        const half = Math.hypot(map.width, map.height) / 2 + RUN_UP;
        const flight = (2 * half) / PLANE_SPEED;
        const start = slotIndex * CONTRAIL_SLOT_SECONDS + hash01(index, 233) * (CONTRAIL_SLOT_SECONDS - flight);
        const age = now - start;
        // Dry air: a short trail that dissolves soon behind the plane; moist air (more clouds): one that persists.
        const moist = Math.min(1, hash01(index, 239) * 0.8 + cloudiness * 0.9);
        const life = SHORT_LIFE_SECONDS + (CONTRAIL_LIFE_SECONDS - SHORT_LIFE_SECONDS) * moist * moist;
        if (age <= 0 || age > flight + life) continue;
        // In the air, which drifts: the trail runs along the plane's speed less the drift.
        const air = { x: ground.x * PLANE_SPEED - drift.x, y: ground.y * PLANE_SPEED - drift.y };
        const speed = Math.hypot(air.x, air.y);
        const direction = { x: air.x / speed, y: air.y / speed };
        // Straight, or a wide turn to the left or the right, along its path in the air.
        const turning = hash01(index, 241) >= STRAIGHT_CHANCE;
        const turn = turning
            ? (hash01(index, 251) < 0.5 ? -1 : 1) * (TURN_MIN + (TURN_MAX - TURN_MIN) * hash01(index, 257))
            : 0;
        const curvature = turn / (speed * flight);
        // Halfway through its flight the plane is over that point of the map: the first point of the trail, left at
        // `start`, is that far back along the arc, and has drifted with the sky since.
        const middle = arcPoint(direction, curvature, (speed * flight) / 2);
        trails.push({
            x: over.x - drift.x * (flight / 2) - middle.x + drift.x * age,
            y: over.y - drift.y * (flight / 2) - middle.y + drift.y * age,
            direction,
            length: speed * Math.min(age, flight),
            speed,
            flying: age < flight,
            strength,
            lights,
            life,
            wind: { x: drift.x, y: drift.y },
            curvature,
        });
    }
    return trails;
}
