import type { VehicleColors } from "./Vehicle";
import { VEHICLE_DIRECTIONS, VEHICLE_FRAME_SIZE } from "./VehicleFrames";
import { SKATEBOARD_LAYERS } from "./SkateboardArtwork";

/** The same paint parts as the skateboard: shell (color), trim and pedals (edgeColor), rim (wheelsColor). */
export const ELECTRIC_UNICYCLE_LAYERS = SKATEBOARD_LAYERS;
type UnicycleLayer = (typeof ELECTRIC_UNICYCLE_LAYERS)[number];

const OUTLINE = "#20232b";
const TYRE = "#2b2e36";

/**
 * An electric unicycle under the avatar's feet (origin): one big wheel, a tall shell between the legs with a handle on
 * top, pedals at the feet. Seen from the side when going left or right (and diagonally), from the front or the back
 * when going down or up. Native pixel art on the avatar grid; each paint part has a shared tint mask.
 */
export function drawElectricUnicycle(
    context: CanvasRenderingContext2D,
    heading: number,
    phase: number,
    colors: VehicleColors,
    layer?: UnicycleLayer,
): void {
    const view = heading === 0 ? "front" : heading === 4 ? "back" : "side";
    context.save();
    context.imageSmoothingEnabled = false;
    // Drawn facing left; going right is the mirror image.
    if (heading >= 5) context.scale(-1, 1);
    const paint = (part: UnicycleLayer, color: string, draw: () => void): void => {
        if (layer && part !== layer) return;
        context.fillStyle = layer && part !== "outline" && part !== "details" ? "#ffffff" : color;
        draw();
    };
    withContext(context, () => {
        if (view === "side") drawSide(paint, phase, colors);
        else drawFrontOrBack(paint, phase, colors, view === "front");
    });
    context.restore();
}

type Paint = (part: UnicycleLayer, color: string, draw: () => void) => void;

function drawSide(paint: Paint, phase: number, colors: VehicleColors): void {
    const wheel = { x: 0, y: 6 };
    paint("outline", OUTLINE, () => {
        disc(wheel.x, wheel.y, 11);
        // Shell, handle and pedal, one pixel larger than their paint.
        chamferedRect(-6, -12, 12, 17);
        rect(-3, -15, 6, 3);
        rect(-8, 3, 9, 3);
    });
    paint("details", TYRE, () => disc(wheel.x, wheel.y, 10));
    paint("wheelsColor", colors.wheelsColor, () => disc(wheel.x, wheel.y, 7));
    // The motor hub fills the wheel: only a ring of rim shows around it.
    paint("details", "#4a4f5a", () => disc(wheel.x, wheel.y, 5));
    paint("details", OUTLINE, () => disc(wheel.x, wheel.y, 1));
    paint("details", "#5b606c", () => {
        // Tread blocks going round: four positions, one per animation phase.
        const tread = [
            [0, -9],
            [7, -6],
            [9, 0],
            [7, 6],
            [0, 9],
            [-7, 6],
            [-9, 0],
            [-7, -6],
        ];
        for (const [index, [x, y]] of tread.entries()) {
            if ((index + phase) % 2 === 0) rect(wheel.x + x, wheel.y + y, 1, 1);
        }
    });
    paint("edgeColor", colors.edgeColor, () => {
        chamferedRect(-5, -11, 10, 15);
        rect(-7, 4, 7, 1);
    });
    paint("color", colors.color, () => chamferedRect(-4, -10, 8, 13));
    paint("details", OUTLINE, () => {
        // The handle's opening, the side pad and the front light.
        rect(-2, -14, 4, 1);
        rect(1, -7, 2, 6);
    });
    paint("details", "#9fd3e6", () => rect(-4, -6, 1, 2));
    paint("details", "#ffffff", () => {
        context().globalAlpha = 0.22;
        rect(-3, -9, 1, 10);
        context().globalAlpha = 1;
    });
}

function drawFrontOrBack(paint: Paint, phase: number, colors: VehicleColors, front: boolean): void {
    paint("outline", OUTLINE, () => {
        // Tyre seen edge on, shell around it, pedals across.
        rect(-4, -2, 8, 18);
        rect(-3, 16, 6, 1);
        chamferedRect(-7, -12, 14, 15);
        rect(-3, -15, 6, 3);
        rect(-11, 1, 22, 3);
    });
    paint("details", TYRE, () => {
        rect(-3, 3, 6, 12);
        rect(-2, 15, 4, 1);
    });
    paint("details", "#5b606c", () => {
        for (let y = 4 + (phase % 2); y < 15; y += 2) rect(-2, y, 4, 1);
    });
    paint("edgeColor", colors.edgeColor, () => {
        chamferedRect(-6, -11, 12, 13);
        rect(-10, 2, 20, 1);
    });
    paint("color", colors.color, () => chamferedRect(-5, -10, 10, 11));
    paint("wheelsColor", colors.wheelsColor, () => {
        rect(-4, 0, 1, 2);
        rect(3, 0, 1, 2);
    });
    paint("details", OUTLINE, () => {
        rect(-2, -14, 4, 1);
        rect(-1, -3, 2, 4);
    });
    // A light at the front, a red one at the back.
    paint("details", front ? "#9fd3e6" : "#c0392b", () => rect(-2, -6, 4, 2));
}

// The drawing helpers paint on the canvas of the drawElectricUnicycle call in progress.
let current: CanvasRenderingContext2D | undefined;
function context(): CanvasRenderingContext2D {
    if (!current) throw new Error("No canvas to draw the electric unicycle on");
    return current;
}
function rect(x: number, y: number, width: number, height: number): void {
    context().fillRect(x, y, width, height);
}
function chamferedRect(x: number, y: number, width: number, height: number): void {
    rect(x + 1, y, width - 2, height);
    rect(x, y + 1, width, height - 2);
}
function disc(cx: number, cy: number, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
        const half = Math.round(Math.sqrt(radius * radius - dy * dy));
        rect(cx - half, cy + dy, half * 2 + 1, 1);
    }
}

function withContext(target: CanvasRenderingContext2D, draw: () => void): void {
    const previous = current;
    current = target;
    try {
        draw();
    } finally {
        current = previous;
    }
}

export function createElectricUnicycleSheet(colors: VehicleColors, layer?: UnicycleLayer): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = VEHICLE_FRAME_SIZE * VEHICLE_DIRECTIONS;
    canvas.height = VEHICLE_FRAME_SIZE * 4;
    const target = canvas.getContext("2d");
    if (!target) return canvas;
    for (let phase = 0; phase < 4; phase++)
        for (let heading = 0; heading < VEHICLE_DIRECTIONS; heading++) {
            target.save();
            target.translate(
                heading * VEHICLE_FRAME_SIZE + VEHICLE_FRAME_SIZE / 2,
                phase * VEHICLE_FRAME_SIZE + VEHICLE_FRAME_SIZE / 2,
            );
            drawElectricUnicycle(target, heading, phase, colors, layer);
            target.restore();
        }
    return canvas;
}
