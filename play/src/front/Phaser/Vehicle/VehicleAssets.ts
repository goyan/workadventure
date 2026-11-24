import { SEATED_DIRECTIONS } from "@wa/front/Phaser/Entity/SeatedPose";
import { CANOE_TEXTURE, ELECTRIC_UNICYCLE_TEXTURE, SKATEBOARD_TEXTURE, Vehicle, type VehicleColors } from "./Vehicle";
import { createSkateboardSheet, SKATEBOARD_LAYERS } from "./SkateboardArtwork";
import { createElectricUnicycleSheet } from "./ElectricUnicycleArtwork";
import { createCanoeSheet } from "./CanoeArtwork";
import {
    createAirplaneSheet,
    airplaneCockpit,
    airplaneFrame,
    airplaneFrontFrame,
    airplaneShadowFrame,
    AIRPLANE_FRAME_SIZE,
} from "./AirplaneArtwork";
import { cardinalVehicleHeading, VEHICLE_DIRECTIONS, VEHICLE_FRAME_SIZE, VEHICLE_FEET_Y } from "./VehicleFrames";

type VehicleLayer = (typeof SKATEBOARD_LAYERS)[number];

/** How a ridden vehicle is drawn: its texture and its sheet, whole or one paint part (tint mask) at a time. */
export interface VehicleArtwork {
    texture: string;
    layers: readonly VehicleLayer[];
    createSheet: (colors: VehicleColors, layer?: VehicleLayer, source?: CanvasImageSource) => HTMLCanvasElement;
}

export function vehicleArtwork(vehicle: Exclude<Vehicle, Vehicle.None>): VehicleArtwork {
    if (vehicle === Vehicle.Airplane) {
        return { texture: "avatar-airplane", layers: ["details"], createSheet: createAirplaneSheet };
    }
    if (vehicle === Vehicle.Canoe) {
        return { texture: CANOE_TEXTURE, layers: SKATEBOARD_LAYERS, createSheet: createCanoeSheet };
    }
    return vehicle === Vehicle.ElectricUnicycle
        ? { texture: ELECTRIC_UNICYCLE_TEXTURE, layers: SKATEBOARD_LAYERS, createSheet: createElectricUnicycleSheet }
        : { texture: SKATEBOARD_TEXTURE, layers: SKATEBOARD_LAYERS, createSheet: createSkateboardSheet };
}

export function createVehicleSheet(colors: VehicleColors, vehicle: Vehicle = Vehicle.Skateboard): HTMLCanvasElement {
    return vehicleArtwork(vehicle === Vehicle.None ? Vehicle.Skateboard : vehicle).createSheet(colors);
}

export function drawVehiclePreview(
    context: CanvasRenderingContext2D,
    sheet: HTMLCanvasElement,
    layers: { image: HTMLImageElement; head: boolean }[],
    direction: number,
    size: number,
    vehicle: Vehicle = Vehicle.Skateboard,
): void {
    context.clearRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;
    context.save();
    context.scale(size / 64, size / 64);
    const heading = cardinalVehicleHeading(SEATED_DIRECTIONS[direction]);
    if (vehicle === Vehicle.Airplane) {
        drawAirplanePreview(context, sheet, layers, direction, heading);
        context.restore();
        return;
    }
    context.drawImage(
        sheet,
        heading * VEHICLE_FRAME_SIZE,
        0,
        VEHICLE_FRAME_SIZE,
        VEHICLE_FRAME_SIZE,
        0,
        VEHICLE_FEET_Y,
        64,
        64,
    );
    for (const { image } of layers) {
        if (image.complete && image.naturalWidth) context.drawImage(image, 32, direction * 32, 32, 32, 16, 16, 32, 32);
    }
    context.restore();
}

/** How high the airplane of a preview flies over its shadow (px of the 64 px frame). */
const PREVIEW_LIFT = 4;

/**
 * The airplane as in the game, in flight: its shadow, the airframe with the spinning propeller, the pilot's head and
 * the front of the cockpit over it.
 */
function drawAirplanePreview(
    context: CanvasRenderingContext2D,
    sheet: HTMLCanvasElement,
    layers: { image: HTMLImageElement; head: boolean }[],
    direction: number,
    heading: number,
): void {
    // The whole 80 px cell (the propeller turns past the airframe), and room for the lift: brought down to the
    // 64 px preview, nothing is cut at its edges.
    const box = AIRPLANE_FRAME_SIZE + 2 * PREVIEW_LIFT;
    context.scale(VEHICLE_FRAME_SIZE / box, VEHICLE_FRAME_SIZE / box);
    const frame = (index: number, y: number): void => {
        context.drawImage(
            sheet,
            (index % VEHICLE_DIRECTIONS) * AIRPLANE_FRAME_SIZE,
            Math.floor(index / VEHICLE_DIRECTIONS) * AIRPLANE_FRAME_SIZE,
            AIRPLANE_FRAME_SIZE,
            AIRPLANE_FRAME_SIZE,
            0,
            PREVIEW_LIFT + y,
            AIRPLANE_FRAME_SIZE,
            AIRPLANE_FRAME_SIZE,
        );
    };
    context.globalAlpha = 0.35;
    frame(airplaneShadowFrame(heading), PREVIEW_LIFT);
    context.globalAlpha = 1;
    frame(airplaneFrame(heading, 0, true), -PREVIEW_LIFT);
    const pilot = airplaneCockpit(heading);
    for (const { image } of layers) {
        if (!image.complete || !image.naturalWidth) continue;
        context.drawImage(image, 32, direction * 32, 32, 16, pilot.x - 12, pilot.y - 6, 24, 12);
    }
    frame(airplaneFrontFrame(heading), -PREVIEW_LIFT);
}
