/**
 * The own-avatar wheel drawn in pixels, like the objects of the map: a grid of cells scaled up without smoothing, so
 * the ring and its sectors have stepped edges. The first sector is at the top, the others follow clockwise.
 */
export const WHEEL_GRID = 100;
/** Radius of the ring, of its hole, and of the disc in the center (the avatar), in cells. */
const OUTER_RADIUS = 48;
const INNER_RADIUS = 22;
const CENTER_RADIUS = 17;
/** Width of the empty line between two sectors, in cells. */
const SECTOR_GAP = 0.9;

export type WheelCell =
    | { kind: "empty" }
    /** Inside the wheel, between the sectors or around the center: dark, so the map does not show through. */
    | { kind: "gap" }
    | { kind: "center"; edge: boolean }
    | { kind: "sector"; index: number; edge: boolean };

type BaseCell = { kind: "empty" } | { kind: "gap" } | { kind: "center" } | { kind: "sector"; index: number };

function baseCell(x: number, y: number, sectors: number): BaseCell {
    const dx = x + 0.5 - WHEEL_GRID / 2;
    const dy = y + 0.5 - WHEEL_GRID / 2;
    const radius = Math.hypot(dx, dy);
    if (radius <= CENTER_RADIUS) return { kind: "center" };
    if (radius > OUTER_RADIUS) return { kind: "empty" };
    if (radius < INNER_RADIUS || sectors < 1) return { kind: "gap" };
    if (sectors === 1) return { kind: "sector", index: 0 };
    const step = (Math.PI * 2) / sectors;
    // From the top, clockwise; the first sector is centered on the top.
    const angle = (Math.atan2(dx, -dy) + Math.PI * 2 + step / 2) % (Math.PI * 2);
    const inSector = angle % step;
    if (Math.min(inSector, step - inSector) * radius < SECTOR_GAP / 2) return { kind: "gap" };
    return { kind: "sector", index: Math.floor(angle / step) % sectors };
}

function sameCell(a: BaseCell, b: BaseCell): boolean {
    return a.kind === b.kind && (a.kind !== "sector" || (b.kind === "sector" && a.index === b.index));
}

/** What the cell (x, y) of the grid shows; `edge` marks the outline, the cells next to something else. */
export function wheelCell(x: number, y: number, sectors: number): WheelCell {
    const cell = baseCell(x, y, sectors);
    if (cell.kind === "empty" || cell.kind === "gap") return cell;
    const edge = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
    ].some(([nx, ny]) => !sameCell(cell, baseCell(nx, ny, sectors)));
    return { ...cell, edge };
}
