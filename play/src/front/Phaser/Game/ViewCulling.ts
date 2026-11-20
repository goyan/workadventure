/** What stands this far out of the view (map pixels) is still drawn: an outline, a lean in the wind reach past an image. */
export const VIEW_CULL_MARGIN_PX = 64;

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface View {
    x: number;
    y: number;
    right: number;
    bottom: number;
}

/**
 * Whether an image of the map (its top left corner and its size) reaches into the part of the map a camera shows,
 * with a margin. Phaser draws every object of a scene, on screen or not: on a map of thousands of objects seen
 * from close, nearly all of them are out of the view and still cost their drawing.
 */
export function reachesView(box: Box, view: View, margin = VIEW_CULL_MARGIN_PX): boolean {
    return (
        box.x <= view.right + margin &&
        box.x + box.width >= view.x - margin &&
        box.y <= view.bottom + margin &&
        box.y + box.height >= view.y - margin
    );
}
