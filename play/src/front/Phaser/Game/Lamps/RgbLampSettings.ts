import {
    RGB_LAMP_DEFAULT_COLOR,
    RGB_LAMP_DEFAULT_DIRECTION,
    RGB_LAMP_DEFAULT_RADIUS_TILES,
    RGB_LAMP_MAX_ANGLE,
    RGB_LAMP_MAX_RADIUS_TILES,
    RGB_LAMP_MIN_ANGLE,
    RGB_LAMP_MIN_RADIUS_TILES,
    type EntityDataProperties,
} from "@workadventure/map-editor";
import type { LightCone, Point } from "./RgbLampGeometry";

/** What is set on an RGB lamp in the editor (see RgbLampPropertyData). */
export interface RgbLampSettings {
    /** `#rrggbb`. */
    color: string;
    /** Reach, in tiles. */
    radius: number;
    /** Degrees, clockwise on the screen from the east: 90 shines downwards. */
    direction: number;
    /** Opening of the cone, in degrees; 360: all around. */
    angle: number;
    /** The lamp turns like a rotating beacon (see rgbLampBeamDirection); absent: it stands still. */
    rotation?: boolean;
    /** Turns a minute; absent: RGB_LAMP_DEFAULT_ROTATION_SPEED. */
    rotationSpeed?: number;
    /** Absent: clockwise on the screen. */
    rotationClockwise?: boolean;
}

export const RGB_LAMP_PROPERTY = "rgbLampPropertyData";
/** The tip of the cone is dragged by half tiles. */
const RADIUS_STEP_TILES = 0.5;

/**
 * The settings of an RGB lamp, read from the properties of its object: a lamp nothing was set on shines with the
 * defaults. Read again whenever the properties change: a script will be able to drive the lamp through them.
 */
export function rgbLampSettingsOf(properties: EntityDataProperties): RgbLampSettings {
    for (const property of properties) {
        if (property.type === RGB_LAMP_PROPERTY) {
            const { color, radius, direction, angle, rotation, rotationSpeed, rotationClockwise } = property;
            return { color, radius, direction, angle, rotation, rotationSpeed, rotationClockwise };
        }
    }
    return {
        color: RGB_LAMP_DEFAULT_COLOR,
        radius: RGB_LAMP_DEFAULT_RADIUS_TILES,
        direction: RGB_LAMP_DEFAULT_DIRECTION,
        angle: RGB_LAMP_MAX_ANGLE,
    };
}

/** `#rrggbb` as a number, for a tint; the default colour for anything else. */
export function rgbLampColour(color: string): number {
    const hex = /^#([0-9a-fA-F]{6})$/.exec(color)?.[1] ?? RGB_LAMP_DEFAULT_COLOR.slice(1);
    return parseInt(hex, 16);
}

/** The light of a lamp on the map: its cone, in map pixels around the point the light comes from. */
export function rgbLampLight(source: Point, settings: RgbLampSettings, tileSize: number): LightCone {
    return {
        x: source.x,
        y: source.y,
        radius: settings.radius * tileSize,
        direction: settings.direction,
        angle: settings.angle,
    };
}

/** Where the handle at the tip of the cone is: at the end of the reach, in the direction of the cone. */
export function coneTip(source: Point, cone: Pick<RgbLampSettings, "radius" | "direction">, tileSize: number): Point {
    const direction = (cone.direction * Math.PI) / 180;
    return {
        x: source.x + Math.cos(direction) * cone.radius * tileSize,
        y: source.y + Math.sin(direction) * cone.radius * tileSize,
    };
}

function degreesTo(source: Point, point: Point): number {
    return (Math.atan2(point.y - source.y, point.x - source.x) * 180) / Math.PI;
}

/**
 * The direction and the reach of the cone whose tip is dragged to a point: one gesture sets both. The reach goes by
 * half tiles, the direction by whole degrees.
 */
export function coneFromTip(
    source: Point,
    tip: Point,
    tileSize: number,
): Pick<RgbLampSettings, "radius" | "direction"> {
    const tiles = Math.hypot(tip.x - source.x, tip.y - source.y) / tileSize;
    const radius = Math.min(
        RGB_LAMP_MAX_RADIUS_TILES,
        Math.max(RGB_LAMP_MIN_RADIUS_TILES, Math.round(tiles / RADIUS_STEP_TILES) * RADIUS_STEP_TILES),
    );
    return { radius, direction: ((Math.round(degreesTo(source, tip)) % 360) + 360) % 360 };
}

/**
 * The opening of the cone when one of its edges is dragged to a point: the cone stays centred on its direction, so it
 * opens to twice the angle between the direction and the pointer.
 */
export function coneOpeningFromEdge(source: Point, point: Point, direction: number): number {
    const away = Math.abs(((((degreesTo(source, point) - direction) % 360) + 540) % 360) - 180);
    return Math.min(RGB_LAMP_MAX_ANGLE, Math.max(RGB_LAMP_MIN_ANGLE, Math.round(away * 2)));
}
