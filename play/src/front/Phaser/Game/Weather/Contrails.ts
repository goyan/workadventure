import { hash01 } from "../Autumn/LeafPalette";

/**
 * The trails of the planes high over the map. A plane may cross the map in each slot of time, the same for everyone
 * (drawn from the server time); its trail stays where it was left in the air, so it drifts with the clouds, and
 * spreads and fades as it ages. In map pixels and seconds.
 */
export const CONTRAIL_SLOT_SECONDS = 120;
export const CONTRAIL_LIFE_SECONDS = 110;
/** Ground speed of a plane: a large map crossed in about half a minute. */
const PLANE_SPEED = 320;
/** Share of the slots with a plane. */
const PLANE_CHANCE = 0.85;
/** How far before and after the map a plane flies, so its trail comes in and goes out of the map. */
const RUN_UP = 2500;
/** At most this many trails at once (the uniforms of the shader). */
export const MAX_CONTRAILS = 3;

type Vector = { x: number; y: number };

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
    /** Opacity of the whole trail: none at night, full up to 20 % of clouds, none from about 90 %. */
    strength: number;
}

/**
 * The trails over the map at `epoch` (ms), `drift` the pace of the sky (map pixels a second); `daylight` 1 by day, 0 at
 * night; `cloudiness` 0 to 1.
 */
export function contrails(
    epoch: number,
    drift: Vector,
    map: { width: number; height: number },
    daylight: number,
    cloudiness: number,
): Contrail[] {
    const strength = Math.max(0, Math.min(1, daylight)) * Math.max(0, 1 - Math.max(0, cloudiness - 0.2) * 1.4);
    if (strength <= 0) return [];
    const now = epoch / 1000;
    const slot = Math.floor(now / CONTRAIL_SLOT_SECONDS);
    const trails: Contrail[] = [];
    for (let index = slot - 1; index <= slot && trails.length < MAX_CONTRAILS; index++) {
        if (hash01(index, 211) >= PLANE_CHANCE) continue;
        const heading = hash01(index, 223) * 2 * Math.PI;
        const ground = { x: Math.cos(heading), y: Math.sin(heading) };
        // The plane passes over a point of the map, flying from RUN_UP before it to RUN_UP after it.
        const over = {
            x: map.width * (0.15 + 0.7 * hash01(index, 227)),
            y: map.height * (0.15 + 0.7 * hash01(index, 229)),
        };
        const half = Math.hypot(map.width, map.height) / 2 + RUN_UP;
        const flight = (2 * half) / PLANE_SPEED;
        const start = index * CONTRAIL_SLOT_SECONDS + hash01(index, 233) * (CONTRAIL_SLOT_SECONDS - flight);
        const age = now - start;
        if (age <= 0 || age > flight + CONTRAIL_LIFE_SECONDS) continue;
        // In the air, which drifts: the trail runs along the plane's speed less the drift.
        const air = { x: ground.x * PLANE_SPEED - drift.x, y: ground.y * PLANE_SPEED - drift.y };
        const speed = Math.hypot(air.x, air.y);
        // The first point of the trail, left at `start` over the map, has drifted with the sky since.
        trails.push({
            x: over.x - ground.x * half + drift.x * age,
            y: over.y - ground.y * half + drift.y * age,
            direction: { x: air.x / speed, y: air.y / speed },
            length: speed * Math.min(age, flight),
            speed,
            flying: age < flight,
            strength,
        });
    }
    return trails;
}
