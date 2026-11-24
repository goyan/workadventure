export enum Vehicle {
    None = "none",
    Skateboard = "skateboard",
    ElectricUnicycle = "electricUnicycle",
    /** A boat, not a ride of the ground: boarded by itself over the water of the relief deep enough to swim. */
    Canoe = "canoe",
    Airplane = "airplane",
}

export const VEHICLE_PREFERENCE_KEY = "avatarVehicle";
export const VEHICLE_VARIABLE = "_avatarVehicle";
export enum VehicleMedium {
    Land = "land",
    Water = "water",
    Air = "air",
}

export interface VehicleMediumContext {
    deepWater: boolean;
    airborne?: boolean;
}

/** Ordered by priority: a medium still applies when its chosen vehicle is None. */
export const vehicleMedia = [
    {
        id: VehicleMedium.Air,
        vehicles: [Vehicle.None, Vehicle.Airplane],
        preferenceKey: "avatarAirVehicle",
        variable: "_avatarAirVehicle",
        automatic: true,
        isActive: (context: VehicleMediumContext): boolean => context.airborne === true,
    },
    {
        id: VehicleMedium.Water,
        vehicles: [Vehicle.None, Vehicle.Canoe],
        preferenceKey: "avatarWaterVehicle",
        variable: "_avatarWaterVehicle",
        automatic: true,
        isActive: (context: VehicleMediumContext): boolean => !context.airborne && context.deepWater,
    },
    {
        id: VehicleMedium.Land,
        vehicles: [Vehicle.None, Vehicle.Skateboard, Vehicle.ElectricUnicycle],
        preferenceKey: "avatarLandVehicle",
        variable: "_avatarLandVehicle",
        automatic: false,
        isActive: (context: VehicleMediumContext): boolean => !context.airborne && !context.deepWater,
    },
];

export type VehiclePreferences = Record<VehicleMedium, Vehicle>;

export function readMediumVehicle(medium: VehicleMedium, value: unknown): Vehicle {
    const vehicle = readVehicle(value);
    return vehicleMedia.find((entry) => entry.id === medium)?.vehicles.includes(vehicle) ? vehicle : Vehicle.None;
}

export function migrateVehiclePreferences(legacy: unknown): VehiclePreferences {
    const vehicle = legacy === null ? Vehicle.Skateboard : readVehicle(legacy);
    return {
        [VehicleMedium.Air]: readMediumVehicle(VehicleMedium.Air, vehicle),
        [VehicleMedium.Land]: readMediumVehicle(VehicleMedium.Land, vehicle),
        [VehicleMedium.Water]: readMediumVehicle(VehicleMedium.Water, vehicle),
    };
}

export function activeVehicleMedium(context: VehicleMediumContext): VehicleMedium {
    return vehicleMedia.find((entry) => entry.isActive(context))?.id ?? VehicleMedium.Land;
}

/** Medium-aware peers use their active state; old clients still publish only the legacy variable. */
export function sharedVehicleState(variables: ReadonlyMap<string, unknown> | undefined): VehicleState {
    let inactiveState: VehicleState | undefined;
    for (const medium of vehicleMedia) {
        if (!variables?.has(medium.variable)) continue;
        const state = readVehicleState(variables.get(medium.variable));
        if (readMediumVehicle(medium.id, state.vehicle) !== state.vehicle) continue;
        if (state.mode !== VehicleMode.Off) return state;
        inactiveState = state;
    }
    return inactiveState ?? readVehicleState(variables?.get(VEHICLE_VARIABLE));
}

export const SKATEBOARD_TEXTURE = "avatar-skateboard";
export const ELECTRIC_UNICYCLE_TEXTURE = "avatar-electric-unicycle";
export const CANOE_TEXTURE = "avatar-canoe";
/** The cruise altitude: where a plane climbs by itself on taking off, until its pilot chooses another one. */
export const AIRPLANE_ALTITUDE = 1024;
/** The highest a pilot can climb (space key), twice the cruise altitude. */
export const AIRPLANE_MAX_ALTITUDE = 2048;
/** The lowest a pilot can come down (control key) and still fly: the ground is reached by a landing only. */
export const AIRPLANE_MIN_FLIGHT_ALTITUDE = 64;
/** How many steps the size of a plane takes from the ground to the highest altitude (pixel art scaled by steps). */
const AIRPLANE_SCALE_STEPS = 16;
/** Reserved sky level keeps floor-bound areas and conversations away from airborne players. */
export const AIRPLANE_AREA_LEVEL = 2000;
/**
 * How high a plane at cruise altitude is drawn above its shadow (px). Its depth already puts it over every roof: the
 * drawing only has to show it flies, with its shadow close under it.
 */
export const AIRPLANE_VISUAL_LIFT = 40;
export const AIRPLANE_RENDER_DEPTH = 1_100_000;

function airplaneHeight(altitude: number): number {
    return Number.isFinite(altitude) ? Math.max(0, Math.min(AIRPLANE_MAX_ALTITUDE, altitude)) : 0;
}

/**
 * How big a plane is drawn, seen from above: its size on the ground, growing as it climbs (closer to the eye) to
 * twice it at the highest altitude. By sixteenths: a pixel art sprite scaled at every frame shimmers.
 */
export function airplaneScale(altitude: number): number {
    const steps = Math.round((airplaneHeight(altitude) / AIRPLANE_MAX_ALTITUDE) * AIRPLANE_SCALE_STEPS);
    return 1 + steps / AIRPLANE_SCALE_STEPS;
}

/** How high a plane is drawn above its shadow (whole pixels): AIRPLANE_VISUAL_LIFT at the cruise altitude. */
export function airplaneLift(altitude: number): number {
    return Math.round((airplaneHeight(altitude) / AIRPLANE_ALTITUDE) * AIRPLANE_VISUAL_LIFT);
}
export const DEFAULT_VEHICLE_COLOR = "#39404f";
export const VEHICLE_SPEED_FACTOR = 3.75;
/** Faster than the skateboard; the physics steps follow the fastest vehicle (vehiclePhysicsFps). */
export const ELECTRIC_UNICYCLE_SPEED_FACTOR = 5;

/** A canoe goes at the speed one walks at (a swimmer is slower), and this many times faster when paddling hard. */
export const CANOE_SPEED_FACTOR = 1;
export const CANOE_SPRINT_FACTOR = 2;
/** The current of the water carries a canoe this much of what it carries a swimmer. */
export const CANOE_CURRENT_SHARE = 0.5;

/** How many times the walking speed a vehicle rides at. */
export function vehicleSpeedFactor(vehicle: Vehicle): number {
    if (vehicle === Vehicle.Canoe) return CANOE_SPEED_FACTOR;
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

/** The colours of the vehicles nobody painted. */
const DEFAULT_VEHICLE_COLORS: VehicleColors = {
    color: DEFAULT_VEHICLE_COLOR,
    edgeColor: "#d7aa6b",
    wheelsColor: "#b6383b",
};
/** The airplane's own drawing: red fuselage, yellow wings, grey-blue canopy. In them it is shown as drawn. */
export const AIRPLANE_DEFAULT_COLORS: VehicleColors = {
    color: "#ad2522",
    edgeColor: "#f7cb17",
    wheelsColor: "#616e72",
};

/** Each vehicle has its own colours; these are the ones it starts with. */
export function defaultVehicleColors(vehicle?: Vehicle): VehicleColors {
    return { ...(vehicle === Vehicle.Airplane ? AIRPLANE_DEFAULT_COLORS : DEFAULT_VEHICLE_COLORS) };
}

export function readVehicleColors(value: unknown, vehicle?: Vehicle): VehicleColors {
    const fields = typeof value === "object" && value !== null ? value : {};
    const defaults = defaultVehicleColors(vehicle);
    return {
        color: "color" in fields ? readVehicleColor(fields.color, defaults.color) : defaults.color,
        edgeColor: "edgeColor" in fields ? readVehicleColor(fields.edgeColor, defaults.edgeColor) : defaults.edgeColor,
        wheelsColor:
            "wheelsColor" in fields ? readVehicleColor(fields.wheelsColor, defaults.wheelsColor) : defaults.wheelsColor,
    };
}

export interface VehicleState extends VehicleColors {
    vehicle: Vehicle;
    mode: VehicleMode;
    altitude?: number;
    color: string;
}

export function readVehicle(value: unknown): Vehicle {
    return value === Vehicle.Skateboard ||
        value === Vehicle.ElectricUnicycle ||
        value === Vehicle.Canoe ||
        value === Vehicle.Airplane
        ? value
        : Vehicle.None;
}

export function readVehicleColor(value: unknown, fallback = DEFAULT_VEHICLE_COLOR): string {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
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
        ...readVehicleColors(value, vehicle),
        ...(vehicle === Vehicle.Airplane
            ? {
                  altitude:
                      "altitude" in value && typeof value.altitude === "number" && Number.isFinite(value.altitude)
                          ? Math.max(0, Math.min(AIRPLANE_MAX_ALTITUDE, value.altitude))
                          : AIRPLANE_ALTITUDE,
              }
            : {}),
    };
}

/** Whether a character is in its canoe: it chose one, and it is on the water (its player says so by the mode). */
export function isCanoeAfloat(state: Pick<VehicleState, "vehicle" | "mode">): boolean {
    return state.vehicle === Vehicle.Canoe && state.mode !== VehicleMode.Off;
}

/** Arcade can separate a fast body on the far side of a thin obstacle once it crosses its midpoint. */
export function vehiclePhysicsFps(walkingSpeed: number, body: { width: number; height: number }): number {
    const maxStep = Math.min(body.width, body.height) / 2;
    const fastest = Math.max(VEHICLE_SPEED_FACTOR, ELECTRIC_UNICYCLE_SPEED_FACTOR);
    return Math.max(60, Math.ceil((walkingSpeed * 20 * fastest) / maxStep));
}
