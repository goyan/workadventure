/** Space kept between the weather board and the bottom of the window (px). */
export const BOARD_BOTTOM_MARGIN_PX = 12;
/**
 * The least height the weather board is read in (px): its header and a card or two. With less room left under the
 * panels above it (two weather cards unfolded, the disasters), it opens over them instead, right under the clock line.
 */
export const BOARD_MIN_HEIGHT_PX = 240;
/** The least height of the board laid over the panels, on the smallest windows (px). */
const BOARD_SMALLEST_HEIGHT_PX = 120;

/** Where the weather board goes and how high it may be. */
export type WeatherBoardFit =
    /** In its place in the column, at most this high. */
    | { overlay: false; maxHeight: number }
    /** Over the panels below the clock line, from `top` (px from the top of the window), at most this high. */
    | { overlay: true; top: number; maxHeight: number };

/**
 * How the weather board fits in the window: in its place while the room left under it down to the bottom of the
 * window is at least BOARD_MIN_HEIGHT_PX, its height then that room; else laid over the panels from `overlayTop` (the
 * bottom of the clock line), down to the bottom of the window. Never past the bottom of the window but on a window too
 * small for even BOARD_SMALLEST_HEIGHT_PX.
 *
 * @param viewportHeight the height of the window (px)
 * @param inlineTop the top of the board in its place (px from the top of the window)
 * @param overlayTop the top of the board laid over the panels (px from the top of the window)
 */
export function weatherBoardFit(viewportHeight: number, inlineTop: number, overlayTop: number): WeatherBoardFit {
    const room = Math.floor(viewportHeight - inlineTop - BOARD_BOTTOM_MARGIN_PX);
    if (room >= BOARD_MIN_HEIGHT_PX) return { overlay: false, maxHeight: room };
    const top = Math.max(0, Math.round(overlayTop));
    const overlayRoom = Math.floor(viewportHeight - top - BOARD_BOTTOM_MARGIN_PX);
    return { overlay: true, top, maxHeight: Math.max(BOARD_SMALLEST_HEIGHT_PX, overlayRoom) };
}
