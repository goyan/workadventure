import { describe, expect, it } from "vitest";
import {
    EntityRawPrefab,
    SWITCH_OFF_DELAY_DEFAULT_S,
    SWITCH_PROXIMITY_DEFAULT_TILES,
    SwitchPropertyData,
    SwitchTrigger,
    automaticSwitchTargetIds,
    isAutomaticSwitch,
    isInCone,
    isWithinHours,
    isTimeZone,
    minutesOfDayIn,
    parisMinutesOfDay,
    WeatherLocation,
    switchPresenceSenses,
} from "../src";

const base = { id: "p", type: "switchPropertyData" as const };

describe("the trigger of a switch", () => {
    it("is manual when the property says nothing", () => {
        const property = SwitchPropertyData.parse(base);
        expect(property.trigger).toBeUndefined();
        expect(isAutomaticSwitch(property)).toBe(false);
    });

    it("fails open: a trigger that is not valid leaves a manual switch", () => {
        const property = SwitchPropertyData.parse({ ...base, trigger: { type: "moonlight" } });
        expect(property.trigger).toBeUndefined();
        expect(isAutomaticSwitch(property)).toBe(false);
    });

    it("senses presence 3 tiles around and puts out 30 s after the last person, by default", () => {
        expect(SWITCH_PROXIMITY_DEFAULT_TILES).toBe(3);
        expect(SWITCH_OFF_DELAY_DEFAULT_S).toBe(30);
        const trigger = SwitchTrigger.parse({ type: "presence", scope: "proximity" });
        expect(trigger).toMatchObject({ type: "presence", scope: "proximity", tiles: 3, offDelay: 30 });
        expect(isAutomaticSwitch(SwitchPropertyData.parse({ ...base, trigger }))).toBe(true);
    });

    it("bounds the delay and the reach", () => {
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "room", offDelay: 601 })).toThrow();
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "room", offDelay: -1 })).toThrow();
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "proximity", tiles: 21 })).toThrow();
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "proximity", tiles: 0 })).toThrow();
    });

    it("reads hours as HH:MM", () => {
        expect(SwitchTrigger.parse({ type: "hours", from: "18:00", to: "08:00" })).toEqual({
            type: "hours",
            from: "18:00",
            to: "08:00",
        });
        expect(() => SwitchTrigger.parse({ type: "hours", from: "24:00", to: "08:00" })).toThrow();
        expect(() => SwitchTrigger.parse({ type: "hours", from: "8:00", to: "08:00" })).toThrow();
    });
});

describe("automaticSwitchTargetIds", () => {
    const trigger = { type: "presence" as const, scope: "room" as const, tiles: 3, offDelay: 30 };

    it("is the list of a switch wired by ids", () => {
        const property = SwitchPropertyData.parse({ ...base, trigger, targets: { mode: "ids", ids: ["a", "b"] } });
        expect(automaticSwitchTargetIds(property)).toEqual(["a", "b"]);
    });

    it("is what the editor resolved for a switch that commands its room", () => {
        const property = SwitchPropertyData.parse({ ...base, trigger, resolvedTargets: ["c"] });
        expect(automaticSwitchTargetIds(property)).toEqual(["c"]);
    });

    it("is empty when the editor resolved nothing yet", () => {
        expect(automaticSwitchTargetIds(SwitchPropertyData.parse({ ...base, trigger }))).toEqual([]);
    });
});

describe("isWithinHours", () => {
    it("handles a range that passes midnight", () => {
        expect(isWithinHours("18:00", "08:00", 23 * 60)).toBe(true);
        expect(isWithinHours("18:00", "08:00", 7 * 60 + 59)).toBe(true);
        expect(isWithinHours("18:00", "08:00", 18 * 60)).toBe(true);
        expect(isWithinHours("18:00", "08:00", 8 * 60)).toBe(false);
        expect(isWithinHours("18:00", "08:00", 12 * 60)).toBe(false);
    });

    it("handles a range within the day, its end left out", () => {
        expect(isWithinHours("08:00", "18:00", 8 * 60)).toBe(true);
        expect(isWithinHours("08:00", "18:00", 17 * 60 + 59)).toBe(true);
        expect(isWithinHours("08:00", "18:00", 18 * 60)).toBe(false);
        expect(isWithinHours("08:00", "18:00", 7 * 60 + 59)).toBe(false);
    });

    it("is never within an empty range", () => {
        expect(isWithinHours("09:00", "09:00", 9 * 60)).toBe(false);
    });
});

describe("parisMinutesOfDay", () => {
    it("is one hour ahead of UTC in winter", () => {
        expect(parisMinutesOfDay(new Date("2026-01-15T12:30:00Z"))).toBe(13 * 60 + 30);
    });

    it("is two hours ahead of UTC in summer", () => {
        expect(parisMinutesOfDay(new Date("2026-07-15T12:30:00Z"))).toBe(14 * 60 + 30);
    });

    it("starts again at midnight in Paris", () => {
        expect(parisMinutesOfDay(new Date("2026-01-15T23:00:00Z"))).toBe(0);
    });
});

describe("a catalog entry that is a sensor or a timer", () => {
    const prefab = { id: "x", name: "x", tags: [], imagePath: "x.png", direction: "Down", color: "" };

    it("says which trigger its switch starts with", () => {
        expect(EntityRawPrefab.parse({ ...prefab, switch: "presence" }).switch).toBe("presence");
        expect(EntityRawPrefab.parse({ ...prefab, switch: "hours" }).switch).toBe("hours");
        expect(EntityRawPrefab.parse({ ...prefab, switch: true }).switch).toBe(true);
    });

    it("fails open on a trigger it does not know", () => {
        expect(EntityRawPrefab.parse({ ...prefab, switch: "bogus" }).switch).toBeUndefined();
    });
});

describe("a presence trigger that senses in a cone", () => {
    it("points downwards, 90 degrees wide, by default", () => {
        expect(SwitchTrigger.parse({ type: "presence", scope: "cone" })).toEqual({
            type: "presence",
            scope: "cone",
            tiles: 3,
            offDelay: 30,
            direction: 90,
            angle: 90,
        });
    });

    it("bounds its direction and its opening", () => {
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "cone", direction: 360 })).toThrow();
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "cone", angle: 9 })).toThrow();
        expect(() => SwitchTrigger.parse({ type: "presence", scope: "cone", angle: 361 })).toThrow();
    });
});

describe("isInCone", () => {
    const origin = { x: 100, y: 100 };
    // Degrees clockwise on the screen from the east, like the light of an RGB lamp: 90 points downwards.
    const down = { direction: 90, angle: 90, reach: 96 };

    it("holds a point in front, within reach", () => {
        expect(isInCone(origin, down, { x: 100, y: 196 })).toBe(true);
        expect(isInCone(origin, down, { x: 100, y: 197 })).toBe(false);
    });

    it("holds a point up to half the opening on each side, not beyond", () => {
        expect(isInCone(origin, down, { x: 140, y: 141 })).toBe(true);
        expect(isInCone(origin, down, { x: 141, y: 140 })).toBe(false);
        expect(isInCone(origin, down, { x: 60, y: 141 })).toBe(true);
    });

    it("does not hold a point behind", () => {
        expect(isInCone(origin, down, { x: 100, y: 60 })).toBe(false);
    });

    it("wraps around the east", () => {
        const east = { direction: 0, angle: 90, reach: 96 };
        expect(isInCone(origin, east, { x: 150, y: 80 })).toBe(true);
        expect(isInCone(origin, east, { x: 150, y: 120 })).toBe(true);
        expect(isInCone(origin, east, { x: 50, y: 100 })).toBe(false);
    });

    it("holds everything within reach when fully open, and its own origin", () => {
        const all = { direction: 90, angle: 360, reach: 96 };
        expect(isInCone(origin, all, { x: 100, y: 10 })).toBe(true);
        expect(isInCone(origin, down, origin)).toBe(true);
    });
});

describe("switchPresenceSenses", () => {
    const sensorAt = { x: 160, y: 160 };
    const area = { x: 0, y: 0, width: 320, height: 320 };
    const presence = (scope: "room" | "area" | "proximity" | "cone", overrides = {}) =>
        SwitchTrigger.parse({ type: "presence", scope, ...overrides }) as Extract<SwitchTrigger, { type: "presence" }>;

    it("senses somebody in its area, on the floor of the area", () => {
        expect(switchPresenceSenses(sensorAt, presence("room"), area, { x: 320, y: 320 }, 0)).toBe(true);
        expect(switchPresenceSenses(sensorAt, presence("room"), area, { x: 321, y: 100 }, 0)).toBe(false);
        expect(switchPresenceSenses(sensorAt, presence("area"), area, { x: 100, y: 100 }, 64)).toBe(false);
        expect(
            switchPresenceSenses(sensorAt, presence("area"), { ...area, elevation: 64 }, { x: 100, y: 100 }, 64),
        ).toBe(true);
    });

    it("senses nothing without its area", () => {
        expect(switchPresenceSenses(sensorAt, presence("room"), undefined, { x: 100, y: 100 }, 0)).toBe(false);
    });

    it("senses around the middle of its first tile, on its own floor", () => {
        expect(switchPresenceSenses(sensorAt, presence("proximity"), undefined, { x: 176 + 96, y: 176 }, 0)).toBe(true);
        expect(switchPresenceSenses(sensorAt, presence("proximity"), undefined, { x: 176 + 97, y: 176 }, 0)).toBe(
            false,
        );
        expect(switchPresenceSenses(sensorAt, presence("proximity"), undefined, { x: 176, y: 176 }, 64)).toBe(false);
        expect(
            switchPresenceSenses(
                { ...sensorAt, elevation: 64 },
                presence("proximity"),
                undefined,
                { x: 176, y: 176 },
                64,
            ),
        ).toBe(true);
    });

    it("cannot tell by itself who is in a building: only the browsers know the walls of the map", () => {
        const building = SwitchTrigger.parse({ type: "presence", scope: "building" }) as Extract<
            SwitchTrigger,
            { type: "presence" }
        >;
        expect(switchPresenceSenses(sensorAt, building, undefined, { x: 176, y: 176 }, 0)).toBe(false);
        expect(switchPresenceSenses(sensorAt, building, area, { x: 100, y: 100 }, 0)).toBe(false);
    });

    it("senses in its cone only", () => {
        const cone = presence("cone", { direction: 90, angle: 90 });
        expect(switchPresenceSenses(sensorAt, cone, undefined, { x: 176, y: 176 + 90 }, 0)).toBe(true);
        expect(switchPresenceSenses(sensorAt, cone, undefined, { x: 176, y: 176 - 40 }, 0)).toBe(false);
    });
});

describe("minutesOfDayIn", () => {
    const noonInParis = new Date("2026-01-15T11:00:00Z");

    it("reads the time of the place of the map: the timers follow it", () => {
        expect(minutesOfDayIn(noonInParis, "Australia/Sydney")).toBe(22 * 60);
        expect(minutesOfDayIn(noonInParis, "America/New_York")).toBe(6 * 60);
        expect(minutesOfDayIn(noonInParis, "Europe/Paris")).toBe(12 * 60);
    });

    it("reads the time of Paris for a map without a place, or whose time zone is not one", () => {
        expect(minutesOfDayIn(noonInParis, undefined)).toBe(12 * 60);
        expect(minutesOfDayIn(noonInParis, "Mars/Phobos")).toBe(12 * 60);
        expect(minutesOfDayIn(noonInParis, "")).toBe(12 * 60);
    });
});

describe("the time zone of the place of a map", () => {
    const lille = { name: "Lille", latitude: 50.63, longitude: 3.06 };

    it("knows a time zone from what is not one", () => {
        expect(isTimeZone("Europe/Paris")).toBe(true);
        expect(isTimeZone("Australia/Sydney")).toBe(true);
        expect(isTimeZone("Mars/Phobos")).toBe(false);
        expect(isTimeZone("")).toBe(false);
    });

    it("is kept with the place", () => {
        expect(WeatherLocation.parse({ ...lille, timezone: "Europe/Paris" }).timezone).toBe("Europe/Paris");
    });

    it("is left out, the place kept, when it is missing (a place chosen before) or not a time zone", () => {
        expect(WeatherLocation.parse(lille)).toEqual(lille);
        expect(WeatherLocation.parse({ ...lille, timezone: "Mars/Phobos" })).toEqual(lille);
        expect(WeatherLocation.parse({ ...lille, timezone: 42 })).toEqual(lille);
    });
});
