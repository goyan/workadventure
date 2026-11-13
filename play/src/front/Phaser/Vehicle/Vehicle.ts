export enum Vehicle {
    None = "none",
    Skateboard = "skateboard",
    ElectricUnicycle = "electricUnicycle",
}

export const VEHICLE_PREFERENCE_KEY = "avatarVehicle";
export const VEHICLE_VARIABLE = "_avatarVehicle";
export const SKATEBOARD_TEXTURE = "avatar-skateboard";
export const ELECTRIC_UNICYCLE_TEXTURE = "avatar-electric-unicycle";
export const DEFAULT_VEHICLE_COLOR = "#39404f";
export const VEHICLE_SPEED_FACTOR = 3.75;
/** Faster than the skateboard; the physics steps follow the fastest vehicle (vehiclePhysicsFps). */
export const ELECTRIC_UNICYCLE_SPEED_FACTOR = 5;

/** How many times the walking speed a vehicle rides at. */
export function vehicleSpeedFactor(vehicle: Vehicle): number {
    return vehicle === Vehicle.ElectricUnicycle ? ELECTRIC_UNICYCLE_SPEED_FACTOR : VEHICLE_SPEED_FACTOR;
}

export enum VehicleMode {
    Off = "off",
    Sprint = "sprint",
    Always = "always",
}

export interface VehicleColors {
    color: string;
    edgeColor: string;
    wheelsColor: string;
}

export function readVehicleColors(value: unknown): VehicleColors {
    const fields = typeof value === "object" && value !== null ? value : {};
    return {
        color: "color" in fields ? readVehicleColor(fields.color) : DEFAULT_VEHICLE_COLOR,
        edgeColor: "edgeColor" in fields ? readVehicleColor(fields.edgeColor) : "#d7aa6b",
        wheelsColor: "wheelsColor" in fields ? readVehicleColor(fields.wheelsColor) : "#b6383b",
    };
}

export interface VehicleState extends VehicleColors {
    vehicle: Vehicle;
    mode: VehicleMode;
    color: string;
}

export function readVehicle(value: unknown): Vehicle {
    return value === Vehicle.Skateboard || value === Vehicle.ElectricUnicycle ? value : Vehicle.None;
}

export function readVehicleColor(value: unknown): string {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_VEHICLE_COLOR;
}

/** This state is public and can also come from map scripts. */
export function readVehicleState(value: unknown): VehicleState {
    if (typeof value !== "object" || value === null) {
        return { vehicle: Vehicle.None, mode: VehicleMode.Off, ...readVehicleColors(null) };
    }
    const vehicle = "vehicle" in value ? readVehicle(value.vehicle) : Vehicle.None;
    const mode =
        "mode" in value && (value.mode === VehicleMode.Always || value.mode === VehicleMode.Sprint)
            ? value.mode
            : VehicleMode.Off;
    return {
        vehicle,
        mode: vehicle === Vehicle.None ? VehicleMode.Off : mode,
        ...readVehicleColors(value),
    };
}

/** Arcade can separate a fast body on the far side of a thin obstacle once it crosses its midpoint. */
export function vehiclePhysicsFps(walkingSpeed: number, body: { width: number; height: number }): number {
    const maxStep = Math.min(body.width, body.height) / 2;
    const fastest = Math.max(VEHICLE_SPEED_FACTOR, ELECTRIC_UNICYCLE_SPEED_FACTOR);
    return Math.max(60, Math.ceil((walkingSpeed * 20 * fastest) / maxStep));
}
