import type { VehicleColors } from "./Vehicle";
import { VEHICLE_DIRECTIONS, VEHICLE_FRAME_SIZE } from "./VehicleFrames";
import { SKATEBOARD_LAYERS } from "./SkateboardArtwork";

/** The same paint parts as the skateboard: shell (color), its shaded faces (edgeColor), pedals and accents (wheelsColor). */
export const ELECTRIC_UNICYCLE_LAYERS = SKATEBOARD_LAYERS;
type UnicycleLayer = (typeof ELECTRIC_UNICYCLE_LAYERS)[number];

const OUTLINE = "#15161b";
const TYRE = "#25262c";
const TREAD = "#3d3f47";
const RIM = "#70747e";
const HUB = "#45484f";
const BLACK = "#1d1e23";
const PAD_LIGHT = "#33353c";
const LID = "#ffffff";
const LIGHT = "#a8dbe8";
const TAIL = "#d2453a";

/**
 * An electric unicycle under the avatar's feet (origin), after the team's design: a golden shell over the top of a big
 * wheel, shaded faces, a lighter lid with a black stripe, a black centre tube, angled knee pads and a handle at the back,
 * long red pedals. From the side going left or right, from the front (headlight) coming down, from the back (tail light,
 * red spring) going up, and on a diagonal that front or back view turned 45°. Native pixel art on the avatar grid; each
 * paint part has a shared tint mask.
 */
export function drawElectricUnicycle(
    context: CanvasRenderingContext2D,
    heading: number,
    phase: number,
    colors: VehicleColors,
    layer?: UnicycleLayer,
): void {
    const side = heading === 2 || heading === 6;
    // Coming towards the viewer (down, down-left, down-right): its front; going away: its back.
    const front = heading === 0 || heading === 1 || heading === 7;
    context.save();
    context.imageSmoothingEnabled = false;
    if (side) {
        // Drawn facing left; going right is the mirror image.
        if (heading === 6) context.scale(-1, 1);
    } else {
        // On a diagonal, the front or back view turned 45° towards the way it goes, like the skateboard.
        context.rotate(((front ? heading : heading - 4) * Math.PI) / 4);
    }
    const paint = (part: UnicycleLayer, color: string, draw: (rect: Rect) => void): void => {
        if (layer && part !== layer) return;
        context.fillStyle = layer && part !== "outline" && part !== "details" ? "#ffffff" : color;
        draw((x, y, width, height) => context.fillRect(x, y, width, height));
    };
    if (side) drawSide(paint, phase, colors, context);
    else if (front) drawFront(paint, phase, colors);
    else drawBack(paint, phase, colors);
    context.restore();
}

type Rect = (x: number, y: number, width: number, height: number) => void;
type Paint = (part: UnicycleLayer, color: string, draw: (rect: Rect) => void) => void;

/**
 * The wheel as a wheel: a round black tyre, a grey rim, spokes from the hub, the shell sitting on its top third only, so
 * that most of the wheel shows.
 */
function drawSide(paint: Paint, phase: number, colors: VehicleColors, context: CanvasRenderingContext2D): void {
    const wheel = { x: 0, y: 6 };
    paint("outline", OUTLINE, (rect) => {
        disc(rect, wheel.x, wheel.y, 11);
        rect(-10, -11, 20, 12);
        rect(7, -15, 4, 5);
        rect(-10, 2, 6, 2);
    });
    paint("details", TYRE, (rect) => disc(rect, wheel.x, wheel.y, 10));
    paint("details", RIM, (rect) => ring(rect, wheel.x, wheel.y, 7, 6));
    paint("details", HUB, (rect) => disc(rect, wheel.x, wheel.y, 3));
    paint("details", RIM, (rect) => {
        // Four spokes and four tread marks turn a sixteenth of a turn per phase: after four phases the wheel looks the
        // same again. Facing left, the top of the wheel goes left.
        for (let spoke = 0; spoke < 4; spoke++) {
            const angle = -Math.PI / 2 - ((spoke * 4 + phase) * Math.PI) / 8;
            for (const radius of [4, 5]) {
                rect(
                    wheel.x + Math.round(Math.cos(angle) * radius),
                    wheel.y + Math.round(Math.sin(angle) * radius),
                    1,
                    1,
                );
            }
        }
    });
    paint("details", TREAD, (rect) => {
        for (let mark = 0; mark < 8; mark++) {
            const angle = -Math.PI / 2 - ((mark * 2 + phase / 2) * Math.PI) / 8;
            rect(wheel.x + Math.round(Math.cos(angle) * 9), wheel.y + Math.round(Math.sin(angle) * 9), 1, 1);
        }
    });
    // Shaded faces: the back and the bottom of the shell.
    paint("edgeColor", colors.edgeColor, (rect) => rect(-9, -10, 18, 10));
    paint("color", colors.color, (rect) => rect(-9, -10, 15, 7));
    paint("details", LID, (rect) => {
        context.globalAlpha = 0.45;
        rect(-9, -10, 18, 1);
        context.globalAlpha = 1;
    });
    paint("details", BLACK, (rect) => {
        // Lid stripe, centre tube, knee pads, handle.
        rect(-8, -9, 17, 1);
        rect(0, -8, 2, 6);
        rect(-7, -7, 2, 5);
        rect(4, -7, 2, 4);
        rect(8, -14, 2, 1);
        rect(9, -13, 1, 3);
    });
    paint("details", PAD_LIGHT, (rect) => rect(-7, -7, 1, 2));
    // Red strip along the bottom of the shell, and the pedal folded out at the front, under the feet.
    paint("wheelsColor", colors.wheelsColor, (rect) => {
        rect(-6, -1, 11, 1);
        rect(-9, 2, 4, 1);
    });
}

function drawFront(paint: Paint, phase: number, colors: VehicleColors): void {
    drawFrame(paint);
    drawTyre(paint, phase);
    drawPads(paint);
    // Two golden pillars on either side of the tyre, joined at the top.
    paint("edgeColor", colors.edgeColor, (rect) => {
        rect(-6, -12, 12, 6);
        rect(-6, -6, 3, 12);
        rect(3, -6, 3, 12);
    });
    paint("color", colors.color, (rect) => {
        rect(-5, -12, 10, 5);
        rect(-5, -7, 1, 12);
        rect(4, -7, 1, 12);
    });
    paint("details", BLACK, (rect) => {
        // The handle's opening, and the frame of the headlight.
        rect(-3, -11, 6, 1);
        rect(-3, -10, 1, 2);
        rect(2, -10, 1, 2);
        rect(-2, -6, 4, 3);
    });
    paint("details", LIGHT, (rect) => rect(-1, -5, 2, 1));
    paint("wheelsColor", colors.wheelsColor, (rect) => rect(-13, 5, 26, 1));
}

function drawBack(paint: Paint, phase: number, colors: VehicleColors): void {
    drawFrame(paint);
    drawTyre(paint, phase);
    drawPads(paint);
    paint("edgeColor", colors.edgeColor, (rect) => {
        rect(-6, -12, 12, 3);
        rect(-6, -9, 3, 15);
        rect(3, -9, 3, 15);
    });
    paint("color", colors.color, (rect) => {
        rect(-5, -12, 10, 2);
        rect(-5, -10, 1, 15);
        rect(4, -10, 1, 15);
    });
    // Tail light, the suspension's spring between the pillars, the mudguard over the tyre.
    paint("details", TAIL, (rect) => rect(-3, -11, 6, 1));
    paint("details", BLACK, (rect) => {
        rect(-2, -9, 4, 6);
        rect(-3, 1, 6, 2);
    });
    paint("wheelsColor", colors.wheelsColor, (rect) => {
        for (let y = -8; y < -3; y += 2) rect(-1, y, 2, 1);
        rect(-13, 5, 26, 1);
    });
}

function drawFrame(paint: Paint): void {
    paint("outline", OUTLINE, (rect) => {
        rect(-3, -2, 6, 19);
        rect(-7, -13, 14, 20);
        rect(-11, -8, 22, 10);
        rect(-14, 4, 28, 3);
    });
}

/** Side pads, stacked, on either side of the shell. */
function drawPads(paint: Paint): void {
    paint("details", BLACK, (rect) => {
        rect(-10, -7, 3, 5);
        rect(7, -7, 3, 5);
        rect(-10, -1, 3, 2);
        rect(7, -1, 3, 2);
    });
    paint("details", PAD_LIGHT, (rect) => {
        rect(-10, -7, 1, 5);
        rect(9, -7, 1, 5);
    });
}

/** The tyre seen edge on, with its chevrons running down one pixel per phase, four apart: the loop rolls on. */
function drawTyre(paint: Paint, phase: number): void {
    paint("details", TYRE, (rect) => {
        rect(-2, -1, 4, 17);
        rect(-1, 16, 2, 1);
    });
    paint("details", TREAD, (rect) => {
        for (let y = phase; y < 16; y += 4) {
            rect(-2, y, 1, 1);
            rect(1, y, 1, 1);
            rect(-1, y + 1, 2, 1);
        }
    });
}

function disc(rect: Rect, cx: number, cy: number, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
        const half = Math.round(Math.sqrt(radius * radius - dy * dy));
        rect(cx - half, cy + dy, half * 2 + 1, 1);
    }
}

function ring(rect: Rect, cx: number, cy: number, outer: number, inner: number): void {
    for (let dy = -outer; dy <= outer; dy++) {
        const half = Math.round(Math.sqrt(outer * outer - dy * dy));
        const hole = Math.abs(dy) <= inner ? Math.round(Math.sqrt(inner * inner - dy * dy)) : -1;
        if (hole < 0) rect(cx - half, cy + dy, half * 2 + 1, 1);
        else {
            rect(cx - half, cy + dy, half - hole, 1);
            rect(cx + hole + 1, cy + dy, half - hole, 1);
        }
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
