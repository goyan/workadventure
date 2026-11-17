import { SWITCH_MAX_TARGETS, type SwitchPropertyData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    chosenTargetsStart,
    newSwitchProperties,
    rewireSwitch,
    rewireSwitchProperties,
    selfSensorProperty,
    toggleSwitchTarget,
} from "../../../../../src/front/Phaser/Game/Switches/SwitchWiring";

const property = (targets: SwitchPropertyData["targets"]): SwitchPropertyData => ({
    id: "p",
    type: "switchPropertyData",
    key: "on",
    targets,
});

describe("toggleSwitchTarget", () => {
    it("adds an object the switch did not command", () => {
        expect(toggleSwitchTarget(property({ mode: "ids", ids: ["a"] }), "b").targets).toEqual({
            mode: "ids",
            ids: ["a", "b"],
        });
    });

    it("removes an object the switch commanded", () => {
        expect(toggleSwitchTarget(property({ mode: "ids", ids: ["a", "b"] }), "a").targets).toEqual({
            mode: "ids",
            ids: ["b"],
        });
    });

    it("starts a list from a switch that commanded its room", () => {
        expect(toggleSwitchTarget(property({ mode: "zone" }), "a").targets).toEqual({ mode: "ids", ids: ["a"] });
    });

    it("adds nothing once the switch commands as many objects as it may", () => {
        const ids = Array.from({ length: SWITCH_MAX_TARGETS }, (_, index) => `e${index}`);
        const full = property({ mode: "ids", ids });
        expect(toggleSwitchTarget(full, "more").targets).toEqual({ mode: "ids", ids });
        // It can still let one go.
        expect(toggleSwitchTarget(full, "e0").targets).toEqual({ mode: "ids", ids: ids.slice(1) });
    });

    it("leaves the property it was given untouched", () => {
        const original = property({ mode: "ids", ids: ["a"] });
        toggleSwitchTarget(original, "b");
        expect(original.targets).toEqual({ mode: "ids", ids: ["a"] });
    });
});

describe("rewireSwitch", () => {
    it("points to the copy of a target copied with the switch, and lets go of the others", () => {
        const copied = new Map([["a", "a2"]]);
        expect(rewireSwitch(property({ mode: "ids", ids: ["a", "b"] }), copied).targets).toEqual({
            mode: "ids",
            ids: ["a2"],
        });
    });

    it("leaves a switch that commands its room as it is", () => {
        const original = property({ mode: "zone" });
        expect(rewireSwitch(original, new Map([["a", "a2"]]))).toEqual(original);
    });

    it("forgets what the editor stored for the original of a copied sensor: its room and the lamps of that room", () => {
        const inRoom = { type: "presence" as const, scope: "room" as const, tiles: 3, offDelay: 30, direction: 90 };
        const original: SwitchPropertyData = {
            ...property({ mode: "zone" }),
            trigger: { ...inRoom, angle: 90, areaId: "office" },
            resolvedTargets: ["l1", "l2"],
        };

        const copy = rewireSwitch(original, new Map());

        expect(copy.resolvedTargets).toBeUndefined();
        expect(copy.trigger).toEqual({ ...inRoom, angle: 90 });
    });

    it("keeps the area somebody chose for a copied sensor", () => {
        const original: SwitchPropertyData = {
            ...property({ mode: "ids", ids: ["a"] }),
            trigger: {
                type: "presence",
                scope: "area",
                areaId: "hall",
                tiles: 3,
                offDelay: 30,
                direction: 90,
                angle: 90,
            },
        };

        expect(rewireSwitch(original, new Map([["a", "a2"]])).trigger).toEqual(original.trigger);
    });
});

describe("rewireSwitchProperties", () => {
    it("rewires the switch among the properties of a copied object, and leaves the others alone", () => {
        const audio = { id: "s", type: "playAudio" as const, audioLink: "a.mp3", buttonLabel: "Play" };
        const rewired = rewireSwitchProperties([audio, property({ mode: "ids", ids: ["a"] })], new Map([["a", "a2"]]));
        expect(rewired).toEqual([audio, property({ mode: "ids", ids: ["a2"] })]);
    });

    it("gives back nothing for an object without properties", () => {
        expect(rewireSwitchProperties(undefined, new Map())).toBeUndefined();
    });
});

describe("newSwitchProperties", () => {
    it("makes an object whose catalog entry is a switch command the lamps of its room as soon as it is placed", () => {
        expect(newSwitchProperties({ switch: true }, () => "new-id")).toEqual([
            { id: "new-id", type: "switchPropertyData", key: "on", targets: { mode: "zone" } },
        ]);
    });

    it("gives nothing to a plain object", () => {
        expect(newSwitchProperties({}, () => "new-id")).toEqual([]);
        expect(newSwitchProperties({ switch: false }, () => "new-id")).toEqual([]);
    });
});

describe("newSwitchProperties of a sensor or a timer of the catalog", () => {
    it("starts a presence sensor on its room, 30 s", () => {
        expect(newSwitchProperties({ switch: "presence" }, () => "new-id")).toEqual([
            {
                id: "new-id",
                type: "switchPropertyData",
                key: "on",
                targets: { mode: "zone" },
                trigger: { type: "presence", scope: "room", tiles: 3, offDelay: 30, direction: 90, angle: 90 },
            },
        ]);
    });

    it("starts a timer from 18:00 to 08:00", () => {
        expect(newSwitchProperties({ switch: "hours" }, () => "new-id")[0]).toMatchObject({
            trigger: { type: "hours", from: "18:00", to: "08:00" },
        });
    });
});

describe("selfSensorProperty", () => {
    it("makes a lamp light itself when somebody is within 3 tiles, and go out 30 s after", () => {
        expect(selfSensorProperty("l1", () => "new-id")).toEqual({
            id: "new-id",
            type: "switchPropertyData",
            key: "on",
            targets: { mode: "ids", ids: ["l1"] },
            trigger: { type: "presence", scope: "proximity", tiles: 3, offDelay: 30, direction: 90, angle: 90 },
        });
    });
});

describe("chosenTargetsStart", () => {
    const rgbLamp = { entityId: "lamp", getPrefab: () => ({ lamp: { kind: "rgb" as const } }) };
    const box = { entityId: "box", getPrefab: () => ({}) };

    it("starts the chosen lamps of a lamp with the lamp itself: a lamp out of any room is its own sensor", () => {
        expect(chosenTargetsStart(rgbLamp, [])).toEqual({ mode: "ids", ids: ["lamp"] });
    });

    it("starts from the lamps the switch commanded, when it commanded some", () => {
        expect(chosenTargetsStart(rgbLamp, ["a", "b"])).toEqual({ mode: "ids", ids: ["a", "b"] });
    });

    it("starts empty for an object that is not a lamp", () => {
        expect(chosenTargetsStart(box, [])).toEqual({ mode: "ids", ids: [] });
    });
});
