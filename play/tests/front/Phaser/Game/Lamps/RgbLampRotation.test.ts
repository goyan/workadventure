import { describe, expect, it } from "vitest";
import {
    RGB_LAMP_DEFAULT_ROTATION_SPEED,
    RGB_LAMP_MAX_ROTATION_SPEED,
    RGB_LAMP_MIN_ANGLE,
    RGB_LAMP_MIN_ROTATION_SPEED,
} from "@workadventure/map-editor";
import {
    isTurning,
    rgbLampBeamDirection,
    rotationPeriodMs,
} from "../../../../../src/front/Phaser/Game/Lamps/RgbLampRotation";
import type { RgbLampSettings } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampSettings";

const still: RgbLampSettings = { color: "#ffffff", radius: 6, direction: 90, angle: 45 };
const turning = (overrides: Partial<RgbLampSettings> = {}): RgbLampSettings => ({
    ...still,
    rotation: true,
    rotationSpeed: 30,
    ...overrides,
});
/** A moment of these years, in milliseconds since the Unix epoch: the angle must stay exact that far. */
const NOW = 1_794_500_000_000;

describe("rgbLampBeamDirection", () => {
    it("points where it was set for a lamp that does not turn", () => {
        expect(rgbLampBeamDirection(still, NOW, false)).toBe(90);
        expect(rgbLampBeamDirection(turning({ rotation: false }), NOW, false)).toBe(90);
    });

    it("points where it was set at every whole turn since the Unix epoch: the direction is the phase", () => {
        const period = rotationPeriodMs(30);
        expect(period).toBe(2000);
        expect(rgbLampBeamDirection(turning(), 0, false)).toBe(90);
        expect(rgbLampBeamDirection(turning(), 1000 * period, false)).toBeCloseTo(90, 9);
        // A time of these years that is a whole number of turns.
        const whole = Math.floor(NOW / period) * period;
        expect(rgbLampBeamDirection(turning(), whole, false)).toBeCloseTo(90, 6);
    });

    it("turns clockwise on the screen by default, a quarter turn in a quarter of the period", () => {
        const whole = Math.floor(NOW / 2000) * 2000;
        expect(rgbLampBeamDirection(turning(), whole + 500, false)).toBeCloseTo(180, 6);
        expect(rgbLampBeamDirection(turning(), whole + 1500, false)).toBeCloseTo(0, 6);
    });

    it("turns the other way when asked", () => {
        const whole = Math.floor(NOW / 2000) * 2000;
        expect(rgbLampBeamDirection(turning({ rotationClockwise: false }), whole + 500, false)).toBeCloseTo(0, 6);
        expect(rgbLampBeamDirection(turning({ rotationClockwise: false }), whole + 1500, false)).toBeCloseTo(180, 6);
    });

    it("turns at the speed that was set, the default one when none was", () => {
        const whole = Math.floor(NOW / 60_000) * 60_000;
        // 120 turns a minute: half a turn in a quarter second.
        expect(rgbLampBeamDirection(turning({ rotationSpeed: 120 }), whole + 250, false)).toBeCloseTo(270, 6);
        expect(rgbLampBeamDirection(turning({ rotationSpeed: undefined }), whole + 500, false)).toBeCloseTo(180, 6);
        expect(RGB_LAMP_DEFAULT_ROTATION_SPEED).toBe(30);
    });

    it("never turns faster or slower than the bounds, whatever the speed says", () => {
        expect(rotationPeriodMs(10_000)).toBe(60_000 / RGB_LAMP_MAX_ROTATION_SPEED);
        expect(rotationPeriodMs(1)).toBe(60_000 / RGB_LAMP_MIN_ROTATION_SPEED);
        expect(rotationPeriodMs(Number.NaN)).toBe(60_000 / RGB_LAMP_DEFAULT_ROTATION_SPEED);
    });

    it("stands still at the direction that was set with reduced motion (or in the map editor)", () => {
        expect(rgbLampBeamDirection(turning(), NOW + 777, true)).toBe(90);
        expect(isTurning(turning(), true)).toBe(false);
    });

    it("does not turn a lamp that shines all around: turning would show nothing", () => {
        expect(isTurning(turning({ angle: 360 }), false)).toBe(false);
        expect(rgbLampBeamDirection(turning({ angle: 360 }), NOW + 777, false)).toBe(90);
        expect(isTurning(turning(), false)).toBe(true);
        expect(isTurning(still, false)).toBe(false);
    });

    it("stays between 0 and 360 degrees", () => {
        for (let t = 0; t < 4000; t += 37) {
            for (const rotationClockwise of [true, false]) {
                const direction = rgbLampBeamDirection(turning({ rotationClockwise }), NOW + t, false);
                expect(direction).toBeGreaterThanOrEqual(0);
                expect(direction).toBeLessThan(360);
            }
        }
    });

    it("lights a still observer at most 3 times a second at the highest speed and the narrowest cone (WCAG 2.3.1)", () => {
        const lamp = turning({ rotationSpeed: RGB_LAMP_MAX_ROTATION_SPEED, angle: RGB_LAMP_MIN_ANGLE });
        for (const observer of [0, 45, 137, 270]) {
            let flashes = 0;
            let wasLit = false;
            for (let t = 0; t <= 1000; t++) {
                const away = Math.abs(((rgbLampBeamDirection(lamp, NOW + t, false) - observer + 540) % 360) - 180);
                const lit = away <= lamp.angle / 2;
                if (lit && !wasLit) flashes++;
                wasLit = lit;
            }
            expect(flashes).toBeLessThanOrEqual(3);
            expect(flashes).toBeGreaterThanOrEqual(2);
        }
    });
});
