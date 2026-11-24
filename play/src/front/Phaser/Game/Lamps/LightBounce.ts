import { lightFalloff, type LightCone, type Point } from "./RgbLampGeometry";

/** A light sent back by a wall: a half-turn in front of the wall, with its own strength (0 to 1). */
export interface BounceSource extends LightCone {
    intensity: number;
}

/** Each light sends back at most this many lights, from the walls it lights most. */
export const MAX_BOUNCES_PER_LIGHT = 6;
/** And, when asked, at most this many more from the walls those first ones light (a second bounce). */
export const MAX_SECOND_BOUNCES_PER_LIGHT = 4;
/** A lit stretch of wall longer than this sends back several lights, one per such length. */
const BOUNCE_STRETCH_PX = 128;
/** A stretch of wall shorter than this sends nothing back. */
const MIN_STRETCH_PX = 8;
/** A stretch this long sends back all it can; a shorter one in proportion. */
const FULL_STRETCH_PX = 64;
/** The reach of a light sent back, in map pixels: between 2 and 5 tiles, growing with the stretch of wall. */
const MIN_REACH_PX = 64;
const MAX_REACH_PX = 160;
/** The light sent back starts this far in front of the wall, so that the wall itself does not stop it. */
const IN_FRONT_PX = 4;
/** Whether an edge of the lit shape lies along the ray that drew it (the side of a shadow, of a beam): not a wall. */
const RADIAL_SINE = 0.2;

interface Stretch {
    from: Point;
    to: Point;
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The edges of the lit shape that lie on a wall: both ends stopped short of the reach, and not along a ray. */
function wallEdges(light: LightCone, polygon: readonly Point[]): Stretch[] {
    const stopped = (point: Point): boolean => {
        const far = distance(light, point);
        return far > 1 && far < light.radius - 1;
    };
    const edges: Stretch[] = [];
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        const length = distance(from, to);
        if (length < 1e-6 || !stopped(from) || !stopped(to)) {
            continue;
        }
        const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const far = distance(light, middle);
        const sine = Math.abs((to.x - from.x) * (middle.y - light.y) - (to.y - from.y) * (middle.x - light.x));
        if (sine / (length * far) >= RADIAL_SINE) {
            edges.push({ from, to });
        }
    }
    return edges;
}

/** Joins the edges that follow each other along the same wall (the rays cut a wall into many). */
function joined(edges: readonly Stretch[]): Stretch[] {
    const stretches: Stretch[] = [];
    for (const edge of edges) {
        const last = stretches[stretches.length - 1];
        if (last && distance(last.to, edge.from) < 0.5) {
            const cross =
                (last.to.x - last.from.x) * (edge.to.y - edge.from.y) -
                (last.to.y - last.from.y) * (edge.to.x - edge.from.x);
            if (Math.abs(cross) <= 0.02 * distance(last.from, last.to) * distance(edge.from, edge.to)) {
                last.to = edge.to;
                continue;
            }
        }
        stretches.push({ from: edge.from, to: edge.to });
    }
    return stretches;
}

/**
 * The lights the walls send back (one bounce): for each stretch of wall the light falls on, a half-turn of light just
 * in front of it, facing away from the wall, as strong as the light is there and as the stretch is long. With them a
 * light turns the corner of a door: the wall it falls on lights what the lamp itself cannot see. `polygon` is what
 * the light reaches (see litPolygon), `strength` the share sent back (0: none). The strongest come first.
 */
export function bounceSources(light: LightCone, polygon: readonly Point[], strength: number): BounceSource[] {
    if (!(strength > 0) || polygon.length < 3) {
        return [];
    }
    const bounces: BounceSource[] = [];
    for (const stretch of joined(wallEdges(light, polygon))) {
        const length = distance(stretch.from, stretch.to);
        if (length < MIN_STRETCH_PX) {
            continue;
        }
        const parts = Math.ceil(length / BOUNCE_STRETCH_PX);
        const partLength = length / parts;
        for (let part = 0; part < parts; part++) {
            const along = (part + 0.5) / parts;
            const middle = {
                x: stretch.from.x + (stretch.to.x - stretch.from.x) * along,
                y: stretch.from.y + (stretch.to.y - stretch.from.y) * along,
            };
            // The side of the wall the lamp is on.
            let nx = -(stretch.to.y - stretch.from.y) / length;
            let ny = (stretch.to.x - stretch.from.x) / length;
            if (nx * (light.x - middle.x) + ny * (light.y - middle.y) < 0) {
                nx = -nx;
                ny = -ny;
            }
            const intensity =
                Math.min(1, strength) *
                lightFalloff(distance(light, middle) / light.radius) *
                Math.min(1, partLength / FULL_STRETCH_PX);
            if (intensity <= 0.01) {
                continue;
            }
            bounces.push({
                x: middle.x + nx * IN_FRONT_PX,
                y: middle.y + ny * IN_FRONT_PX,
                radius: Math.min(MAX_REACH_PX, Math.max(MIN_REACH_PX, partLength * 1.5)),
                direction: (Math.atan2(ny, nx) * 180) / Math.PI,
                angle: 180,
                intensity,
            });
        }
    }
    return bounces.sort((a, b) => b.intensity - a.intensity).slice(0, MAX_BOUNCES_PER_LIGHT);
}

/**
 * The lights sent back a second time: from the walls the first bounces of a lamp light (each given with what it
 * reaches). Each is as strong as the bounce it comes from, times what a wall sends back: a share of a share. The
 * strongest few of the whole lamp are kept, strongest first.
 */
export function secondBounceSources(
    first: readonly { source: BounceSource; polygon: readonly Point[] }[],
    strength: number,
): BounceSource[] {
    if (!(strength > 0)) {
        return [];
    }
    const second: BounceSource[] = [];
    for (const { source, polygon } of first) {
        for (const bounce of bounceSources(source, polygon, strength)) {
            const intensity = bounce.intensity * source.intensity;
            if (intensity > 0.01) {
                second.push({ ...bounce, intensity });
            }
        }
    }
    return second.sort((a, b) => b.intensity - a.intensity).slice(0, MAX_SECOND_BOUNCES_PER_LIGHT);
}
