import { SwitchTrigger } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    ANIMAL_REPORT_REPEAT_MS,
    SwitchAnimalReporter,
    sensorsWithAnimals,
} from "../../../../../src/front/Phaser/Game/Switches/SwitchAnimalReports";

const presence = (scope: "room" | "proximity", overrides = {}) =>
    SwitchTrigger.parse({ type: "presence", scope, ...overrides }) as Extract<SwitchTrigger, { type: "presence" }>;
const room = { x: 0, y: 0, width: 320, height: 320 };

describe("sensorsWithAnimals", () => {
    const sensors = [
        { id: "room", x: 160, y: 160, elevation: 0, trigger: presence("room", { areaId: "a" }), area: room },
        { id: "near", x: 1000, y: 1000, elevation: 0, trigger: presence("proximity"), area: undefined },
        { id: "upstairs", x: 160, y: 160, elevation: 64, trigger: presence("proximity"), area: undefined },
    ];

    it("is the sensors an animal stands in: the animals walk on the ground", () => {
        expect(sensorsWithAnimals(sensors, [{ x: 100, y: 100 }])).toEqual(["room"]);
        expect(
            sensorsWithAnimals(sensors, [
                { x: 100, y: 100 },
                { x: 1016, y: 1100 },
            ]),
        ).toEqual(["room", "near"]);
    });

    it("is empty without animal near a sensor", () => {
        expect(sensorsWithAnimals(sensors, [{ x: 600, y: 600 }])).toEqual([]);
        expect(sensorsWithAnimals(sensors, [])).toEqual([]);
    });
});

describe("SwitchAnimalReporter", () => {
    it("says nothing while no animal is in a sensor", () => {
        const reporter = new SwitchAnimalReporter();
        expect(reporter.next([], 0)).toBeUndefined();
        expect(reporter.next([], 10_000)).toBeUndefined();
    });

    it("reports at once when the sensors with an animal change, the last empty one included", () => {
        const reporter = new SwitchAnimalReporter();
        expect(reporter.next(["a"], 0)).toEqual(["a"]);
        expect(reporter.next(["a", "b"], 100)).toEqual(["a", "b"]);
        expect(reporter.next([], 200)).toEqual([]);
        expect(reporter.next([], 300)).toBeUndefined();
    });

    it("repeats every 2 s while an animal stays, so that the server keeps counting it", () => {
        expect(ANIMAL_REPORT_REPEAT_MS).toBe(2000);
        const reporter = new SwitchAnimalReporter();
        reporter.next(["a"], 0);
        expect(reporter.next(["a"], 1999)).toBeUndefined();
        expect(reporter.next(["a"], 2000)).toEqual(["a"]);
        expect(reporter.next(["a"], 3000)).toBeUndefined();
    });

    it("does not care about the order of the sensors", () => {
        const reporter = new SwitchAnimalReporter();
        reporter.next(["a", "b"], 0);
        expect(reporter.next(["b", "a"], 100)).toBeUndefined();
    });
});
