import { SEATED_DIRECTIONS } from "@wa/front/Phaser/Entity/SeatedPose";
import type { VehicleColors } from "./Vehicle";
import { createSkateboardSheet } from "./SkateboardArtwork";
import { cardinalVehicleHeading, VEHICLE_FRAME_SIZE, VEHICLE_FEET_Y } from "./VehicleFrames";

export function createVehicleSheet(colors: VehicleColors): HTMLCanvasElement {
    return createSkateboardSheet(colors);
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
