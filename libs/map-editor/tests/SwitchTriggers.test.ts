import { describe, expect, it } from "vitest";
import {
    EntityRawPrefab,
    SWITCH_OFF_DELAY_DEFAULT_S,
    SWITCH_PROXIMITY_DEFAULT_TILES,
    SwitchPropertyData,
    SwitchTrigger,
    automaticSwitchTargetIds,
    isAutomaticSwitch,
    isWithinHours,
    parisMinutesOfDay,
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
        expect(trigger).toEqual({ type: "presence", scope: "proximity", tiles: 3, offDelay: 30 });
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
