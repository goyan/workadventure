import { PathTileType } from "../../../Utils/PathfindingManager";

export interface Point {
    x: number;
    y: number;
}

/** Something that stops the light: a line from a to b, in map pixels. */
export interface Segment {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}

/** Where a light is and how far it reaches, in map pixels. */
export interface LightDisc {
    x: number;
    y: number;
    radius: number;
}

/**
 * A light and the cone it shines in: `direction` in degrees, clockwise on the screen from the east (90: downwards),
 * `angle` the opening of the cone in degrees (360 and more: all around).
 */
export interface LightCone extends LightDisc {
    direction: number;
    angle: number;
}

/** With nothing in the way, the edge of the light is drawn as a point every so many degrees at most. */
const FAN_STEP = (5 * Math.PI) / 180;
/** A ray is sent just before and just after every end of a segment, to see what lies behind its corner. */
const CORNER_OFFSET = 1e-4;
/** A ray that passes exactly through the point where two segments meet is stopped by them, rounding included. */
const END_TOLERANCE = 1e-9;
/** A segment the light stands on (a lamp hung on a wall) does not stop it: the light shines on both sides. */
const ON_SEGMENT_PX = 1e-6;

/**
 * The sides of the blocking cells of a collision grid, around a light: only the sides between a wall
 * (`PathTileType.Collider`) and a cell that is not one, the sides in a row merged into one segment. An exit, a start
 * or a cell weighted for the pathfinder is not a wall. The cell the light stands in never blocks: a lamp hung on a
 * wall still shines.
 */
export function blockingCellSegments(
    grid: readonly (readonly number[])[],
    tileSize: number,
    light: LightDisc,
): Segment[] {
    const sourceX = Math.floor(light.x / tileSize);
    const sourceY = Math.floor(light.y / tileSize);
    const blocks = (x: number, y: number): boolean =>
        grid[y]?.[x] === PathTileType.Collider && !(x === sourceX && y === sourceY);
    const width = grid.reduce((longest, row) => Math.max(longest, row.length), 0);
    const firstX = Math.max(0, Math.floor((light.x - light.radius) / tileSize));
    const lastX = Math.min(width - 1, Math.floor((light.x + light.radius) / tileSize));
    const firstY = Math.max(0, Math.floor((light.y - light.radius) / tileSize));
    const lastY = Math.min(grid.length - 1, Math.floor((light.y + light.radius) / tileSize));

    const segments: Segment[] = [];
    // Horizontal sides, on the line above each row (and under the last one).
    for (let y = firstY; y <= lastY + 1; y++) {
        let start: number | undefined;
        for (let x = firstX; x <= lastX + 1; x++) {
            const side = x <= lastX && blocks(x, y - 1) !== blocks(x, y);
            if (side && start === undefined) {
                start = x;
            } else if (!side && start !== undefined) {
                segments.push({ ax: start * tileSize, ay: y * tileSize, bx: x * tileSize, by: y * tileSize });
                start = undefined;
            }
        }
    }
    // Vertical sides, on the line left of each column (and right of the last one).
    for (let x = firstX; x <= lastX + 1; x++) {
        let start: number | undefined;
        for (let y = firstY; y <= lastY + 1; y++) {
            const side = y <= lastY && blocks(x - 1, y) !== blocks(x, y);
            if (side && start === undefined) {
                start = y;
            } else if (!side && start !== undefined) {
                segments.push({ ax: x * tileSize, ay: start * tileSize, bx: x * tileSize, by: y * tileSize });
                start = undefined;
            }
        }
    }
    return segments;
}

/** The four sides of a rectangle (a tall object). */
export function rectangleSegments(rectangle: { x: number; y: number; width: number; height: number }): Segment[] {
    const { x, y } = rectangle;
    const right = x + rectangle.width;
    const bottom = y + rectangle.height;
    return [
        { ax: x, ay: y, bx: right, by: y },
        { ax: x, ay: bottom, bx: right, by: bottom },
        { ax: x, ay: y, bx: x, by: bottom },
        { ax: right, ay: y, bx: right, by: bottom },
    ];
}

/** The segments that touch the disc of a light: the others cannot change what it lights. */
export function segmentsNearLight(segments: readonly Segment[], light: LightDisc): Segment[] {
    const reach = light.radius * light.radius;
    return segments.filter((segment) => {
        const ex = segment.bx - segment.ax;
        const ey = segment.by - segment.ay;
        const length = ex * ex + ey * ey;
        // The point of the segment closest to the light.
        const along =
            length === 0
                ? 0
                : Math.min(1, Math.max(0, ((light.x - segment.ax) * ex + (light.y - segment.ay) * ey) / length));
        const dx = segment.ax + along * ex - light.x;
        const dy = segment.ay + along * ey - light.y;
        return dx * dx + dy * dy <= reach;
    });
}

/** An angle brought back between -PI (excluded) and PI. */
function wrap(angle: number): number {
    const turn = 2 * Math.PI;
    const wrapped = angle - turn * Math.floor((angle + Math.PI) / turn);
    return wrapped <= -Math.PI ? wrapped + turn : wrapped;
}

/**
 * What a light reaches, as a polygon in map pixels: 2D visibility by ray casting. A ray goes to each end of each
 * segment and just beside it, and at regular steps for the round edge; each stops on the closest segment, or at the
 * reach of the light. The points come in the order of their angle; a cone narrower than a full turn starts at the
 * light itself. The polygon is seen whole from the light: it can be filled as it is, even when it is not convex.
 */
export function litPolygon(light: LightCone, segments: readonly Segment[]): Point[] {
    const full = light.angle >= 360;
    const half = full ? Math.PI : (light.angle * Math.PI) / 360;
    const direction = (light.direction * Math.PI) / 180;

    // Angles of the rays, relative to the direction of the cone: no jump to sort across.
    const angles: number[] = [];
    const steps = Math.ceil((2 * half) / FAN_STEP);
    for (let step = 0; step < (full ? steps : steps + 1); step++) {
        angles.push(-half + (step * 2 * half) / steps);
    }
    for (const segment of segments) {
        for (const [x, y] of [
            [segment.ax, segment.ay],
            [segment.bx, segment.by],
        ]) {
            const toEnd = wrap(Math.atan2(y - light.y, x - light.x) - direction);
            for (const offset of [-CORNER_OFFSET, 0, CORNER_OFFSET]) {
                const angle = full ? wrap(toEnd + offset) : toEnd + offset;
                if (full || Math.abs(angle) <= half) {
                    angles.push(angle);
                }
            }
        }
    }
    angles.sort((a, b) => a - b);

    const polygon: Point[] = full ? [] : [{ x: light.x, y: light.y }];
    for (const angle of angles) {
        const dx = Math.cos(direction + angle);
        const dy = Math.sin(direction + angle);
        let distance = light.radius;
        for (const segment of segments) {
            const ex = segment.bx - segment.ax;
            const ey = segment.by - segment.ay;
            const cross = dx * ey - dy * ex;
            if (Math.abs(cross) < 1e-12) {
                // The ray runs along the segment: it does not stop on it.
                continue;
            }
            const ox = segment.ax - light.x;
            const oy = segment.ay - light.y;
            const alongRay = (ox * ey - oy * ex) / cross;
            const alongSegment = (ox * dy - oy * dx) / cross;
            if (
                alongRay > ON_SEGMENT_PX &&
                alongRay < distance &&
                alongSegment >= -END_TOLERANCE &&
                alongSegment <= 1 + END_TOLERANCE
            ) {
                distance = alongRay;
            }
        }
        polygon.push({ x: light.x + dx * distance, y: light.y + dy * distance });
    }
    return polygon;
}

/**
 * How strong the light is at a distance from the lamp, from 0 (at the lamp) to 1 (the end of its reach): full at the
 * lamp, nothing at the end, with no visible ring where it stops.
 */
export function lightFalloff(distance: number): number {
    const t = Math.min(1, Math.max(0, distance));
    return (1 - t * t) ** 2;
}

/** Where the ray from the light at `angle` (radians) crosses the side from a to b; the closer end when it does not. */
function rayOnSide(light: Point, angle: number, a: Point, b: Point): Point {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const cross = dx * ey - dy * ex;
    const ox = a.x - light.x;
    const oy = a.y - light.y;
    const along = Math.abs(cross) < 1e-12 ? -1 : (ox * ey - oy * ex) / cross;
    if (along < 0) {
        const closer = Math.hypot(ox, oy) <= Math.hypot(b.x - light.x, b.y - light.y) ? a : b;
        return { x: closer.x, y: closer.y };
    }
    return { x: light.x + dx * along, y: light.y + dy * along };
}

/**
 * The part of a full turn of light (litPolygon with an angle of 360) that a cone lights: the same polygon as
 * litPolygon(cone), shadows included, without casting a single ray. A turning lamp casts its full turn once, when the
 * lamp or an obstacle moves, then cuts its cone out of it as it turns, at every image. The full turn is seen whole
 * from the light, its points in the order of their angle: the cone keeps the points between its two edges, and adds
 * where each edge crosses the side of the full turn it falls on.
 */
export function coneOfLitPolygon(fullTurn: readonly Point[], cone: LightCone): readonly Point[] {
    if (cone.angle >= 360 || fullTurn.length < 3) {
        return fullTurn;
    }
    const turn = 2 * Math.PI;
    const span = (cone.angle * Math.PI) / 180;
    const start = (cone.direction * Math.PI) / 180 - span / 2;
    // The angle of each point from the first edge of the cone, from 0 to a full turn.
    const from = fullTurn.map((point) => {
        const angle = Math.atan2(point.y - cone.y, point.x - cone.x) - start;
        return angle - turn * Math.floor(angle / turn);
    });
    // The first point past the first edge: the points come in the order of their angle, from there on.
    let first = 0;
    for (let index = 1; index < from.length; index++) {
        if (from[index] < from[first]) {
            first = index;
        }
    }
    const count = fullTurn.length;
    const at = (index: number): Point => fullTurn[(index + count) % count];
    const polygon: Point[] = [{ x: cone.x, y: cone.y }, rayOnSide(cone, start, at(first - 1), at(first))];
    let last = first - 1;
    for (let step = 0; step < count; step++) {
        const index = (first + step) % count;
        if (from[index] > span) {
            break;
        }
        polygon.push({ x: fullTurn[index].x, y: fullTurn[index].y });
        last = first + step;
    }
    polygon.push(rayOnSide(cone, start + span, at(last), at(last + 1)));
    return polygon;
}
