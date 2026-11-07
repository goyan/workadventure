import { PositionMessage_Direction } from "@workadventure/messages";

export const VEHICLE_FRAME_SIZE = 64;
export const VEHICLE_DIRECTIONS = 8;
export const VEHICLE_FEET_Y = 16;

export function vehicleHeading(x: number, y: number): number {
    if (Math.abs(x) < Math.abs(y) * 0.35) x = 0;
    if (Math.abs(y) < Math.abs(x) * 0.35) y = 0;
    return (Math.round(Math.atan2(-x, y) / (Math.PI / 4)) + 8) % 8;
}

export function cardinalVehicleHeading(direction: PositionMessage_Direction): number {
    switch (direction) {
        case PositionMessage_Direction.LEFT:
            return 2;
        case PositionMessage_Direction.UP:
            return 4;
        case PositionMessage_Direction.RIGHT:
            return 6;
        default:
            return 0;
    }
}

export function turnVehicleTowards(current: number, target: number, delta: number): number {
    const difference = ((target - current + 12) % 8) - 4;
    return (current + Math.sign(difference) * Math.min(Math.abs(difference), Math.max(0, delta) / 85) + 8) % 8;
}
