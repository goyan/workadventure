import type { VehicleColors } from "./Vehicle";
import { VEHICLE_FRAME_SIZE, VEHICLE_DIRECTIONS } from "./VehicleFrames";

export const SKATEBOARD_LAYERS = ["outline", "edgeColor", "color", "wheelsColor", "details"] as const;
type BoardLayer = (typeof SKATEBOARD_LAYERS)[number];

/** Native pixel art matches the avatar grid; each paint part has a shared tint mask. */
export function drawSkateboard(
    context: CanvasRenderingContext2D,
    heading: number,
    phase: number,
    colors: VehicleColors,
    layer?: BoardLayer,
): void {
    const side = heading === 2 || heading === 6;
    context.save();
    context.imageSmoothingEnabled = false;
    if (!side) context.rotate((heading * Math.PI) / 4);
    const paint = (part: BoardLayer, color: string, draw: () => void): void => {
        if (layer && part !== layer) return;
        context.fillStyle = layer && part !== "outline" && part !== "details" ? "#ffffff" : color;
        draw();
    };
    const board = (inset: number): void => {
        if (side) {
            context.fillRect(-12 + inset, -1, 24 - inset * 2, 3);
            context.fillRect(-13 + inset, -3, 3, 3);
            context.fillRect(10 - inset, -3, 3, 3);
        } else {
            context.fillRect(-5 + inset, -9, 10 - inset * 2, 18);
            context.fillRect(-4 + inset, -11, 8 - inset * 2, 22);
            context.fillRect(-2, -12 + inset, 4, 24 - inset * 2);
        }
    };
    const wheels = side
        ? [
              [-9, 4],
              [8, 4],
          ]
        : [
              [-6, -7],
              [5, -7],
              [-6, 6],
              [5, 6],
          ];
    const wheel = (x: number, y: number, radius: number): void => {
        context.fillRect(x - radius + 1, y - radius, radius * 2 - 2, radius * 2);
        context.fillRect(x - radius, y - radius + 1, radius * 2, radius * 2 - 2);
    };
    paint("outline", "#20232b", () => {
        board(0);
        for (const [x, y] of wheels) {
            if (side) context.fillRect(x - 1, 1, 2, 3);
            wheel(x, y, 3);
        }
    });
    paint("edgeColor", colors.edgeColor, () => board(1));
    paint("color", colors.color, () => {
        if (side) context.fillRect(-10, -1, 20, 1);
        else {
            context.fillRect(-3, -9, 6, 18);
            context.fillRect(-2, -10, 4, 20);
        }
    });
    paint("wheelsColor", colors.wheelsColor, () => {
        for (const [x, y] of wheels) wheel(x, y, 2);
    });
    paint("details", "#d0d2d6", () => {
        for (const [x, y] of wheels) {
            if (side) {
                context.fillRect(x, y, 1, 1);
                const spoke = [
                    [0, -2],
                    [1, -1],
                    [1, 1],
                    [-1, 1],
                ][phase % 4];
                context.fillRect(x + spoke[0], y + spoke[1], 1, 1);
            } else context.fillRect(x, y + (phase % 2 === 0 ? -1 : 0), 1, 1);
        }
        if (!side)
            for (const y of [-7, 6]) {
                context.fillRect(-2, y, 1, 1);
                context.fillRect(1, y, 1, 1);
            }
    });
    paint("details", "#ffffff", () => {
        context.globalAlpha = 0.22;
        if (side) context.fillRect(-9, 0, 18, 1);
        else context.fillRect(-3, -8, 1, 16);
        context.globalAlpha = 1;
    });
    paint("details", "#20232b", () => {
        context.globalAlpha = 0.35;
        if (side) context.fillRect(-10, 1, 20, 1);
        else context.fillRect(3, -8, 1, 16);
        context.globalAlpha = 1;
    });
    context.restore();
}

export function createSkateboardSheet(colors: VehicleColors, layer?: BoardLayer): HTMLCanvasElement {
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
            drawSkateboard(context, heading, phase, colors, layer);
            context.restore();
        }
    return canvas;
}
