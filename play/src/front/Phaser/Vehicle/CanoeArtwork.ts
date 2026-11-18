import type { VehicleColors } from "./Vehicle";
import type { SKATEBOARD_LAYERS } from "./SkateboardArtwork";
import { VEHICLE_FRAME_SIZE, VEHICLE_DIRECTIONS } from "./VehicleFrames";

type CanoeLayer = (typeof SKATEBOARD_LAYERS)[number];

/**
 * A canoe seen from above, pointed at both ends, turned to its heading; seen from the side when it goes left or
 * right. Its paint parts are those of the other vehicles: `color` is the hull, `edgeColor` its rim, `wheelsColor`
 * the blades of the paddle, which dips on one side then the other as it moves (`phase`).
 */
export function drawCanoe(
    context: CanvasRenderingContext2D,
    heading: number,
    phase: number,
    colors: VehicleColors,
    layer?: CanoeLayer,
): void {
    const side = heading === 2 || heading === 6;
    context.save();
    context.imageSmoothingEnabled = false;
    if (!side) context.rotate((heading * Math.PI) / 4);
    const paint = (part: CanoeLayer, color: string, draw: () => void): void => {
        if (layer && part !== layer) return;
        context.fillStyle = layer && part !== "outline" && part !== "details" ? "#ffffff" : color;
        draw();
    };
    // The hull as rows (top view, bow up) or columns (side view), narrower towards its ends.
    const hull = (inset: number): void => {
        if (side) {
            context.fillRect(-18 + inset, 1, 36 - inset * 2, 6 - inset);
            context.fillRect(-21 + inset, -1, 5, 5 - inset);
            context.fillRect(16 - inset, -1, 5, 5 - inset);
            context.fillRect(-15 + inset, 6, 30 - inset * 2, 2 - inset);
        } else {
            const widths = [2, 4, 6, 7, 8, 8, 8, 8, 8, 8, 8, 7, 6, 4, 2];
            widths.forEach((half, index) => {
                const reach = Math.max(1, half - inset);
                const y = -22 + index * 3 + (index === 0 ? inset : 0);
                context.fillRect(-reach, y, reach * 2, 3 - (index === widths.length - 1 ? inset : 0));
            });
        }
    };
    paint("outline", "#20232b", () => hull(0));
    paint("edgeColor", colors.edgeColor, () => hull(1));
    paint("color", colors.color, () => {
        if (side) context.fillRect(-16, 3, 32, 3);
        else hull(3);
    });
    // The paddle: across the canoe, one blade in the water, on the left then on the right.
    const left = phase % 4 < 2;
    paint("outline", "#20232b", () => {
        if (side) context.fillRect(left ? -9 : 6, -6, 3, 14);
        else context.fillRect(-15, -2, 30, 3);
    });
    paint("details", "#c9a26b", () => {
        if (side) context.fillRect(left ? -8 : 7, -5, 1, 9);
        else context.fillRect(-11, -1, 22, 1);
    });
    paint("wheelsColor", colors.wheelsColor, () => {
        if (side) context.fillRect(left ? -9 : 6, 4, 3, 4);
        else {
            context.fillRect(left ? -15 : 11, -2, 4, 3);
            context.fillRect(left ? 12 : -14, -1, 2, 1);
        }
    });
    paint("details", "#ffffff", () => {
        // A ripple at the blade in the water.
        context.globalAlpha = 0.6;
        if (side) context.fillRect(left ? -12 : 3, 8, 9, 1);
        else context.fillRect(left ? -19 : 15, phase % 2 === 0 ? -3 : 0, 4, 1);
        context.globalAlpha = 0.22;
        if (side) context.fillRect(-15, 2, 30, 1);
        else context.fillRect(-2, -16, 1, 32);
        context.globalAlpha = 1;
    });
    context.restore();
}

export function createCanoeSheet(colors: VehicleColors, layer?: CanoeLayer): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = VEHICLE_FRAME_SIZE * VEHICLE_DIRECTIONS;
    canvas.height = VEHICLE_FRAME_SIZE * 4;
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    for (let phase = 0; phase < 4; phase++)
        for (let heading = 0; heading < VEHICLE_DIRECTIONS; heading++) {
            context.save();
            context.translate(
                heading * VEHICLE_FRAME_SIZE + VEHICLE_FRAME_SIZE / 2,
                phase * VEHICLE_FRAME_SIZE + VEHICLE_FRAME_SIZE / 2,
            );
            drawCanoe(context, heading, phase, colors, layer);
            context.restore();
        }
    return canvas;
}
