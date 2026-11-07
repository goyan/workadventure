interface Point {
    x: number;
    y: number;
}

/**
 * Cuts a walk so that it ends `distance` pixels from the target, on the path itself (already checked walkable): going
 * to a colleague stops next to them instead of on top of them. A path ending farther away (the target was not
 * reachable) is kept; a start already that close leaves only the start.
 */
export function stopShortOf(path: readonly Point[], target: Point, distance: number): Point[] {
    const far = (point: Point) => Math.hypot(point.x - target.x, point.y - target.y) >= distance;
    let last = path.length - 1;
    if (last < 0 || far(path[last])) {
        return [...path];
    }
    while (last >= 0 && !far(path[last])) {
        last -= 1;
    }
    if (last < 0) {
        return path.slice(0, 1);
    }
    // On the segment from the last far step to the next one, the point at exactly `distance` from the target.
    const from = path[last];
    const to = path[last + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const fx = from.x - target.x;
    const fy = from.y - target.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - distance * distance;
    const t = (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    const round = (value: number) => Math.round(value * 1000) / 1000;
    return [...path.slice(0, last + 1), { x: round(from.x + t * dx), y: round(from.y + t * dy) }];
}
