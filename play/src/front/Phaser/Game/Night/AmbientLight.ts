import { isAtAreaLevel } from "@workadventure/map-editor";
import type { LitArea, NightRect } from "./NightLights";

interface Point {
    x: number;
    y: number;
}

/** Below this, the bounced light of a room is not drawn at all. */
const AMBIENT_MIN = 0.01;

/** The settings of the bounced light, each player's own. */
export interface AmbienceSettings {
    /** The most of the night veil the bounced light takes away, from 0 (none) to 1. */
    strength: number;
    /** The share of the surface of a room that must be lit directly for the bounced light to be at its strongest. */
    fullShare: number;
}

/** A light as the bounced light reads it: the shape it reaches on the map, how strong it is, and its floor. */
export interface AmbientSource {
    polygon?: readonly Point[];
    /** From 0 to 1, full when unset. */
    intensity?: number;
    elevation?: number;
}

type Side = (point: Point) => number;

/** Keeps the part of a shape on the positive side of a line (Sutherland-Hodgman, one edge of the rectangle). */
function clipAgainst(points: readonly Point[], side: Side): Point[] {
    const kept: Point[] = [];
    for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        const fromIn = side(from);
        const toIn = side(to);
        if (fromIn >= 0) {
            kept.push(from);
        }
        if (fromIn >= 0 !== toIn >= 0) {
            const ratio = fromIn / (fromIn - toIn);
            kept.push({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
        }
    }
    return kept;
}

/**
 * The surface of the part of a shape that lies in a rectangle, in square pixels. The shape need not be convex (a light
 * cut by walls is not): the edges the clipping adds along the rectangle cancel out in the signed surface.
 */
export function clippedArea(polygon: readonly Point[], rect: Pick<NightRect, "x" | "y" | "width" | "height">): number {
    if (polygon.length < 3) {
        return 0;
    }
    let points: Point[] = [...polygon];
    const sides: Side[] = [
        (point) => point.x - rect.x,
        (point) => rect.x + rect.width - point.x,
        (point) => point.y - rect.y,
        (point) => rect.y + rect.height - point.y,
    ];
    for (const side of sides) {
        points = clipAgainst(points, side);
        if (points.length < 3) {
            return 0;
        }
    }
    let doubled = 0;
    for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        doubled += from.x * to.y - to.x * from.y;
    }
    return Math.abs(doubled) / 2;
}

/**
 * The light bounced around the rooms: a room a light comes into (through a door, from a lamp in a corner) is lit
 * faintly all over, as the floor and the walls it falls on send some of it back. Each room is lit by the share of its
 * surface the lights reach directly, each by its strength: at its strongest (`strength` of the veil) once `fullShare`
 * of the room is lit. Returns the areas to cut out of the night veil.
 */
export function roomAmbience(
    rooms: readonly (NightRect & { id: string })[],
    lights: readonly AmbientSource[],
    settings: AmbienceSettings,
): LitArea[] {
    const strength = Math.min(1, settings.strength);
    if (!(strength > 0)) {
        return [];
    }
    const fullShare = Math.max(0.001, settings.fullShare);
    const lit: LitArea[] = [];
    for (const room of rooms) {
        const surface = room.width * room.height;
        if (surface <= 0) {
            continue;
        }
        let reached = 0;
        for (const light of lights) {
            if (light.polygon && isAtAreaLevel(room, light.elevation ?? 0)) {
                reached += clippedArea(light.polygon, room) * Math.min(1, Math.max(0, light.intensity ?? 1));
            }
        }
        const intensity = strength * Math.min(1, reached / surface / fullShare);
        if (intensity >= AMBIENT_MIN) {
            lit.push({ ...room, id: `ambient:${room.id}`, intensity });
        }
    }
    return lit;
}
