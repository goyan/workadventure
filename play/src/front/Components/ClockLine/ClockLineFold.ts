/** Space kept between a popover and the edges of the window (px). */
export const POPOVER_EDGE_PX = 8;
/** Space between a chip and the popover it opens, under it (px: the `mt-2` of the popover). */
export const POPOVER_GAP_PX = 8;
/** Space kept between a popover and the bottom of the window (px). */
export const POPOVER_BOTTOM_PX = 12;
/** The least height of a popover, on the smallest windows: it then scrolls inside (px). */
export const POPOVER_MIN_HEIGHT_PX = 120;

/**
 * How the chips of the clock line (Catastrophes, Visualisation) are drawn:
 * - "labels": an icon and a short label each, on the clock line;
 * - "icons": an icon each, on the clock line, when their labels would not fit there;
 * - "own-row": even their icons would not fit beside the weather, the floors and the clock: they go to a row of their
 *   own under the clock line, with their labels (they have the room there).
 */
export type ChipsFold = "labels" | "icons" | "own-row";

/** What the fold of the chips is decided on, in px. */
export interface ChipsRoom {
    /** The width the clock line may take: that of the main layout, less its margins. */
    room: number;
    /** The width of the other items of the clock line (weather, floors, clock), with the gaps between them. */
    others: number;
    /** The width of the chips with their labels, and with their icons only. */
    labelled: number;
    iconsOnly: number;
    /** The gap between the chips and the item next to them. */
    gap: number;
    /** Whether the clock line is a column (narrow layouts): the chips then have a line of their own anyway. */
    column: boolean;
}

/**
 * The labels first, then the icons alone, then a row of their own: the clock and the other items of the line never
 * move or leave the window for the chips.
 */
export function chipsFold({ room, others, labelled, iconsOnly, gap, column }: ChipsRoom): ChipsFold {
    if (column) return labelled <= room ? "labels" : "icons";
    if (others + gap + labelled <= room) return "labels";
    if (others + gap + iconsOnly <= room) return "icons";
    return "own-row";
}

/** A box on the page, in px from the top left corner of the window. */
export interface Box {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Where a popover opens under its chip, and how large it may be. */
export interface PopoverPlacement {
    /** From the left edge of the chip (px): negative when the popover is moved left to stay in the window. */
    left: number;
    /** From the top edge of the chip (px). */
    top: number;
    maxWidth: number;
    maxHeight: number;
}

/**
 * A popover opens under its chip, its left edge on the chip's, moved left as needed to stay in the window (its right
 * edge never past it, its left edge never before it); under the other items of the clock line it would otherwise lay
 * over (the second line of the floors, taller than the chips); at most as wide as the window and as high as the room
 * left under it, the rest scrolled inside.
 *
 * @param chip the chip
 * @param width the width of the popover (px)
 * @param viewport the size of the window (px)
 * @param neighbours the other items of the clock line
 */
export function popoverPlacement(
    chip: Box,
    width: number,
    viewport: { width: number; height: number },
    neighbours: readonly Box[] = [],
): PopoverPlacement {
    const maxWidth = Math.max(0, viewport.width - 2 * POPOVER_EDGE_PX);
    const shown = Math.min(width, maxWidth);
    let left = 0;
    const overflow = chip.left + shown - (viewport.width - POPOVER_EDGE_PX);
    if (overflow > 0) left = -overflow;
    if (chip.left + left < POPOVER_EDGE_PX) left = POPOVER_EDGE_PX - chip.left;
    const span = { left: chip.left + left, right: chip.left + left + shown };
    // The items on the row of the chip that the popover would cover: it opens under the lowest of them.
    let under = chip.bottom;
    for (const item of neighbours) {
        const sameRow = item.top < chip.bottom && item.bottom > chip.top;
        const overlaps = item.right > span.left && item.left < span.right;
        if (sameRow && overlaps) under = Math.max(under, item.bottom);
    }
    const room = viewport.height - under - POPOVER_GAP_PX - POPOVER_BOTTOM_PX;
    return {
        left: Math.round(left),
        top: Math.round(under - chip.top + POPOVER_GAP_PX),
        maxWidth,
        maxHeight: Math.max(POPOVER_MIN_HEIGHT_PX, Math.floor(room)),
    };
}
