import { FIRE_FEAR_PX } from "@workadventure/map-editor";
import type { LifeFire } from "@workadventure/map-editor";
import type { Point } from "./WanderSchedule";

/** A wild animal runs from an avatar that comes this close (three tiles), in map pixels. */
export const FEAR_RADIUS_PX = 96;
/** It runs this far from where it stands, away from the avatar. */
export const FEAR_RUN_PX = 128;
/** It stops being afraid once every avatar is this far: farther than it fears them, so that it does not dither. */
export const FEAR_CALM_PX = 144;
/** The share of the wild animals that do not fear the avatars, drawn again every day. */
export const BRAVE_SHARE = 0.2;
/** The ground is checked this often along a run, in map pixels: less than a tile, so that no wall is skipped. */
const RUN_SAMPLE_PX = 8;
/** The directions tried, from straight away from the avatar to sideways: a cornered animal slips along the wall. */
const RUN_ANGLES_DEG = [0, 30, -30, 60, -60, 90, -90, 120, -120] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A small hash of a text, the same on every client. */
function hash(text: string): number {
    let value = 2166136261;
    for (let index = 0; index < text.length; index++) {
        value ^= text.charCodeAt(index);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}

/**
 * Whether this animal does not fear the avatars today. Drawn at random but the same on every client (from its id and
 * the day), so that everyone sees the same animals come close; another day, others are brave.
 */
export function isBrave(animalId: string, nowMs: number): boolean {
    const day = Math.floor(nowMs / DAY_MS);
    return hash(`${animalId}:${day}`) / 0x100000000 < BRAVE_SHARE;
}

/** The avatar closest to the animal within `radiusPx`, if any. */
export function nearestThreat(animal: Point, threats: readonly Point[], radiusPx: number): Point | undefined {
    let nearest: Point | undefined;
    let least = radiusPx;
    for (const threat of threats) {
        const distance = Math.hypot(threat.x - animal.x, threat.y - animal.y);
        if (distance <= least) {
            least = distance;
            nearest = threat;
        }
    }
    return nearest;
}

/** An animal frightened by a fire stays away until the fire is this far: seven tiles, in map pixels. */
export const FIRE_CALM_PX = 224;

/**
 * What a walking animal runs from: the fire first (the nearest thing that burns, five tiles away or less), whatever
 * else is near, then the closest avatar for an animal that fears them (`avatars` undefined for one that does not: a
 * brave one, a pet put on the map). `scared`: it is already running, and calms down only further away.
 */
export function fearedPoint(
    feet: Point,
    avatars: readonly Point[] | undefined,
    fire: LifeFire | undefined,
    scared: boolean,
): Point | undefined {
    const flames = fire?.near(feet.x, feet.y, scared ? FIRE_CALM_PX : FIRE_FEAR_PX);
    if (flames) return flames;
    return avatars ? nearestThreat(feet, avatars, scared ? FEAR_CALM_PX : FEAR_RADIUS_PX) : undefined;
}

/**
 * Where an animal runs to, away from `threat`: the first direction, from straight away to sideways, along which every
 * point stays on ground it may walk (`walkable`, outdoors for a wild animal: it never runs into a building).
 * Undefined when it is cornered: it then stays where it is.
 */
export function fleeTarget(
    from: Point,
    threat: Point,
    walkable: (x: number, y: number) => boolean,
    runPx: number = FEAR_RUN_PX,
): Point | undefined {
    // An avatar right on the animal gives no direction: it runs down, like startled.
    const away = Math.atan2(from.y - threat.y, from.x - threat.x || (from.y === threat.y ? 1 : 0));
    for (const degrees of RUN_ANGLES_DEG) {
        const angle = away + (degrees * Math.PI) / 180;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let reach = 0;
        for (let distance = RUN_SAMPLE_PX; distance <= runPx; distance += RUN_SAMPLE_PX) {
            if (!walkable(from.x + dx * distance, from.y + dy * distance)) break;
            reach = distance;
        }
        // A short dash is still a dash, but not a step against the wall.
        if (reach >= runPx / 2) {
            return { x: from.x + dx * reach, y: from.y + dy * reach };
        }
    }
    return undefined;
}

/** Whether every point of the straight line from `from` to `to` is ground the animal may walk. */
export function straightRunIsClear(from: Point, to: Point, walkable: (x: number, y: number) => boolean): boolean {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / RUN_SAMPLE_PX));
    for (let step = 1; step <= steps; step++) {
        const ratio = step / steps;
        if (!walkable(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)) return false;
    }
    return true;
}
