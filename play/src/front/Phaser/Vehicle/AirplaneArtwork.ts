import { AIRPLANE_DEFAULT_COLORS, type VehicleColors } from "./Vehicle";
import { VEHICLE_DIRECTIONS } from "./VehicleFrames";

export const AIRPLANE_SOURCE_TEXTURE = "avatar-airplane-source";
// Versioned: the layout of the sheet changed (7 rows of 80 px), a cached older one would cut the frames wrong.
export const AIRPLANE_IMAGE_URL = "/resources/vehicles/airplane.png?v=80px-drawn";
let image: HTMLImageElement | undefined;
let loading: Promise<HTMLImageElement> | undefined;

export function loadAirplaneArtwork(): Promise<HTMLImageElement> {
    loading ??= new Promise<HTMLImageElement>((resolve, reject) => {
        const asset = new Image();
        asset.onload = () => {
            image = asset;
            resolve(asset);
        };
        asset.onerror = () => {
            loading = undefined;
            reject(new Error("Could not load airplane artwork"));
        };
        asset.src = AIRPLANE_IMAGE_URL;
    });
    return loading;
}

/**
 * Rows of the sheet (see investigations/wa-vehicules-assets/prepare-airplane.py): propeller at rest, four phases of
 * the spinning propeller (blades drawn 45° further each time, in the perspective of the heading), the front of the
 * cockpit (drawn over the pilot) and the shadow.
 */
export const AIRPLANE_ROWS = 7;
/**
 * Cells of the sheet: the 64 px airframe with 8 px around it, where the propeller turns past the nose. Centred on the
 * same point as the 64 px frames of the other vehicles.
 */
export const AIRPLANE_FRAME_SIZE = 80;
const SPIN_ROWS = [1, 2, 3, 4];
const FRONT_ROW = 5;
const SHADOW_ROW = 6;
/**
 * One phase lasts this long (ms). A quarter turn of a two-blade propeller per phase: the eye follows it forward, it
 * never seems to turn back.
 */
const SPIN_PHASE_MS = 40;
// Centre of the canopy glass in each heading, in the 80 px cell, as the generator printed it.
const cockpitAnchors = [
    { x: 40, y: 36 },
    { x: 37, y: 34 },
    { x: 39, y: 26 },
    { x: 38, y: 28 },
    { x: 39, y: 32 },
    { x: 41, y: 28 },
    { x: 40, y: 26 },
    { x: 41, y: 29 },
];

// Wing tips of each heading, to the pilot's left and right (printed by the generator too).
const wingTips = [
    { left: { x: 68, y: 36 }, right: { x: 11, y: 36 } },
    { left: { x: 63, y: 55 }, right: { x: 16, y: 27 } },
    { left: { x: 43, y: 54 }, right: { x: 26, y: 15 } },
    { left: { x: 20, y: 50 }, right: { x: 59, y: 16 } },
    { left: { x: 11, y: 34 }, right: { x: 68, y: 33 } },
    { left: { x: 20, y: 16 }, right: { x: 59, y: 50 } },
    { left: { x: 44, y: 15 }, right: { x: 27, y: 52 } },
    { left: { x: 56, y: 16 }, right: { x: 19, y: 54 } },
];

export function airplaneWingTips(heading: number): (typeof wingTips)[number] {
    return wingTips[(Math.round(heading) + VEHICLE_DIRECTIONS) % VEHICLE_DIRECTIONS] ?? wingTips[0];
}

/** The navigation lights flash briefly once a second, in flight. */
export function airplaneLightsOn(time: number): boolean {
    return time % 1000 < 120;
}

export function airplaneCockpit(heading: number): { x: number; y: number } {
    return cockpitAnchors[(Math.round(heading) + VEHICLE_DIRECTIONS) % VEHICLE_DIRECTIONS] ?? { x: 40, y: 34 };
}

function direction(heading: number): number {
    return (Math.round(heading) + VEHICLE_DIRECTIONS) % VEHICLE_DIRECTIONS;
}

/** The airframe: its propeller spins in flight and while it taxis, and rests once parked. */
export function airplaneFrame(heading: number, time: number, spinning: boolean): number {
    const row = spinning ? SPIN_ROWS[Math.floor(time / SPIN_PHASE_MS) % SPIN_ROWS.length] : 0;
    return direction(heading) + (row ?? 0) * VEHICLE_DIRECTIONS;
}

export function airplaneFrontFrame(heading: number): number {
    return direction(heading) + FRONT_ROW * VEHICLE_DIRECTIONS;
}

export function airplaneShadowFrame(heading: number): number {
    return direction(heading) + SHADOW_ROW * VEHICLE_DIRECTIONS;
}

/** The paintable parts of the airframe, by the colour they have in the sheet. */
function partOf(r: number, g: number, b: number): keyof VehicleColors | undefined {
    if (r > 150 && g > 110 && b < 90 && r - g < 90) return "edgeColor"; // yellow: wings and tail
    if (r > 80 && g < r * 0.6 && b < r * 0.6) return "color"; // red: fuselage
    if (r < 115 && g > r + 5 && b > r + 5) return "wheelsColor"; // teal glass: canopy
    return undefined;
}

function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgb(hex: string): [number, number, number] {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Paints each part in its colour, keeping the shading of the pixel art: a pixel keeps its lightness relative to the
 * usual tone of its part (darker edges stay darker, highlights brighter).
 */
export function paintAirplane(data: Uint8ClampedArray, colors: VehicleColors): void {
    // In its own colours the airplane is shown exactly as drawn.
    if (
        (Object.keys(AIRPLANE_DEFAULT_COLORS) as (keyof VehicleColors)[]).every(
            (part) => colors[part] === AIRPLANE_DEFAULT_COLORS[part],
        )
    )
        return;
    const parts: (keyof VehicleColors | undefined)[] = [];
    const tones: Record<keyof VehicleColors, number[]> = { color: [], edgeColor: [], wheelsColor: [] };
    for (let i = 0; i < data.length; i += 4) {
        const part = data[i + 3] === 255 ? partOf(data[i], data[i + 1], data[i + 2]) : undefined;
        parts.push(part);
        if (part) tones[part].push(luminance(data[i], data[i + 1], data[i + 2]));
    }
    const usual = {} as Record<keyof VehicleColors, number>;
    for (const part of Object.keys(tones) as (keyof VehicleColors)[]) {
        const sorted = [...tones[part]].sort((a, b) => a - b);
        usual[part] = sorted[Math.floor(sorted.length * 0.75)] ?? 1;
    }
    for (const [index, part] of parts.entries()) {
        if (!part) continue;
        const i = index * 4;
        const shade = luminance(data[i], data[i + 1], data[i + 2]) / Math.max(1, usual[part]);
        const [r, g, b] = rgb(colors[part]);
        data[i] = Math.min(255, Math.round(r * shade));
        data[i + 1] = Math.min(255, Math.round(g * shade));
        data[i + 2] = Math.min(255, Math.round(b * shade));
    }
}

/** The texture of an airplane in these colours: one per set of colours in the room, painted once. */
export function airplaneTexture(colors: VehicleColors): string {
    return `avatar-airplane-${colors.color}${colors.edgeColor}${colors.wheelsColor}`;
}

/** Eight headings of one airframe: the rows only differ by the propeller, plus the cockpit front and the shadow. */
export function createAirplaneSheet(
    colors: VehicleColors,
    _layer?: string,
    source: CanvasImageSource | undefined = image,
): HTMLCanvasElement {
    if (!source) throw new Error("Airplane artwork must be loaded before drawing");
    const canvas = document.createElement("canvas");
    canvas.width = AIRPLANE_FRAME_SIZE * VEHICLE_DIRECTIONS;
    canvas.height = AIRPLANE_FRAME_SIZE * AIRPLANE_ROWS;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return canvas;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    paintAirplane(pixels.data, colors);
    context.putImageData(pixels, 0, 0);
    return canvas;
}
