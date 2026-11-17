import { describe, expect, it } from "vitest";
import {
    ENTITY_STATE_DEFAULT,
    SWITCH_MAX_REACH_PX,
    EntityRawPrefab,
    SWITCH_MAX_TARGETS,
    SwitchPropertyData,
    alignedSwitchValue,
    isEntityStateKey,
    isEntityStateValue,
    switchMayReach,
} from "../src";

describe("entity states", () => {
    it("knows the closed list of state keys", () => {
        expect(isEntityStateKey("on")).toBe(true);
        expect(isEntityStateKey("open")).toBe(false);
    });

    it("only accepts the two state values", () => {
        expect(isEntityStateValue("true")).toBe(true);
        expect(isEntityStateValue("false")).toBe(true);
        expect(isEntityStateValue("1")).toBe(false);
    });

    it("lights an object the server knows nothing about", () => {
        expect(ENTITY_STATE_DEFAULT).toBe("true");
    });
});

describe("alignedSwitchValue", () => {
    it("puts everything out when a target is on", () => {
        expect(alignedSwitchValue(["false", "true"])).toBe("false");
    });

    it("lights everything when no target is on", () => {
        expect(alignedSwitchValue(["false", "false"])).toBe("true");
    });

    it("has nothing to say without target", () => {
        expect(alignedSwitchValue([])).toBeUndefined();
    });
});

describe("switchMayReach", () => {
    const origin = { x: 100, y: 100 };

    it("only reaches the listed targets in ids mode", () => {
        const targets = { mode: "ids" as const, ids: ["a"] };
        expect(switchMayReach(origin, { x: 9000, y: 9000 }, targets, "a")).toBe(true);
        expect(switchMayReach(origin, { x: 100, y: 100 }, targets, "b")).toBe(false);
    });

    it("reaches up to 60 tiles on its own floor in zone mode", () => {
        const targets = { mode: "zone" as const };
        expect(SWITCH_MAX_REACH_PX).toBe(1920);
        expect(switchMayReach(origin, { x: 100 + 1920, y: 100 }, targets, "a")).toBe(true);
        expect(switchMayReach(origin, { x: 100 + 1921, y: 100 }, targets, "a")).toBe(false);
        expect(switchMayReach(origin, { x: 100, y: 100 - 1921 }, targets, "a")).toBe(false);
    });

    it("does not reach another floor in zone mode", () => {
        const targets = { mode: "zone" as const };
        expect(switchMayReach(origin, { x: 100, y: 100, elevation: 64 }, targets, "a")).toBe(false);
        expect(switchMayReach({ ...origin, elevation: 64 }, { x: 120, y: 100, elevation: 64 }, targets, "a")).toBe(
            true,
        );
    });
});

describe("SwitchPropertyData", () => {
    it("commands the lamps of its room by default", () => {
        const property = SwitchPropertyData.parse({ id: "a", type: "switchPropertyData" });
        expect(property.key).toBe("on");
        expect(property.targets).toEqual({ mode: "zone" });
    });

    it("refuses more targets than a switch may command", () => {
        const ids = Array.from({ length: SWITCH_MAX_TARGETS + 1 }, (_, index) => `e${index}`);
        expect(SWITCH_MAX_TARGETS).toBe(200);
        expect(() =>
            SwitchPropertyData.parse({ id: "a", type: "switchPropertyData", targets: { mode: "ids", ids } }),
        ).toThrow();
    });
});

describe("a catalog entry that is a switch", () => {
    const prefab = {
        id: "Lampes:interrupteur:Default:Down",
        name: "Interrupteur",
        tags: ["Lampes"],
        imagePath: "interrupteur.png",
        direction: "Down",
        color: "Default",
    };

    it("says so with `switch`, and a plain object does not", () => {
        expect(EntityRawPrefab.parse({ ...prefab, switch: true }).switch).toBe(true);
        expect(EntityRawPrefab.parse(prefab).switch).toBeUndefined();
    });

    it("fails open: an invalid `switch` leaves the object as a plain one", () => {
        expect(EntityRawPrefab.parse({ ...prefab, switch: "yes" }).switch).toBeUndefined();
    });
});
