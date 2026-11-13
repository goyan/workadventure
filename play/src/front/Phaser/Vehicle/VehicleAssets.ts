import { SEATED_DIRECTIONS } from "@wa/front/Phaser/Entity/SeatedPose";
import { ELECTRIC_UNICYCLE_TEXTURE, SKATEBOARD_TEXTURE, Vehicle, type VehicleColors } from "./Vehicle";
import { createSkateboardSheet, SKATEBOARD_LAYERS } from "./SkateboardArtwork";
import { createElectricUnicycleSheet } from "./ElectricUnicycleArtwork";
import { cardinalVehicleHeading, VEHICLE_FRAME_SIZE, VEHICLE_FEET_Y } from "./VehicleFrames";

type VehicleLayer = (typeof SKATEBOARD_LAYERS)[number];

/** How a ridden vehicle is drawn: its texture and its sheet, whole or one paint part (tint mask) at a time. */
export interface VehicleArtwork {
    texture: string;
    layers: readonly VehicleLayer[];
    createSheet: (colors: VehicleColors, layer?: VehicleLayer) => HTMLCanvasElement;
}

export function vehicleArtwork(vehicle: Exclude<Vehicle, Vehicle.None>): VehicleArtwork {
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
): void {
    context.clearRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;
    context.save();
    context.scale(size / 64, size / 64);
    const heading = cardinalVehicleHeading(SEATED_DIRECTIONS[direction]);
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
